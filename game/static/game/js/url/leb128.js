// Minimal unsigned LEB128. §15 decode step 7 requires exactly one valid
// encoding per value -- accepting non-minimal encodings would let the same
// state produce more than one byte sequence, which breaks V-UI-B05-02.
export function encodeULEB128(value, out) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new RangeError(`value out of range for ULEB128: ${value}`);
    }
    let v = value >>> 0;
    do {
        let b = v & 0x7f;
        v >>>= 7;
        if (v) b |= 0x80;
        out.push(b);
    } while (v);
}

export function decodeULEB128(bytes, offset) {
    let result = 0;
    let shift = 0;
    let count = 0;
    let off = offset;
    while (true) {
        if (off >= bytes.length || count === 5) return null;
        const b = bytes[off++];
        count++;
        result += (b & 0x7f) * 2 ** shift;
        shift += 7;
        if (!(b & 0x80)) break;
    }
    if (count > 1 && bytes[off - 1] === 0) return null; // non-minimal continuation byte
    if (result > 0xffffffff) return null;
    return { value: result, next: off };
}
