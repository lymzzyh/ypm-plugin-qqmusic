// QQ 音乐请求签名；纯 JavaScript，可在 QuickJS 中运行。
export function hash33(text, seed = 0) {
  let n = seed;
  for (let i = 0; i < text.length; i++) n = (n * 33 + text.charCodeAt(i)) | 0;
  return n & 0x7fffffff;
}

export function sha1(text) {
  const input = new TextEncoder().encode(text);
  const size = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(size);
  bytes.set(input); bytes[input.length] = 128;
  const view = new DataView(bytes.buffer);
  view.setUint32(size - 4, input.length * 8);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476, e = 0xc3d2e1f0;
  const rotate = (n, s) => (n << s) | (n >>> (32 - s));
  for (let block = 0; block < size; block += 64) {
    const w = new Int32Array(80);
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(block + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let x = a, y = b, z = c, u = d, v = e;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (y & z) | (~y & u) : i < 40 ? y ^ z ^ u : i < 60 ? (y & z) | (y & u) | (z & u) : y ^ z ^ u;
      const k = i < 20 ? 0x5a827999 : i < 40 ? 0x6ed9eba1 : i < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const n = (rotate(x, 5) + f + v + k + w[i]) | 0;
      v = u; u = z; z = rotate(y, 30); y = x; x = n;
    }
    a = (a + x) | 0; b = (b + y) | 0; c = (c + z) | 0; d = (d + u) | 0; e = (e + v) | 0;
  }
  return [a, b, c, d, e].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

export function sign(text) {
  const hex = sha1(text).toUpperCase();
  const first = [23, 14, 6, 36, 16, 7, 19].map((i) => hex[i]).join('');
  const last = [16, 1, 32, 12, 19, 27, 8, 5].map((i) => hex[i]).join('');
  const mask = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];
  const encoded = btoa(String.fromCharCode(...mask.map((n, i) => n ^ parseInt(hex.slice(i * 2, i * 2 + 2), 16)))).replace(/[\\/+=]/g, '');
  return `zzc${first}${encoded}${last}`.toLowerCase();
}
