// Generate raster icon assets from the SVG source.
//
// Usage: node scripts/generate-icons.mjs
//
// Reads `public/logo.svg` and writes:
//   public/icon-192.png
//   public/icon-512.png
//   public/apple-touch-icon.png   (180x180)
//   public/favicon-32.png         (32x32)
//   public/logo.png               (1024x1024 master)
//   src/app/icon.png              (32x32, Next.js auto-icon)
//   src/app/apple-icon.png        (180x180, Next.js auto-icon)
//
// Requires `sharp`. Install once with `npm i -D sharp` (or use the no-save
// flow we used during initial generation).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "public", "logo.svg");

const TARGETS = [
  { out: "public/icon-192.png", size: 192 },
  { out: "public/icon-512.png", size: 512 },
  { out: "public/apple-touch-icon.png", size: 180 },
  { out: "public/favicon-32.png", size: 32 },
  { out: "public/logo.png", size: 1024 },
  { out: "src/app/icon.png", size: 32 },
  { out: "src/app/apple-icon.png", size: 180 },
];

const svg = await readFile(SRC);

for (const { out, size } of TARGETS) {
  const dest = path.join(ROOT, out);
  const buf = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(dest, buf);
  console.log(`✓ ${out} (${size}×${size}, ${buf.length} bytes)`);
}

console.log("Done.");
