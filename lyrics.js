import { DECRYPT, tripleDesCrypt, tripleDesKeySetup } from './vendor/des.js';
import { unzlibSync } from './vendor/fflate.js';

export function lyricText(value) {
  if (typeof value !== 'string' || !value) return '';
  if (/^[A-Fa-f0-9]+$/.test(value) && value.length % 16 === 0) {
    if (value.length > 2 * 1024 * 1024) return '';
    try {
      const data = Uint8Array.from(value.match(/../g), (x) => parseInt(x, 16));
      const keys = tripleDesKeySetup(new TextEncoder().encode('!@#)(*$%123ZXC!@!@#)(NHL'), DECRYPT);
      const out = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i += 8) out.set(tripleDesCrypt(data.subarray(i, i + 8), keys), i);
      value = new TextDecoder().decode(unzlibSync(out));
    } catch (_) { return ''; }
  } else if (!value.includes('[') && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
    try { value = new TextDecoder().decode(Uint8Array.from(atob(value), (x) => x.charCodeAt(0))); } catch (_) { return ''; }
  }
  return value.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
