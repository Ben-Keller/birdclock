// A small, uncompressed ZIP writer. Images are already compressed, so storing
// them directly keeps batch downloads fast and avoids a runtime dependency.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

export async function createZip(files) {
  const localParts = [],
    directory = [],
    names = new Set();
  let offset = 0,
    directorySize = 0;
  for (const { name, blob } of files) {
    if (
      !name ||
      /[\\\x00]/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some((part) => part === '..') ||
      names.has(name)
    ) {
      throw new Error(
        'The download contains an invalid or duplicate filename.',
      );
    }
    names.add(name);
    const filename = encoder.encode(name),
      bytes = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + filename.length),
      lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // ZIP 2.0
    lv.setUint16(6, 0x0800, true); // UTF-8 filenames
    lv.setUint16(12, 33, true); // January 1, 1980 (deterministic archive date)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true);
    lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, filename.length, true);
    local.set(filename, 30);
    localParts.push(local, bytes);

    const central = new Uint8Array(46 + filename.length),
      cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, bytes.length, true);
    cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, filename.length, true);
    cv.setUint32(42, offset, true);
    central.set(filename, 46);
    directory.push(central);
    directorySize += central.length;
    offset += local.length + bytes.length;
  }
  const end = new Uint8Array(22),
    ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...localParts, ...directory, end], {
    type: 'application/zip',
  });
}
