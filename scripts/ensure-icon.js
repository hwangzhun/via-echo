/**
 * Ensures icons/icon.ico exists for Windows build (tauri-build requires it).
 * Writes a minimal valid 16x16 32bpp ICO if missing.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");
const iconsDir = path.join(root, "src-tauri", "icons");
const icoPath = path.join(iconsDir, "icon.ico");
const pngPath = path.join(iconsDir, "icon.png");

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

if (!fs.existsSync(pngPath)) {
  const size = 128;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const at = row + 1 + x * 4;
      const radius = 25;
      const dx = Math.max(radius - x, 0, x - (size - radius - 1));
      const dy = Math.max(radius - y, 0, y - (size - radius - 1));
      const inside = dx * dx + dy * dy <= radius * radius;
      const keyX = Math.floor((x - 18) / 24);
      const keyY = Math.floor((y - 18) / 24);
      const inGrid = x >= 18 && y >= 18 && keyX >= 0 && keyX < 4 && keyY >= 0 && keyY < 4;
      const inKey = inGrid && (x - 18) % 24 < 18 && (y - 18) % 24 < 18;
      const rgb = inKey ? [112, 224, 172] : [18, 24, 32];
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
      raw[at + 3] = inside ? 255 : 0;
    }
  }
  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", Buffer.from([0, 0, 0, size, 0, 0, 0, size, 8, 6, 0, 0, 0])),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(pngPath, png);
  console.log("Created", pngPath);
}

if (!fs.existsSync(icoPath)) {
  // Minimal valid ICO: 6 header + 16 dir entry + 40 DIB header + pixel data + AND mask
  const W = 16, H = 16;
  const pixelDataSize = W * H * 4;           // 1024 bytes (32bpp BGRA)
  const andMaskRowBytes = Math.ceil(W / 8);
  const andMaskRowPadded = Math.ceil(andMaskRowBytes / 4) * 4;
  const andMaskSize = andMaskRowPadded * H;   // 64 bytes
  const dibHeaderSize = 40;
  const imageDataSize = dibHeaderSize + pixelDataSize + andMaskSize; // 1128

  // ICO file header (6 bytes)
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0);   // reserved
  icoHeader.writeUInt16LE(1, 2);   // type = 1 (ICO)
  icoHeader.writeUInt16LE(1, 4);   // image count = 1

  // ICO directory entry (16 bytes)
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(W, 0);          // width
  dirEntry.writeUInt8(H, 1);          // height
  dirEntry.writeUInt8(0, 2);          // color count (0 = no palette)
  dirEntry.writeUInt8(0, 3);          // reserved
  dirEntry.writeUInt16LE(1, 4);       // color planes
  dirEntry.writeUInt16LE(32, 6);      // bits per pixel
  dirEntry.writeUInt32LE(imageDataSize, 8);  // image data size
  dirEntry.writeUInt32LE(6 + 16, 12);        // offset to image data (22)

  // BITMAPINFOHEADER (40 bytes)
  const dibHeader = Buffer.alloc(dibHeaderSize);
  dibHeader.writeUInt32LE(40, 0);     // header size
  dibHeader.writeInt32LE(W, 4);       // width
  dibHeader.writeInt32LE(H * 2, 8);   // height * 2 (ICO format: XOR + AND)
  dibHeader.writeUInt16LE(1, 12);     // planes
  dibHeader.writeUInt16LE(32, 14);    // bits per pixel
  dibHeader.writeUInt32LE(0, 20);     // image size (can be 0 for uncompressed)

  // Pixel data (32bpp BGRA, bottom-up)
  const pixels = Buffer.alloc(pixelDataSize);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const isKey = x >= 2 && x < 14 && y >= 2 && y < 14 && x % 3 < 2 && y % 3 < 2;
      pixels[i + 0] = isKey ? 0xac : 0x20;
      pixels[i + 1] = isKey ? 0xe0 : 0x18;
      pixels[i + 2] = isKey ? 0x70 : 0x12;
      pixels[i + 3] = 0xff;
    }
  }

  // AND mask (all zeros = fully opaque)
  const andMask = Buffer.alloc(andMaskSize);

  fs.writeFileSync(icoPath, Buffer.concat([icoHeader, dirEntry, dibHeader, pixels, andMask]));
  console.log("Created", icoPath);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}
