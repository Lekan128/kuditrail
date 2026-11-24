// KudiTrail API: handles every /api/* request (called from src/worker.js).
//
// Bindings (see wrangler.toml):
//   DB      D1 database: citizen updates and contact messages
//   PHOTOS  R2 bucket: photos sent with updates
//   ADMIN_TOKEN    secret: moderator token
//   CONTACT_EMAIL  email shown for legal notices
//   GITHUB_REPO    "owner/repo", for the "run the update" link on the admin page
//
// Fund, budget and automatic data are bundled at build time (scripts/build.js).

import { DATA } from './data.js';

const MAX_BODY = 6 * 1024 * 1024; // 6 MB (photo is base64, max ~3 MB binary)
const MAX_PHOTO = 3 * 1024 * 1024;
const PHOTO_STORAGE_CAP = 9 * 1024 ** 3; // stop taking photos before R2's 10 GB free limit
const RATE_LIMIT = 8;             // submissions per network per hour (updates + messages)
const { statuses: STATUSES, observedStatuses: OBSERVED_STATUS, contactTypes: CONTACT_TYPES } = DATA;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}
const fail = (status, error) => json(status, { error });

async function readBody(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'Request too large');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large');
  try { return JSON.parse(text || '{}'); } catch (_) { throw new HttpError(400, 'Invalid JSON'); }
}

function str(v, max, { required = false, min = 0, name = 'field' } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, `${name} is required`);
  if (s && s.length < min) throw new HttpError(400, `${name} must be at least ${min} characters`);
  if (s.length > max) throw new HttpError(400, `${name} is too long (max ${max} characters)`);
  return s;
}
function urlList(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const raw of v.slice(0, 5)) {
    const s = String(raw || '').trim(); if (!s) continue;
    let u; try { u = new URL(s); } catch (_) { throw new HttpError(400, `Not a valid link: ${s.slice(0, 80)}`); }
    if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Links must start with http:// or https://');
    out.push(u.toString().slice(0, 500));
  }
  return out;
}

