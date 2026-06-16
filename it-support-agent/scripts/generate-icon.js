'use strict';

/*
 * 외부 의존성 없이 트레이용 PNG 아이콘을 생성한다.
 * 32x32 RGBA, 둥근 사각형 배경(브랜드 블루) + 흰색 말풍선 + 점 3개.
 * 결과: resources/tray-icon.png
 *
 * 실행: npm run icon
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;

// 색상 (R,G,B,A)
const BRAND = [11, 95, 255, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

// RGBA 픽셀 버퍼
const px = Buffer.alloc(SIZE * SIZE * 4);

function set(x, y, c) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = c[3];
}

// 둥근 사각형 배경
const radius = 7;
function inRoundedRect(x, y, pad) {
  const min = pad;
  const max = SIZE - 1 - pad;
  if (x < min || x > max || y < min || y > max) return false;
  const r = radius;
  const corners = [
    [min + r, min + r],
    [max - r, min + r],
    [min + r, max - r],
    [max - r, max - r],
  ];
  // 모서리 영역이면 원 안쪽인지 검사
  const nearLeft = x < min + r;
  const nearRight = x > max - r;
  const nearTop = y < min + r;
  const nearBottom = y > max - r;
  if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
    const cx = nearLeft ? min + r : max - r;
    const cy = nearTop ? min + r : max - r;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }
  return true;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    set(x, y, inRoundedRect(x, y, 1) ? BRAND : CLEAR);
  }
}

// 흰색 말풍선 (둥근 사각형 + 꼬리)
function inBubble(x, y) {
  const bx0 = 8, by0 = 9, bx1 = 23, by1 = 19;
  const r = 3;
  if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) {
    const nearL = x < bx0 + r, nearR = x > bx1 - r;
    const nearT = y < by0 + r, nearB = y > by1 - r;
    if ((nearL || nearR) && (nearT || nearB)) {
      const cx = nearL ? bx0 + r : bx1 - r;
      const cy = nearT ? by0 + r : by1 - r;
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    }
    return true;
  }
  // 꼬리
  if (y >= by1 && y <= by1 + 4) {
    const w = by1 + 4 - y;
    if (x >= 11 && x <= 11 + w) return true;
  }
  return false;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (inBubble(x, y)) set(x, y, WHITE);
  }
}

// 말풍선 안 점 3개 (브랜드색)
for (const cx of [12, 16, 20]) {
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      set(cx + dx, 14 + dy, BRAND);
    }
  }
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

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// 스캔라인(각 행 앞에 필터 바이트 0)
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = zlib.deflateSync(raw);

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'resources');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'tray-icon.png');
fs.writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
