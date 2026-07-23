// Generates the extension icons (public/icon/{16,32,48,128}.png) — a white
// bookmark glyph on a rounded accent tile. Pure Node: a minimal RGBA-PNG
// encoder (zlib for IDAT, CRC32 for chunks), no image dependencies. Re-run with
// `npm run gen:icons` after tweaking the colors/shape below.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');

const BG = [0x46, 0xbe, 0xa0]; // accent (teal)
const FG = [0x0c, 0x0f, 0x14]; // bookmark ribbon (deep navy, matches theme bg)

function render(n) {
  const buf = Buffer.alloc(n * n * 4); // RGBA
  const r = n * 0.22; // corner radius

  // Bookmark ribbon geometry.
  const gx0 = n * 0.34,
    gx1 = n * 0.66;
  const gy0 = n * 0.22,
    gy1 = n * 0.8;
  const notch = n * 0.6; // where the V-cut begins
  const halfW = (gx1 - gx0) / 2;
  const cx = (gx0 + gx1) / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      let color = null;
      let alpha = 0;

      // Rounded-square background.
      if (insideRounded(x + 0.5, y + 0.5, n, r)) {
        color = BG;
        alpha = 255;
      }

      // White ribbon on top.
      if (x + 0.5 >= gx0 && x + 0.5 <= gx1 && y + 0.5 >= gy0 && y + 0.5 <= gy1) {
        const cut = y + 0.5 > notch ? ((y + 0.5 - notch) / (gy1 - notch)) * halfW : 0;
        if (Math.abs(x + 0.5 - cx) > cut) {
          color = FG;
          alpha = 255;
        }
      }

      if (color) {
        buf[i] = color[0];
        buf[i + 1] = color[1];
        buf[i + 2] = color[2];
        buf[i + 3] = alpha;
      }
    }
  }
  return buf;
}

function insideRounded(x, y, n, r) {
  const nx = Math.min(x, n - x);
  const ny = Math.min(y, n - y);
  if (nx >= r || ny >= r) return x >= 0 && x <= n && y >= 0 && y <= n;
  const dx = r - nx;
  const dy = r - ny;
  return dx * dx + dy * dy <= r * r;
}

// --- Minimal PNG encoder ----------------------------------------------------

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(n, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Raw image: each scanline prefixed with filter byte 0.
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    rgba.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const n of SIZES) {
  writeFileSync(join(OUT_DIR, `${n}.png`), encodePng(n, render(n)));
  console.log(`icon/${n}.png`);
}
