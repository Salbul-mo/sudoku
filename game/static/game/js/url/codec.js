// BodyV1 (canonical byte layout) and OuterEnvelopeV1 (version, codec, CRC,
// base64url) per Phase 1 §15. The codec byte and CRC sit outside whatever
// gets compressed so decode can tell what it received before trying to
// inflate it (V4-01 removed a circular dependency that used to live here).
import { crc32 } from "./crc32.js";
import { encodeULEB128, decodeULEB128 } from "./leb128.js";
import { checkInvariants, project } from "./canonical.js";

const FORMAT_VERSION = 1;
const DECOMPRESSION_LIMIT = 65536;
const MAX_FRAGMENT_LENGTH = 8000;
const MAX_NOTE_TEXT_BYTES = 512;
const B64URL_RE = /^[A-Za-z0-9_-]*$/;

class Malformed extends Error {}

// -------------------------------------------------------------- bit packing
function pushNibbles(out, values) {
    for (let i = 0; i < values.length; i += 2) {
        const lo = values[i] & 0x0f;
        const hi = (i + 1 < values.length ? values[i + 1] : 0) & 0x0f;
        out.push(lo | (hi << 4));
    }
}

function writeCandidateBlock(candidates) {
    const present = [];
    for (let i = 0; i < 81; i++) if (candidates[i] !== 0) present.push(i);

    const bitmap = new Uint8Array(11);
    for (const i of present) bitmap[i >> 3] |= 1 << (i & 7);

    const maskBytes = [];
    let bitBuf = 0;
    let bitCount = 0;
    for (const i of present) {
        const mask = candidates[i];
        for (let b = 0; b < 9; b++) {
            bitBuf |= ((mask >> b) & 1) << bitCount;
            bitCount++;
            if (bitCount === 8) { maskBytes.push(bitBuf); bitBuf = 0; bitCount = 0; }
        }
    }
    if (bitCount > 0) maskBytes.push(bitBuf);
    return [...bitmap, ...maskBytes];
}

function readCandidateBlock(cursor) {
    const bitmap = cursor.bytesN(11);
    if (bitmap[10] & 0xfe) throw new Malformed(); // upper 7 bits of the 88-bit bitmap are unused
    const present = [];
    for (let i = 0; i < 81; i++) if ((bitmap[i >> 3] >> (i & 7)) & 1) present.push(i);

    const maskByteCount = Math.ceil((present.length * 9) / 8);
    const maskBytes = cursor.bytesN(maskByteCount);
    const candidates = new Uint16Array(81);
    let bitPos = 0;
    for (const i of present) {
        let mask = 0;
        for (let b = 0; b < 9; b++) {
            const byteIdx = bitPos >> 3;
            const bitIdx = bitPos & 7;
            mask |= ((maskBytes[byteIdx] >> bitIdx) & 1) << b;
            bitPos++;
        }
        if (mask === 0) throw new Malformed(); // a present cell always has >=1 candidate bit
        candidates[i] = mask;
    }
    const totalBits = maskByteCount * 8;
    for (let p = present.length * 9; p < totalBits; p++) {
        const byteIdx = p >> 3;
        const bitIdx = p & 7;
        if ((maskBytes[byteIdx] >> bitIdx) & 1) throw new Malformed(); // trailing pad must be 0
    }
    return candidates;
}

function readNoteBlock(cursor) {
    const countResult = decodeULEB128(cursor.bytes, cursor.pos);
    if (!countResult) throw new Malformed();
    cursor.pos = countResult.next;
    if (countResult.value > 108) throw new Malformed();

    const decoder = new TextDecoder("utf-8", { fatal: true });
    const notes = [];
    for (let n = 0; n < countResult.value; n++) {
        const kind = cursor.u8();
        const key = cursor.u8();
        const lenResult = decodeULEB128(cursor.bytes, cursor.pos);
        if (!lenResult) throw new Malformed();
        cursor.pos = lenResult.next;
        const utf8 = cursor.bytesN(lenResult.value);
        let text;
        try {
            text = decoder.decode(utf8);
        } catch {
            throw new Malformed();
        }
        if (utf8.length > MAX_NOTE_TEXT_BYTES) throw new Malformed();
        notes.push({ kind, key, text });
    }
    for (let i = 1; i < notes.length; i++) {
        const prev = notes[i - 1];
        const cur = notes[i];
        const strictlyIncreasing = prev.kind < cur.kind || (prev.kind === cur.kind && prev.key < cur.key);
        if (!strictlyIncreasing) throw new Malformed(); // order violation or duplicate (kind, key) target
    }
    return notes;
}

class Cursor {
    constructor(bytes) {
        this.bytes = bytes;
        this.pos = 0;
    }

    u8() {
        if (this.pos >= this.bytes.length) throw new Malformed();
        return this.bytes[this.pos++];
    }

    bytesN(n) {
        if (this.pos + n > this.bytes.length) throw new Malformed();
        const out = this.bytes.subarray(this.pos, this.pos + n);
        this.pos += n;
        return out;
    }

    u32le() {
        const b = this.bytesN(4);
        return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
    }

    nibbles(count) {
        const nBytes = Math.ceil(count / 2);
        const chunk = this.bytesN(nBytes);
        const out = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            const byte = chunk[i >> 1];
            const nibble = (i & 1) === 0 ? (byte & 0x0f) : ((byte >> 4) & 0x0f);
            if (nibble > 9) throw new Malformed();
            out[i] = nibble;
        }
        if (count % 2 === 1 && ((chunk[nBytes - 1] >> 4) & 0x0f) !== 0) throw new Malformed();
        return out;
    }

    atEnd() {
        return this.pos === this.bytes.length;
    }
}

