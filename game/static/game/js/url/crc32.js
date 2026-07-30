// Standard CRC-32 (IEEE 802.3, reflected). One 256-entry table, built once at
// module load and reused -- this is the integrity check over BodyV1 (V4-09).
function buildTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
}

const TABLE = buildTable();

export function crc32(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError("crc32: expected a Uint8Array");
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}