const enc = new TextEncoder();
async function sha256(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

// Compare digests so the check takes the same time whatever the token length.
async function isAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const [a, b] = await Promise.all([sha256(request.headers.get('x-admin-token') || ''), sha256(env.ADMIN_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function ipHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '?';
  return hex(await sha256(ip + (env.ADMIN_TOKEN || ''))).slice(0, 16);
}
async function rateLimited(env, ip) {
  const since = new Date(Date.now() - 3600e3).toISOString();
  const row = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM updates WHERE ip = ?1 AND created_at > ?2) + (SELECT COUNT(*) FROM contacts WHERE ip = ?1 AND created_at > ?2) AS n'
  ).bind(ip, since).first();
  return row.n >= RATE_LIMIT;
}

// DB rows -> API shapes (same fields the old Node server returned)
function rowToUpdate(r) {
  return { id: r.id, fundId: r.fund_id, nodeId: r.node_id, name: r.name, contact: r.contact, location: r.location,
    observedOn: r.observed_on, status: r.status, message: r.message, links: JSON.parse(r.links || '[]'),
    photo: r.photo, moderation: r.moderation, createdAt: r.created_at, moderatedAt: r.moderated_at };
}
function publicUpdate(u) {
  return { id: u.id, fundId: u.fundId, nodeId: u.nodeId, name: u.name || 'Anonymous', location: u.location,
    observedOn: u.observedOn, status: u.status, message: u.message, links: u.links,
    photo: u.photo ? `/api/photo/${u.id}` : null, createdAt: u.createdAt, moderatedAt: u.moderatedAt };
}
function rowToContact(r) {
  return { id: r.id, type: r.type, name: r.name, email: r.email, organisation: r.organisation, fundId: r.fund_id,
    message: r.message, links: JSON.parse(r.links || '[]'), state: r.state, createdAt: r.created_at, updatedAt: r.updated_at };
}

async function handle(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const m = request.method;
  const FUNDS = DATA.funds;

  if (m === 'GET' && parts[0] === 'config') {
    return json(200, { ...DATA.settings, contactEmail: env.CONTACT_EMAIL || 'corrections@kuditrail.example',
      statuses: STATUSES, observedStatuses: OBSERVED_STATUS, contactTypes: CONTACT_TYPES });
  }

  if (m === 'GET' && parts[0] === 'funds' && parts.length === 1) {
    const { results } = await env.DB.prepare("SELECT fund_id, COUNT(*) AS n FROM updates WHERE moderation = 'approved' GROUP BY fund_id").all();
    const counts = Object.fromEntries(results.map(r => [r.fund_id, r.n]));
    return json(200, DATA.summaries.map(s => ({ ...s, updateCount: counts[s.id] || 0 })));
  }
  if (m === 'GET' && parts[0] === 'funds' && parts.length === 2) {
    const f = FUNDS[parts[1]];
    return f ? json(200, f) : fail(404, 'Fund not found');
  }
  if (m === 'GET' && parts[0] === 'budget' && parts.length === 1) return json(200, DATA.budget);

  if (m === 'GET' && parts[0] === 'updates') {
    const fundId = url.searchParams.get('fund');
    const stmt = fundId
      ? env.DB.prepare("SELECT * FROM updates WHERE moderation = 'approved' AND fund_id = ? ORDER BY created_at DESC").bind(fundId)
      : env.DB.prepare("SELECT * FROM updates WHERE moderation = 'approved' ORDER BY created_at DESC");
    const { results } = await stmt.all();
    return json(200, results.map(r => publicUpdate(rowToUpdate(r))));
  }

  if (m === 'POST' && parts[0] === 'updates') {
    const ip = await ipHash(request, env);
    if (await rateLimited(env, ip)) return fail(429, 'Too many submissions from your network. Please try again in an hour.');
    const b = await readBody(request);
    if (b.website) return json(201, { ok: true }); // honeypot: pretend success
    const fund = Object.hasOwn(FUNDS, b.fundId) ? FUNDS[b.fundId] : null;
    if (!fund) return fail(400, 'Unknown fund');
    if (!fund.nodes.some(n => n.id === b.nodeId)) return fail(400, 'Unknown project');
    if (b.consent !== true) return fail(400, 'Please confirm the statement before sending');
    const u = {
      id: crypto.randomUUID(), fundId: fund.id, nodeId: b.nodeId,
      name: str(b.name, 80, { name: 'Name' }),
      contact: str(b.contact, 120, { name: 'Contact' }),
      location: str(b.location, 160, { name: 'Location' }),
      observedOn: /^\d{4}-\d{2}-\d{2}$/.test(b.observedOn || '') ? b.observedOn : '',
      status: OBSERVED_STATUS.includes(b.status) ? b.status : 'unsure',
      message: str(b.message, 2000, { required: true, min: 20, name: 'Your update' }),
      links: urlList(b.links), photo: null, createdAt: new Date().toISOString(),
    };
    if (b.photo) {
      const mm = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.photo));
      if (!mm) return fail(400, 'Photo must be a JPEG image');
      let bin; try { bin = atob(mm[1]); } catch (_) { return fail(400, 'Photo must be a JPEG image'); }
      if (bin.length > MAX_PHOTO) return fail(413, 'Photo is too large (max 3 MB)');
      const buf = Uint8Array.from(bin, c => c.charCodeAt(0));
      if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return fail(400, 'Photo must be a JPEG image');
      const used = await env.DB.prepare('SELECT COALESCE(SUM(photo_size), 0) AS n FROM updates').first();
      if (used.n + buf.length > PHOTO_STORAGE_CAP) return fail(507, "We can't accept photos at the moment. Please send your update without the photo, or add a link to it instead.");
      u.photo = `${u.id}.jpg`; u.photoSize = buf.length;
      await env.PHOTOS.put(u.photo, buf, { httpMetadata: { contentType: 'image/jpeg' } });
    }
    await env.DB.prepare(
      `INSERT INTO updates (id, fund_id, node_id, name, contact, location, observed_on, status, message, links, photo, photo_size, moderation, created_at, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(u.id, u.fundId, u.nodeId, u.name, u.contact, u.location, u.observedOn, u.status, u.message,
      JSON.stringify(u.links), u.photo, u.photoSize || null, u.createdAt, ip).run();
    return json(201, { ok: true, id: u.id });
  }

  if (m === 'GET' && parts[0] === 'photo' && parts[1]) {
    const r = await env.DB.prepare('SELECT photo, moderation FROM updates WHERE id = ?').bind(parts[1]).first();
    if (!r || !r.photo) return fail(404, 'Not found');
    if (r.moderation !== 'approved' && !(await isAdmin(request, env))) return fail(404, 'Not found');
    const obj = await env.PHOTOS.get(r.photo);
    if (!obj) return fail(404, 'Not found');
    return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', ...SECURITY_HEADERS,
      'Cache-Control': r.moderation === 'approved' ? 'public, max-age=86400' : 'no-store' } });
  }

  if (m === 'POST' && parts[0] === 'contact') {
    const ip = await ipHash(request, env);
    if (await rateLimited(env, ip)) return fail(429, 'Too many messages from your network. Please try again in an hour.');
    const b = await readBody(request);
    if (b.website) return json(201, { ok: true });
    const c = {
      id: crypto.randomUUID(),
      type: CONTACT_TYPES.includes(b.type) ? b.type : 'general',
      name: str(b.name, 100, { required: true, name: 'Name' }),
      email: str(b.email, 160, { required: true, name: 'Email' }),
      organisation: str(b.organisation, 160, { name: 'Organisation' }),
      fundId: Object.hasOwn(FUNDS, b.fundId) ? b.fundId : '',
      message: str(b.message, 5000, { required: true, min: 10, name: 'Message' }),
      links: urlList(b.links), createdAt: new Date().toISOString(),
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return fail(400, 'Please enter a valid email so we can reply');
    await env.DB.prepare(
      `INSERT INTO contacts (id, type, name, email, organisation, fund_id, message, links, state, created_at, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
    ).bind(c.id, c.type, c.name, c.email, c.organisation, c.fundId, c.message, JSON.stringify(c.links), c.createdAt, ip).run();
    return json(201, { ok: true, reference: c.id.slice(0, 8).toUpperCase() });
  }

  // Admin (moderation)
  if (parts[0] === 'admin') {
    if (!(await isAdmin(request, env))) return fail(401, 'Wrong or missing admin token');
    if (m === 'GET' && parts[1] === 'updates') {
      const { results } = await env.DB.prepare('SELECT * FROM updates ORDER BY created_at DESC').all();
      return json(200, results.map(rowToUpdate).map(u => ({ ...publicUpdate(u), contact: u.contact, moderation: u.moderation,
        fundTitle: FUNDS[u.fundId]?.title, nodeLabel: FUNDS[u.fundId]?.nodes.find(n => n.id === u.nodeId)?.label })));
    }
    if (m === 'POST' && parts[1] === 'updates' && parts[2]) {
      const b = await readBody(request);
      const r = await env.DB.prepare('SELECT photo FROM updates WHERE id = ?').bind(parts[2]).first();
      if (!r) return fail(404, 'Not found');
      if (b.action === 'delete') {
        await env.DB.prepare('DELETE FROM updates WHERE id = ?').bind(parts[2]).run();
        if (r.photo) await env.PHOTOS.delete(r.photo);
      } else if (['approved', 'rejected', 'pending'].includes(b.action)) {
        await env.DB.prepare('UPDATE updates SET moderation = ?, moderated_at = ? WHERE id = ?').bind(b.action, new Date().toISOString(), parts[2]).run();
      } else return fail(400, 'Unknown action');
      return json(200, { ok: true });
    }
    if (m === 'GET' && parts[1] === 'contacts') {
      const { results } = await env.DB.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
      return json(200, results.map(rowToContact));
    }
    if (m === 'POST' && parts[1] === 'contacts' && parts[2]) {
      const b = await readBody(request);
      if (!['open', 'resolved'].includes(b.state)) return fail(400, 'Unknown state');
      const res = await env.DB.prepare('UPDATE contacts SET state = ?, updated_at = ? WHERE id = ?').bind(b.state, new Date().toISOString(), parts[2]).run();
      if (!res.meta.changes) return fail(404, 'Not found');
      return json(200, { ok: true });
    }
    if (m === 'GET' && parts[1] === 'live') {
      const repo = env.GITHUB_REPO;
      return json(200, { ...DATA.live, builtAt: DATA.builtAt,
        runUrl: repo ? `https://github.com/${repo}/actions/workflows/update-live.yml` : null });
    }
  }

  return fail(404, 'Not found');
}

export async function handleApi(request, env) {
  try {
    return await handle(request, env, new URL(request.url));
  } catch (e) {
    if (!e.status) console.error(e);
    return fail(e.status || 500, e.status ? e.message : 'Something went wrong');
  }
}