// ------------------------------------------------------------------ BodyV1
export function writeBody(state) {
    const out = [];
    const flags = (state.values ? 1 : 0) | (state.candidates ? 2 : 0)
        | (state.notes ? 4 : 0) | (state.savedAt != null ? 8 : 0);
    out.push(flags, 9);
    if (state.savedAt != null) {
        const v = state.savedAt >>> 0;
        out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    }
    pushNibbles(out, state.givens);
    if (state.values) pushNibbles(out, state.values);
    if (state.candidates) out.push(...writeCandidateBlock(state.candidates));
    if (state.notes) {
        encodeULEB128(state.notes.length, out);
        const encoder = new TextEncoder();
        for (const n of state.notes) {
            out.push(n.kind, n.key);
            const utf8 = encoder.encode(n.text);
            encodeULEB128(utf8.length, out);
            for (const b of utf8) out.push(b);
        }
    }
    return Uint8Array.from(out);
}

export function readBody(bytes) {
    try {
        const cursor = new Cursor(bytes);
        const flags = cursor.u8();
        if (flags & 0xf0) throw new Malformed();
        if (cursor.u8() !== 9) throw new Malformed();
        const savedAt = flags & 8 ? cursor.u32le() : null;
        const givens = cursor.nibbles(81);
        const values = flags & 1 ? cursor.nibbles(81) : null;
        const candidates = flags & 2 ? readCandidateBlock(cursor) : null;
        const notes = flags & 4 ? readNoteBlock(cursor) : null;
        if (!cursor.atEnd()) throw new Malformed();
        const state = { givens, values, candidates, notes, savedAt };
        const check = checkInvariants(state);
        if (!check.ok) return { ok: false, code: check.code, message: check.code };
        return { ok: true, state };
    } catch (e) {
        if (e instanceof Malformed) return { ok: false, code: "malformed-body", message: "malformed BodyV1" };
        throw e;
    }
}

// ---------------------------------------------------------- OuterEnvelopeV1
function le32(n) {
    const v = n >>> 0;
    return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function le32At(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function base64urlEncode(bytes) {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
    const standard = str.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (standard.length % 4)) % 4;
    if (padLength === 3) return null; // a base64 group can never leave exactly 1 leftover char
    let binary;
    try {
        binary = atob(standard + "=".repeat(padLength));
    } catch {
        return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function resolveStreams(deps) {
    const Compression = deps && "CompressionStream" in deps ? deps.CompressionStream : globalThis.CompressionStream;
    const Decompression = deps && "DecompressionStream" in deps ? deps.DecompressionStream : globalThis.DecompressionStream;
    return { Compression, Decompression };
}

async function concatBytes(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    return out;
}

async function tryDeflateRaw(body, deps) {
    const { Compression } = resolveStreams(deps);
    if (!Compression) return null;
    const cs = new Compression("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(body);
    writer.close();
    const chunks = [];
    for await (const chunk of cs.readable) chunks.push(chunk);
    return concatBytes(chunks);
}

const UNSUPPORTED = Symbol("unsupported-codec");
const OVERFLOW = Symbol("decompression-limit");

async function inflateRawLimited(payload, limit, deps) {
    const { Decompression } = resolveStreams(deps);
    if (!Decompression) return UNSUPPORTED;
    const ds = new Decompression("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(payload);
    writer.close();
    const reader = ds.readable.getReader();
    let total = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit) {
            await reader.cancel();
            return OVERFLOW;
        }
        chunks.push(value);
    }
    return concatBytes(chunks);
}

export async function encode(session, scope, savedAt, deps) {
    const state = project(session, scope, savedAt);
    const body = writeBody(state);
    const crc = crc32(body);
    const packed = await tryDeflateRaw(body, deps);
    const usePacked = packed !== null && packed.length < body.length;
    const payload = usePacked ? packed : body;
    const out = [FORMAT_VERSION, usePacked ? 1 : 0, ...payload, ...le32(crc)];
    return base64urlEncode(Uint8Array.from(out));
}

export async function decode(fragment, deps) {
    if (fragment.length > MAX_FRAGMENT_LENGTH) {
        return { ok: false, code: "too-long", message: "fragment exceeds 8000 characters" };
    }
    if (!B64URL_RE.test(fragment)) {
        return { ok: false, code: "invalid-base64", message: "fragment is not valid base64url" };
    }
    const bytes = base64urlDecode(fragment);
    if (!bytes || bytes.length < 6) {
        return { ok: false, code: "malformed-body", message: "envelope too short" };
    }
    if (bytes[0] !== FORMAT_VERSION) {
        return { ok: false, code: "unsupported-version", message: `formatVersion ${bytes[0]}` };
    }
    const codec = bytes[1];
    if (codec > 1) return { ok: false, code: "unsupported-codec", message: `codec ${codec}` };

    const payload = bytes.subarray(2, bytes.length - 4);
    const trailer = le32At(bytes, bytes.length - 4);
    let body;
    if (codec === 0) {
        body = payload;
    } else {
        const result = await inflateRawLimited(payload, DECOMPRESSION_LIMIT, deps);
        if (result === UNSUPPORTED) return { ok: false, code: "unsupported-codec", message: "deflate-raw unsupported" };
        if (result === OVERFLOW) return { ok: false, code: "decompression-limit", message: "decompressed output too large" };
        body = result;
    }
    if (crc32(body) !== trailer) return { ok: false, code: "crc-mismatch", message: "CRC32 mismatch" };
    return readBody(body);
}
