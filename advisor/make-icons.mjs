/* Generates advisor PNG icons with no external dependencies (Node zlib only).
   Navy background (#0a0e1a) + gold rising-trend glyph (#d4a574).
   Run: node advisor/make-icons.mjs */
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'assets', 'icons');
mkdirSync(outDir, { recursive: true });

const NAVY = [10, 14, 26];
const GOLD = [212, 165, 116];

function makePNG(size, inset) {
  // inset = fraction kept clear around the glyph (maskable safe zone)
  const W = size, H = size;
  const buf = Buffer.alloc(W * H * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = a;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, NAVY);

  const pad = Math.round(size * inset);
  const bx = pad, by = pad, bw = size - pad * 2, bh = size - pad * 2;
  const t = Math.max(2, Math.round(bw * 0.11)); // stroke thickness

  const fill = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(Math.round(x), Math.round(y), GOLD);
  };

  // rising trend line: three segments up-down-up ending high (like a chart)
  const pts = [
    [bx, by + bh * 0.85],
    [bx + bw * 0.35, by + bh * 0.45],
    [bx + bw * 0.55, by + bh * 0.62],
    [bx + bw * 0.98, by + bh * 0.05],
  ];
  const drawLine = (x0, y0, x1, y1) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      fill(x - t / 2, y - t / 2, t, t);
    }
  };
  for (let i = 0; i < pts.length - 1; i++) drawLine(...pts[i], ...pts[i + 1]);

  // arrow head on the final segment
  const [hx, hy] = pts[3];
  const ah = t * 2.6;
  for (let dy = 0; dy < ah; dy++) fill(hx - dy, hy + dy - t / 2, dy + 1, t);
  for (let dx = 0; dx < ah; dx++) fill(hx - dx - t / 2, hy, t, dx + 1);

  // baseline
  fill(bx, by + bh - t, bw, t);

  return encodePNG(W, H, buf);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter type none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

writeFileSync(join(outDir, 'icon-192.png'), makePNG(192, 0.22));
writeFileSync(join(outDir, 'icon-512.png'), makePNG(512, 0.22));
writeFileSync(join(outDir, 'icon-maskable-512.png'), makePNG(512, 0.30));
console.log('Icons written to', outDir);
