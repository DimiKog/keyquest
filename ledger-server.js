// SignedLedger server — zero dependencies (Node >= 18). A *virtual* ledger for teaching:
// it checks signatures, nonces and balances, and shows every accepted AND rejected transaction.
// It is a single trusted server on purpose (compare with a blockchain network).
//   PORT=8788 ALLOW_ORIGIN=https://<user>.github.io ADMIN_TOKEN=secret node ledger-server.js
const http = require('http'), fs = require('fs'), crypto = require('crypto');
const C = require('./ledger-crypto.js');

const PORT = +process.env.PORT || 8788;
const HOST = process.env.HOST || '127.0.0.1';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const FILE = process.env.DATA_FILE || './ledger-data.json';
const START_COINS = 100, MAX_ACCTS = 200, MAX_TX = 500, MAX_REJ = 40, MAX_BODY = 3000, MAX_AMOUNT = 1000000;
const RATE = { windowMs: 60000, max: 30 };

let db = { accts: {}, txs: [], rej: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
let dirty = false;
setInterval(() => { if (dirty) { fs.writeFileSync(FILE, JSON.stringify(db)); dirty = false; } }, 3000);

const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  h.push(now); hits.set(ip, h); return h.length > RATE.max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < RATE.windowMs)) hits.delete(k); }, 60000);

const ADDR = /^0x[0-9a-f]{40}$/, HEX = (n) => new RegExp('^[0-9a-f]{' + n + '}$');
const NICK = /^[\p{L}\p{N} _.-]{1,24}$/u, MEMO = /^[\p{L}\p{N} _.,:!?+-]{0,40}$/u;
const pubOf = h => ({ x: BigInt('0x' + h.slice(0, 64)), y: BigInt('0x' + h.slice(64)) });
function sigOk(pubHex, text, b) {
  if (!HEX(64).test(b.r || '') || !HEX(64).test(b.s || '')) return false;
  const pub = pubOf(pubHex); if (!C.onCurve(pub)) return false;
  return C.verify(pub, text, { r: BigInt('0x' + b.r), s: BigInt('0x' + b.s) });
}
const short = a => a.slice(0, 8) + '…' + a.slice(-4);
const name = a => (db.accts[a] ? db.accts[a].nick : short(a));

function send(res, code, obj) {
  res.writeHead(code, {
    'content-type': 'application/json', 'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-headers': 'content-type,x-admin-token', 'access-control-allow-methods': 'GET,POST,OPTIONS',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((ok, no) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { no(new Error('too large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString() || '{}')); } catch (e) { no(new Error('bad json')); } });
  });
}
const publicState = () => ({
  start: START_COINS,
  accts: Object.entries(db.accts).map(([addr, a]) => ({ addr, nick: a.nick, bal: a.bal, nonce: a.nonce })),
  txs: db.txs, rej: db.rej
});
function reject(res, tx, reason) {
  db.rej.push({ t: Date.now(), from: name(tx.from), to: name(tx.to), amount: tx.amount, nonce: tx.nonce, reason });
  db.rej = db.rej.slice(-MAX_REJ); dirty = true;
  return send(res, 422, { error: reason });
}

http.createServer(async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (req.method === 'GET' && req.url === '/state') return send(res, 200, publicState());
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, accts: Object.keys(db.accts).length, txs: db.txs.length });
    if (req.method === 'POST' && req.url === '/admin/clear') {
      if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return send(res, 403, { error: 'forbidden' });
      db = { accts: {}, txs: [], rej: [] }; dirty = true; return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && (req.url === '/join' || req.url === '/tx')) {
      if (limited(ip)) return send(res, 429, { error: 'slow down — too many requests' });
      const b = await body(req);

      if (req.url === '/join') {
        const addr = String(b.addr || '').toLowerCase();
        if (!ADDR.test(addr) || !HEX(128).test(b.pub || '') || typeof b.nick !== 'string' || !NICK.test(b.nick))
          return send(res, 400, { error: 'invalid join request' });
        if (db.accts[addr]) return send(res, 200, { ok: true, already: true });
        if (Object.keys(db.accts).length >= MAX_ACCTS) return send(res, 507, { error: 'ledger is full' });
        if (C.addressOf(pubOf(b.pub)).toLowerCase() !== addr) return send(res, 422, { error: 'public key does not match address' });
        if (!sigOk(b.pub, `Ledger-v1|join|${addr}|${b.nick}`, b)) return send(res, 422, { error: 'bad signature on join' });
        db.accts[addr] = { nick: b.nick, pub: b.pub, bal: START_COINS, nonce: 0, t: Date.now() };
        dirty = true; return send(res, 200, { ok: true });
      }

      // ---- transaction ----
      const from = String(b.from || '').toLowerCase(), to = String(b.to || '').toLowerCase();
      const amount = b.amount, nonce = b.nonce, memo = b.memo === undefined ? '' : b.memo;
      if (!ADDR.test(from) || !ADDR.test(to) || !Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT ||
          !Number.isInteger(nonce) || nonce < 0 || typeof memo !== 'string' || !MEMO.test(memo))
        return send(res, 400, { error: 'invalid transaction format' });
      const tx = { from, to, amount, nonce };
      const A = db.accts[from];
      if (!A) return reject(res, tx, 'sender has not joined the ledger');
      const text = `Ledger-v1|tx|${from}|${to}|${amount}|${nonce}|${memo}`;
      if (!sigOk(A.pub, text, b)) return reject(res, tx, 'bad signature — not signed by the sender’s key, or the data was changed after signing');
      if (nonce !== A.nonce) return reject(res, tx, nonce < A.nonce ? 'nonce already used — replay of an old transaction' : 'nonce too high — expected ' + A.nonce);
      if (!db.accts[to]) return reject(res, tx, 'recipient has not joined the ledger');
      if (to === from) return reject(res, tx, 'cannot send to yourself');
      if (amount > A.bal) return reject(res, tx, 'insufficient funds');
      A.bal -= amount; A.nonce++; db.accts[to].bal += amount;
      db.txs.push({ id: crypto.randomBytes(4).toString('hex'), t: Date.now(), from, fromNick: A.nick, to, toNick: db.accts[to].nick,
                    amount, nonce, memo, r: b.r, s: b.s });
      db.txs = db.txs.slice(-MAX_TX); dirty = true;
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: e.message }); }
}).listen(PORT, HOST, () => console.log(`SignedLedger on ${HOST}:${PORT} (origin ${ALLOW_ORIGIN})`));
