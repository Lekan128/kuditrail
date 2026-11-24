// KudiTrail: follow Nigeria's public money.
// Zero-dependency Node.js server (Node 18+): serves the web app, fund data,
// citizen updates (moderated) and contact / correction requests.

'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const FUNDS_DIR = path.join(ROOT, 'data', 'funds');
const STORE_DIR = process.env.STORE_DIR || path.join(ROOT, 'data', 'store');
const UPLOAD_DIR = path.join(STORE_DIR, 'uploads');
const PORT = Number(process.env.PORT) || 3000;
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'corrections@kuditrail.example';
const MAX_BODY = 6 * 1024 * 1024; // 6 MB (photo is base64, max ~3 MB binary)
const MAX_PHOTO = 3 * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Admin token
function loadAdminToken() {
  if (process.env.ADMIN_TOKEN) return process.env.ADMIN_TOKEN;
  const f = path.join(STORE_DIR, '.admin-token');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch (_) { /* create below */ }
  const t = crypto.randomBytes(18).toString('base64url');
  fs.writeFileSync(f, t, { mode: 0o600 });
  return t;
}
const ADMIN_TOKEN = loadAdminToken();

// Fund data
const STATUSES = ['passed_on', 'completed', 'operational', 'ongoing', 'stalled', 'defects',
  'under_review', 'disbursed', 'not_disbursed', 'repaid', 'unclear', 'pending_data'];
const CLARITY = ['documented', 'reported', 'unclear', 'pending'];

function loadFunds() {
  const funds = new Map();
  for (const file of fs.readdirSync(FUNDS_DIR).filter(f => f.endsWith('.json')).sort()) {
    const fund = JSON.parse(fs.readFileSync(path.join(FUNDS_DIR, file), 'utf8'));
    const ids = new Set(fund.nodes.map(n => n.id));
    const problems = [];
    for (const n of fund.nodes) {
      if (!STATUSES.includes(n.status)) problems.push(`node ${n.id}: bad status "${n.status}"`);
      if (!CLARITY.includes(n.clarity)) problems.push(`node ${n.id}: bad clarity "${n.clarity}"`);
    }
    for (const l of fund.links) {
      if (!ids.has(l.from) || !ids.has(l.to)) problems.push(`link ${l.from}->${l.to}: unknown node`);
      if (!(l.amount > 0)) problems.push(`link ${l.from}->${l.to}: amount must be > 0`);
    }
    if (problems.length) throw new Error(`Invalid fund file ${file}:\n  ` + problems.join('\n  '));
    funds.set(fund.id, fund);
  }
  return funds;
}

// How much of the money can be traced to a documented end point?
function clarityBreakdown(fund) {
  const outgoing = new Set(fund.links.map(l => l.from));
  const byId = new Map(fund.nodes.map(n => [n.id, n]));
  const totals = { documented: 0, reported: 0, unclear: 0, pending: 0 };
  for (const l of fund.links) {
    const target = byId.get(l.to);
    if (outgoing.has(target.id)) continue; // only count money reaching an end point
    totals[target.clarity] += l.amount;
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const k of Object.keys(totals)) out[k] = totals[k] / sum;
  return out;
}

function fundSummary(f) {
  return {
    id: f.id, order: f.order ?? 99, title: f.title, simple: f.simple, verdict: f.verdict || [], category: f.category, source: f.source, amount: f.amount,
    currency: f.currency, date: f.date, asOf: f.asOf, status: f.status, summary: f.summary,
    clarity: clarityBreakdown(f), endpoints: f.nodes.filter(n => !f.links.some(l => l.from === n.id)).length,
  };
}

let FUNDS = loadFunds();
const loadSettings = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8'));
let SETTINGS = loadSettings();
const loadBudget = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'budget.json'), 'utf8'));
let BUDGET = loadBudget();

// Automatic updates from official public data (see live.js)
const { createLive } = require('./live');
const LIVE = createLive({ storeDir: STORE_DIR, getFunds: () => FUNDS.values() });

