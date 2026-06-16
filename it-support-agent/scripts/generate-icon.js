'use strict';

/*
 * 외부 의존성 없이 PNG 아이콘을 생성한다.
 * 둥근 사각형 배경(브랜드 블루) + 흰색 말풍선 + 점 3개.
 *
 *  - resources/icon.png       256x256  앱/설치(electron-builder) 아이콘 (>=256 필요)
 *  - resources/tray-icon.png   32x32    시스템 트레이 아이콘
 *
 * 실행: npm run icon
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BRAND = [11, 95, 255, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

/** 주어진 크기로 아이콘을 렌더링하여 PNG 버퍼를 반환 */
function render(size) {
  const f = size / 32; // 32x32 기준 좌표를 비례 확대
  const px = Buffer.alloc(size * size * 4);

  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    px[i + 3] = c[3];
  };

  // 둥근 사각형 배경
  const pad = 1 * f;
  const radius = 7 * f;
  const inRoundedRect = (x, y) => {
    const min = pad;
    const max = size - 1 - pad;
    if (x < min || x > max || y < min || y > max) return false;
    const r = radius;
    const nearL = x < min + r, nearR = x > max - r;
    const nearT = y < min + r, nearB = y > max - r;
    if ((nearL || nearR) && (nearT || nearB)) {
      const cx = nearL ? min + r : max - r;
      const cy = nearT ? min + r : max - r;
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    }
    return true;
  };

  // 흰색 말풍선 (둥근 사각형 + 꼬리)
  const bx0 = 8 * f, by0 = 9 * f, bx1 = 23 * f, by1 = 19 * f, br = 3 * f;
  const inBubble = (x, y) => {
    if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) {
      const nearL = x < bx0 + br, nearR = x > bx1 - br;
      const nearT = y < by0 + br, nearB = y > by1 - br;
      if ((nearL || nearR) && (nearT || nearB)) {
        const cx = nearL ? bx0 + br : bx1 - br;
        const cy = nearT ? by0 + br : by1 - br;
        return (x - cx) ** 2 + (y - cy) ** 2 <= br * br;
      }
      return true;
    }
    // 꼬리
    if (y >= by1 && y <= by1 + 4 * f) {
      const w = by1 + 4 * f - y;
      if (x >= 11 * f && x <= 11 * f + w) return true;
    }
    return false;
  };

  // 말풍선 안 점 3개
  const dotR = Math.max(1, 1.2 * f);
  const dots = [[12 * f, 14 * f], [16 * f, 14 * f], [20 * f, 14 * f]];
  const inDot = (x, y) => dots.some(([dx, dy]) => (x - dx) ** 2 + (y - dy) ** 2 <= dotR * dotR);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = CLEAR;
      if (inRoundedRect(x + 0.5, y + 0.5)) c = BRAND;
      if (inBubble(x + 0.5, y + 0.5)) c = WHITE;
      if (inDot(x + 0.5, y + 0.5)) c = BRAND;
      set(x, y, c);
    }
  }

  return encodePng(size, px);
}

// ── PNG 인코딩 ──────────────────────────────────────────
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    px.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── 출력 ────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'resources');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon.png', 256],
  ['tray-icon.png', 32],
];
for (const [name, size] of targets) {
  const buf = render(size);
  const out = path.join(outDir, name);
  fs.writeFileSync(out, buf);
  console.log(`Wrote ${out} (${size}x${size}, ${buf.length} bytes)`);
}
