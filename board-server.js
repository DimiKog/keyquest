// CipherBoard board server — zero dependencies (Node >= 18).
// Stores only public keys and ciphertext packets. Run behind HTTPS (nginx/caddy) for GitHub Pages.
//   PORT=8787 ALLOW_ORIGIN=https://<user>.github.io ADMIN_TOKEN=secret node board-server.js
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8787;
const HOST = process.env.HOST || '127.0.0.1'; // keep on localhost; nginx is the only public entry
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const FILE = process.env.DATA_FILE || './board-data.json';
const MAX_MSGS = 300, MAX_KEYS = 200, MAX_BODY = 6000;
const RATE = { windowMs: 60000, max: 20 }; // posts per IP per minute

let db = { keys: [], msgs: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
let dirty = false;
setInterval(() => { if (dirty) { fs.writeFileSync(FILE, JSON.stringify(db)); dirty = false; } }, 3000);

const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < RATE.windowMs);
  h.push(now); hits.set(ip, h);
  return h.length > RATE.max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some(t => now - t < RATE.windowMs)) hits.delete(k); }, 60000);

const hexOk = (s, n) => typeof s === 'string' && new RegExp('^[0-9a-f]{' + n + '}$').test(s);
const validKey = k => k && hexOk(k.pub, 128) && typeof k.nick === 'string';
const validPacket = p => p && p.v === 1 && /^0x[0-9a-fA-F]{40}$/.test(p.from) && /^0x[0-9a-fA-F]{40}$/.test(p.to) &&
  hexOk(p.fromPub, 128) && hexOk(p.eph, 128) && hexOk(p.iv, 24) && /^([0-9a-f]{2}){17,1200}$/.test(p.ct || '') &&
  hexOk(p.r, 64) && hexOk(p.s, 64) && Object.keys(p).length === 9;

function send(res, code, obj) {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-headers': 'content-type,x-admin-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
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

http.createServer(async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (req.method === 'GET' && req.url === '/board') return send(res, 200, db);
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, keys: db.keys.length, msgs: db.msgs.length });
    if (req.method === 'POST' && req.url === '/admin/clear') {
      if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) return send(res, 403, { error: 'forbidden' });
      db = { keys: [], msgs: [] }; dirty = true; return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && (req.url === '/key' || req.url === '/msg')) {
      if (limited(ip)) return send(res, 429, { error: 'slow down — too many posts' });
      const b = await body(req);
      if (req.url === '/key') {
        if (!validKey(b)) return send(res, 400, { error: 'invalid key entry' });
        const nick = b.nick.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 24) || 'anon';
        db.keys = db.keys.filter(k => k.pub !== b.pub); db.keys.push({ nick, pub: b.pub, t: Date.now() });
        db.keys = db.keys.slice(-MAX_KEYS);
      } else {
        if (!validPacket(b.packet)) return send(res, 400, { error: 'invalid packet' });
        db.msgs.push({ id: crypto.randomBytes(5).toString('hex'), t: Date.now(), packet: b.packet });
        db.msgs = db.msgs.slice(-MAX_MSGS);
      }
      dirty = true; return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: e.message }); }
}).listen(PORT, HOST, () => console.log(`CipherBoard board on ${HOST}:${PORT} (origin ${ALLOW_ORIGIN})`));