// JSON store (atomic writes, serialised)
const stores = {};
function storePath(name) { return path.join(STORE_DIR, `${name}.json`); }
async function readStore(name) {
  if (stores[name]) return stores[name];
  try { stores[name] = JSON.parse(await fsp.readFile(storePath(name), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; stores[name] = []; }
  return stores[name];
}
let writeChain = Promise.resolve();
function writeStore(name) {
  writeChain = writeChain.then(async () => {
    const tmp = storePath(name) + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(stores[name], null, 2));
    await fsp.rename(tmp, storePath(name));
  });
  return writeChain;
}

// Helpers
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf || typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}
const fail = (res, status, error) => send(res, status, { error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function str(v, max, { required = false, min = 0, name = 'field' } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw Object.assign(new Error(`${name} is required`), { status: 400 });
  if (s && s.length < min) throw Object.assign(new Error(`${name} must be at least ${min} characters`), { status: 400 });
  if (s.length > max) throw Object.assign(new Error(`${name} is too long (max ${max} characters)`), { status: 400 });
  return s;
}
function urlList(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const raw of v.slice(0, 5)) {
    const s = String(raw || '').trim(); if (!s) continue;
    let u; try { u = new URL(s); } catch (_) { throw Object.assign(new Error(`Not a valid link: ${s.slice(0, 80)}`), { status: 400 }); }
    if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Links must start with http:// or https://'), { status: 400 });
    out.push(u.toString().slice(0, 500));
  }
  return out;
}
function isAdmin(req) {
  const given = Buffer.from(String(req.headers['x-admin-token'] || ''));
  const want = Buffer.from(ADMIN_TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
function clientIp(req) {
  return (process.env.TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
}
function ipHash(req) { return crypto.createHash('sha256').update(clientIp(req) + ADMIN_TOKEN).digest('hex').slice(0, 16); }

// Simple in-memory rate limit: N submissions per IP per hour.
const hits = new Map();
function rateLimited(req, limit = 8) {
  const key = clientIp(req); const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < 3600e3);
  if (arr.length >= limit) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr); return false;
}

function publicUpdate(u) {
  return { id: u.id, fundId: u.fundId, nodeId: u.nodeId, name: u.name || 'Anonymous', location: u.location,
    observedOn: u.observedOn, status: u.status, message: u.message, links: u.links,
    photo: u.photo ? `/api/photo/${u.id}` : null, createdAt: u.createdAt, moderatedAt: u.moderatedAt };
}

const OBSERVED_STATUS = ['completed', 'operational', 'ongoing', 'stalled', 'defects', 'abandoned', 'not_started', 'unsure'];
const CONTACT_TYPES = ['correction', 'right_of_reply', 'takedown', 'new_evidence', 'suggest_fund', 'general'];

// API routes
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const m = req.method;

  if (m === 'GET' && parts[0] === 'config') {
    return send(res, 200, { ...LIVE.settings(SETTINGS), contactEmail: CONTACT_EMAIL, statuses: STATUSES, observedStatuses: OBSERVED_STATUS, contactTypes: CONTACT_TYPES });
  }

  if (m === 'GET' && parts[0] === 'funds' && parts.length === 1) {
    const updates = await readStore('updates');
    return send(res, 200, [...FUNDS.values()].map(f => ({ ...fundSummary(f),
      updateCount: updates.filter(u => u.fundId === f.id && u.moderation === 'approved').length }))
      .sort((a, b) => a.order - b.order));
  }
  if (m === 'GET' && parts[0] === 'funds' && parts.length === 2) {
    const f = FUNDS.get(parts[1]);
    if (!f) return fail(res, 404, 'Fund not found');
    return send(res, 200, { ...f, clarityBreakdown: clarityBreakdown(f), liveData: LIVE.forFund(f) });
  }
  if (m === 'GET' && parts[0] === 'budget' && parts.length === 1) return send(res, 200, BUDGET);

  if (m === 'GET' && parts[0] === 'updates') {
    const fundId = url.searchParams.get('fund');
    const updates = (await readStore('updates'))
      .filter(u => u.moderation === 'approved' && (!fundId || u.fundId === fundId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicUpdate);
    return send(res, 200, updates);
  }

  if (m === 'POST' && parts[0] === 'updates') {
    if (rateLimited(req)) return fail(res, 429, 'Too many submissions from your network. Please try again in an hour.');
    const b = await readBody(req);
    if (b.website) return send(res, 201, { ok: true }); // honeypot: pretend success
    const fund = FUNDS.get(b.fundId);
    if (!fund) return fail(res, 400, 'Unknown fund');
    if (!fund.nodes.some(n => n.id === b.nodeId)) return fail(res, 400, 'Unknown project');
    if (b.consent !== true) return fail(res, 400, 'Please confirm the statement before sending');
    const status = OBSERVED_STATUS.includes(b.status) ? b.status : 'unsure';
    const observedOn = /^\d{4}-\d{2}-\d{2}$/.test(b.observedOn || '') ? b.observedOn : '';
    const update = {
      id: crypto.randomUUID(), fundId: fund.id, nodeId: b.nodeId,
      name: str(b.name, 80, { name: 'Name' }),
      contact: str(b.contact, 120, { name: 'Contact' }), // private, never published
      location: str(b.location, 160, { name: 'Location' }),
      observedOn, status,
      message: str(b.message, 2000, { required: true, min: 20, name: 'Your update' }),
      links: urlList(b.links),
      photo: null, moderation: 'pending', createdAt: new Date().toISOString(), ip: ipHash(req),
    };
    if (b.photo) {
      const mm = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo));
      if (!mm) return fail(res, 400, 'Photo must be a JPEG image');
      const buf = Buffer.from(mm[1], 'base64');
      if (buf.length > MAX_PHOTO) return fail(res, 413, 'Photo is too large (max 3 MB)');
      if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return fail(res, 400, 'Photo must be a JPEG image');
      update.photo = `${update.id}.jpg`;
      await fsp.writeFile(path.join(UPLOAD_DIR, update.photo), buf);
    }
    (await readStore('updates')).push(update);
    await writeStore('updates');
    return send(res, 201, { ok: true, id: update.id });
  }

  if (m === 'GET' && parts[0] === 'photo' && parts[1]) {
    const u = (await readStore('updates')).find(x => x.id === parts[1]);
    if (!u || !u.photo) return fail(res, 404, 'Not found');
    if (u.moderation !== 'approved' && !isAdmin(req)) return fail(res, 404, 'Not found');
    const buf = await fsp.readFile(path.join(UPLOAD_DIR, path.basename(u.photo)));
    return send(res, 200, buf, { 'Content-Type': 'image/jpeg', 'Cache-Control': u.moderation === 'approved' ? 'public, max-age=86400' : 'no-store' });
  }

  if (m === 'POST' && parts[0] === 'contact') {
    if (rateLimited(req)) return fail(res, 429, 'Too many messages from your network. Please try again in an hour.');
    const b = await readBody(req);
    if (b.website) return send(res, 201, { ok: true });
    const msg = {
      id: crypto.randomUUID(),
      type: CONTACT_TYPES.includes(b.type) ? b.type : 'general',
      name: str(b.name, 100, { required: true, name: 'Name' }),
      email: str(b.email, 160, { required: true, name: 'Email' }),
      organisation: str(b.organisation, 160, { name: 'Organisation' }),
      fundId: FUNDS.has(b.fundId) ? b.fundId : '',
      message: str(b.message, 5000, { required: true, min: 10, name: 'Message' }),
      links: urlList(b.links),
      state: 'open', createdAt: new Date().toISOString(), ip: ipHash(req),
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email)) return fail(res, 400, 'Please enter a valid email so we can reply');
    (await readStore('contacts')).push(msg);
    await writeStore('contacts');
    return send(res, 201, { ok: true, reference: msg.id.slice(0, 8).toUpperCase() });
  }

  // Admin (moderation)
  if (parts[0] === 'admin') {
    if (!isAdmin(req)) return fail(res, 401, 'Wrong or missing admin token');
    if (m === 'GET' && parts[1] === 'updates') {
      const list = (await readStore('updates')).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return send(res, 200, list.map(u => ({ ...publicUpdate(u), contact: u.contact, moderation: u.moderation,
        fundTitle: FUNDS.get(u.fundId)?.title, nodeLabel: FUNDS.get(u.fundId)?.nodes.find(n => n.id === u.nodeId)?.label })));
    }
    if (m === 'POST' && parts[1] === 'updates' && parts[2]) {
      const b = await readBody(req);
      const list = await readStore('updates');
      const u = list.find(x => x.id === parts[2]);
      if (!u) return fail(res, 404, 'Not found');
      if (b.action === 'delete') {
        list.splice(list.indexOf(u), 1);
        if (u.photo) await fsp.rm(path.join(UPLOAD_DIR, path.basename(u.photo)), { force: true });
      } else if (['approved', 'rejected', 'pending'].includes(b.action)) {
        u.moderation = b.action; u.moderatedAt = new Date().toISOString();
      } else return fail(res, 400, 'Unknown action');
      await writeStore('updates');
      return send(res, 200, { ok: true });
    }
    if (m === 'GET' && parts[1] === 'contacts') {
      return send(res, 200, (await readStore('contacts')).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }
    if (m === 'POST' && parts[1] === 'contacts' && parts[2]) {
      const b = await readBody(req);
      const c = (await readStore('contacts')).find(x => x.id === parts[2]);
      if (!c) return fail(res, 404, 'Not found');
      if (!['open', 'resolved'].includes(b.state)) return fail(res, 400, 'Unknown state');
      c.state = b.state; c.updatedAt = new Date().toISOString();
      await writeStore('contacts');
      return send(res, 200, { ok: true });
    }
    if (m === 'POST' && parts[1] === 'reload') { FUNDS = loadFunds(); SETTINGS = loadSettings(); BUDGET = loadBudget(); return send(res, 200, { ok: true, funds: FUNDS.size }); }
    if (m === 'GET' && parts[1] === 'live') return send(res, 200, LIVE.status());
    if (m === 'POST' && parts[1] === 'live') { await LIVE.refresh(); return send(res, 200, LIVE.status()); }
  }

  return fail(res, 404, 'Not found');
}

// Static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'; // SPA fallback
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return fail(res, 403, 'Forbidden');
  try {
    const buf = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  } catch (_) { fail(res, 404, 'Not found'); }
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Something went wrong');
  }
});

if (require.main === module) {
  if (process.env.LIVE_UPDATES !== '0') LIVE.start();
  server.listen(PORT, () => {
    console.log(`\n  KudiTrail running at http://localhost:${PORT}`);
    console.log(`  Funds loaded: ${FUNDS.size}`);
    console.log(`  Moderation:   http://localhost:${PORT}/#/admin`);
    console.log(`  Admin token:  ${process.env.ADMIN_TOKEN ? '(from ADMIN_TOKEN env var)' : ADMIN_TOKEN + '  (saved in data/store/.admin-token)'}\n`);
  });
}

module.exports = { server, loadFunds, loadBudget, clarityBreakdown };
