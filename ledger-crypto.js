// Auto-extracted from wordwallet.html by tools/build-ledger.js — do not edit by hand.
// Pure JS crypto (SHA-256, Keccak-256, secp256k1 ECDSA, EIP-55). Works in Node >= 18 and in the browser.
const enc = new TextEncoder();
const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));
const hex256 = n => n.toString(16).padStart(64, '0');

/* ---------- SHA-256 ---------- */
const PRIMES = (() => { const p = []; for (let n = 2; p.length < 64; n++) if (p.every(q => n % q)) p.push(n); return p; })();
const frac32 = x => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
const K256 = PRIMES.map(p => frac32(Math.cbrt(p)));
const H256 = PRIMES.slice(0, 8).map(p => frac32(Math.sqrt(p)));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));
function sha256(msg) {
  const l = msg.length, len = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(len); m.set(msg); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(len - 4, (l * 8) >>> 0); dv.setUint32(len - 8, Math.floor(l * 8 / 4294967296));
  const h = Uint32Array.from(H256), w = new Uint32Array(64);
  for (let off = 0; off < len; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + 4 * i);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => h[i] = (h[i] + v) | 0);
  }
  const out = new Uint8Array(32), o = new DataView(out.buffer);
  h.forEach((v, i) => o.setUint32(4 * i, v >>> 0));
  return out;
}
const sha256Hex = s => toHex(sha256(enc.encode(s)));

/* ---------- Keccak-256 (Ethereum) ---------- */
const M64 = (1n << 64n) - 1n;
const rotl = (x, n) => n ? ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64 : x;
function keccakf(s) {
  let R = 1;
  for (let r = 0; r < 24; r++) {
    const C = [], D = [];
    for (let x = 0; x < 5; x++) C[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
    for (let i = 0; i < 25; i++) s[i] ^= D[i % 5];
    let x = 1, y = 0, cur = s[1];
    for (let t = 0; t < 24; t++) {
      [x, y] = [y, (2 * x + 3 * y) % 5];
      const tmp = s[x + 5 * y]; s[x + 5 * y] = rotl(cur, ((t + 1) * (t + 2) / 2) % 64); cur = tmp;
    }
    for (let yy = 0; yy < 5; yy++) {
      const row = s.slice(5 * yy, 5 * yy + 5);
      for (let xx = 0; xx < 5; xx++) s[xx + 5 * yy] = row[xx] ^ (~row[(xx + 1) % 5] & row[(xx + 2) % 5]);
    }
    for (let j = 0; j < 7; j++) {
      R = ((R << 1) ^ ((R >> 7) * 0x71)) % 256;
      if (R & 2) s[0] ^= 1n << BigInt((1 << j) - 1);
    }
  }
}
function keccak256(msg) {
  const rate = 136, l = msg.length, len = (Math.floor(l / rate) + 1) * rate;
  const p = new Uint8Array(len); p.set(msg); p[l] ^= 0x01; p[len - 1] ^= 0x80;
  const s = Array(25).fill(0n);
  for (let off = 0; off < len; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let v = 0n;
      for (let k = 0; k < 8; k++) v |= BigInt(p[off + 8 * i + k]) << BigInt(8 * k);
      s[i] ^= v;
    }
    keccakf(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 8; k++) out[8 * i + k] = Number((s[i] >> BigInt(8 * k)) & 0xffn);
  return out;
}

/* ---------- secp256k1 ---------- */
const P = 2n ** 256n - 2n ** 32n - 977n;
const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = { x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
            y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n };
const mod = (a, m = P) => ((a % m) + m) % m;
function inv(a, m = P) {
  let [r0, r1] = [m, mod(a, m)], [s0, s1] = [0n, 1n];
  while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return mod(s0, m);
}
function ptAdd(p, q) {
  if (!p) return q; if (!q) return p;
  let lam;
  if (p.x === q.x) {
    if (mod(p.y + q.y) === 0n) return null;
    lam = mod(3n * p.x * p.x * inv(2n * p.y));
  } else lam = mod((q.y - p.y) * inv(q.x - p.x));
  const x = mod(lam * lam - p.x - q.x);
  return { x, y: mod(lam * (p.x - x) - p.y) };
}
function ptMul(k, p = G) {
  let r = null, a = p;
  while (k > 0n) { if (k & 1n) r = ptAdd(r, a); a = ptAdd(a, a); k >>= 1n; }
  return r;
}
function addressOf(pub) {
  const h = toHex(keccak256(fromHex(hex256(pub.x) + hex256(pub.y)))).slice(-40);
  const ck = toHex(keccak256(enc.encode(h)));
  return '0x' + [...h].map((c, i) => parseInt(ck[i], 16) >= 8 ? c.toUpperCase() : c).join('');
}
function keyFromPriv(d) { const pub = ptMul(d); return { d, pub, addr: addressOf(pub) }; }
const msgHash = s => BigInt('0x' + toHex(keccak256(enc.encode(s))));
function sign(d, text) {
  const z = msgHash(text);
  for (let c = 0; ; c++) {
    const k = mod(BigInt('0x' + toHex(sha256(enc.encode(hex256(d) + hex256(z) + c)))), N);
    if (!k) continue;
    const r = mod(ptMul(k).x, N); if (!r) continue;
    const s = mod(inv(k, N) * (z + r * d), N); if (!s) continue;
    return { r, s };
  }
}
function verify(pub, text, sig) {
  const { r, s } = sig;
  if (r <= 0n || r >= N || s <= 0n || s >= N) return false;
  const z = msgHash(text), w = inv(s, N);
  const X = ptAdd(ptMul(mod(z * w, N)), ptMul(mod(r * w, N), pub));
  return !!X && mod(X.x, N) === r;
}
function randBits(n = 256) {
  const b = new Uint8Array(n / 8); crypto.getRandomValues(b); return b;
}
function randKey() {
  for (;;) { const d = BigInt('0x' + toHex(randBits())); if (d > 0n && d < N) return d; }
}
function onCurve(p) { return p && p.x > 0n && p.x < P && p.y > 0n && p.y < P && mod(p.y * p.y) === mod(p.x * p.x * p.x + 7n); }
if (typeof module !== 'undefined') module.exports = { toHex, fromHex, hex256, addressOf, verify, onCurve, sign, keyFromPriv, keccak256, sha256 };
