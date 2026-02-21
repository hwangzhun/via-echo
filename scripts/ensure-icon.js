/**
 * Ensures icons/icon.ico exists for Windows build (tauri-build requires it).
 * Writes a minimal valid 16x16 32bpp ICO if missing.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");
const iconsDir = path.join(root, "src-tauri", "icons");
const icoPath = path.join(iconsDir, "icon.ico");

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
  for (let i = 0; i < W * H; i++) {
    pixels[i * 4 + 0] = 0x9a;  // B
    pixels[i * 4 + 1] = 0x6b;  // G
    pixels[i * 4 + 2] = 0x44;  // R
    pixels[i * 4 + 3] = 0xff;  // A
  }

  // AND mask (all zeros = fully opaque)
  const andMask = Buffer.alloc(andMaskSize);

  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
  fs.writeFileSync(icoPath, Buffer.concat([icoHeader, dirEntry, dibHeader, pixels, andMask]));
  console.log("Created", icoPath);
}
