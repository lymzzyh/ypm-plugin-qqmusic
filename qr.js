import { unzlibSync } from './vendor/fflate.js';
import jsQR from './vendor/jsqr.js';

// 仅解码登录网关使用的非交错 PNG，限制尺寸及解压大小，避免不可信图片占满内存。
export function decodeQr(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) throw new Error('Invalid PNG');
  let width, height, depth, type, palette = null;
  const chunks = [];
  for (let pos = 8; pos + 12 <= bytes.length;) {
    const length = view.getUint32(pos);
    if (length > bytes.length - pos - 12) throw new Error('Truncated PNG');
    const name = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (name === 'IHDR') {
      if (length !== 13) throw new Error('Invalid IHDR');
      width = view.getUint32(pos + 8); height = view.getUint32(pos + 12);
      depth = data[8]; type = data[9];
      if (data[12] !== 0 || !width || !height || width > 1024 || height > 1024 || ![1, 2, 4, 8].includes(depth) || ![0, 2, 3, 4, 6].includes(type) || (type !== 0 && type !== 3 && depth !== 8)) throw new Error('Unsupported PNG');
    } else if (name === 'PLTE') palette = data;
    else if (name === 'IDAT') chunks.push(data);
    else if (name === 'IEND') break;
    pos += length + 12;
  }
  if (!width || !chunks.length) throw new Error('Incomplete PNG');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const stride = Math.ceil(width * channels * depth / 8), bpp = Math.max(1, channels * depth / 8);
  const compressed = new Uint8Array(chunks.reduce((n, x) => n + x.length, 0));
  let start = 0;
  for (const chunk of chunks) { compressed.set(chunk, start); start += chunk.length; }
  const raw = unzlibSync(compressed, { out: new Uint8Array((stride + 1) * height) });
  if (raw.length !== (stride + 1) * height) throw new Error('Invalid PNG size');
  const scan = new Uint8Array(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
    return x <= y && x <= z ? a : y <= z ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? scan[y * stride + x - bpp] : 0;
      const up = y ? scan[(y - 1) * stride + x] : 0;
      const corner = y && x >= bpp ? scan[(y - 1) * stride + x - bpp] : 0;
      const add = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter];
      scan[y * stride + x] = raw[y * (stride + 1) + 1 + x] + add;
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pos = y * stride + Math.floor(x * channels * depth / 8);
    const value = depth === 8 ? scan[pos] : (scan[pos] >>> (8 - depth - (x * depth % 8))) & ((1 << depth) - 1);
    const at = (y * width + x) * 4;
    if (type === 0 || type === 4) rgba[at] = rgba[at + 1] = rgba[at + 2] = value * (depth < 8 ? 255 / ((1 << depth) - 1) : 1);
    else if (type === 3) {
      if (!palette || value * 3 + 2 >= palette.length) throw new Error('Invalid PNG palette');
      rgba.set(palette.subarray(value * 3, value * 3 + 3), at);
    } else rgba.set(scan.subarray(pos, pos + 3), at);
    rgba[at + 3] = 255;
  }
  const result = jsQR(rgba, width, height);
  if (!result?.data) throw new Error('QR code not found');
  return result.data;
}
