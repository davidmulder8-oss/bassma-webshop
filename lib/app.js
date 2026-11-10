'use strict';
/* HTTP-server: openbare bestel-API, betaalmeldingen (webhooks), beveiligd beheer, back-ups en statische bestanden. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open, logEvent } = require('./db');
const S = require('./settings');
const auth = require('./auth');
const O = require('./orders');
const print = require('./print');
const backup = require('./backup');
const { createProviders } = require('./payments');
const mail = require('../mail');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const MAIL_BACKOFF = [60, 300, 900, 3600, 10800, 21600];   /* seconden tussen nieuwe pogingen om een mail te versturen */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.pdok.nl; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'";

function createApp(opts = {}) {
  const env = opts.env || process.env;
  const dataDir = opts.dataDir || env.DATA_DIR || path.join(ROOT, 'data');
  const db = opts.db || open(path.join(dataDir, 'bassma.db'));
  const deps = Object.assign({ fetch: (...a) => fetch(...a), now: () => Date.now() }, opts.deps || {});
  const providers = createProviders(env, deps.fetch);
  const publicUrl = (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, '');
  const secure = publicUrl.startsWith('https://');
  const sendRaw = opts.sendRaw || print.sendRaw;
  const backupDir = env.BACKUP_DIR || path.join(dataDir, 'backups');
  const retentionDays = Number(env.RETENTION_DAYS || 90);

  /* menu uit index.html in de database zetten bij de eerste start */
  if (!db.prepare('SELECT COUNT(*) AS n FROM categories').get().n) {
    try {
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      const vm = require('vm');
      const m = /var MENU=(\[[\s\S]*?\n\]);/.exec(html);
      if (m) S.seedCatalog(db, vm.runInNewContext('(' + m[1] + ')', {}, { timeout: 500 }));
    } catch (e) { console.error('Menu inlezen mislukt:', e.message); }
  }

  const log = (orderId, type, detail) => { try { logEvent(db, orderId, type, detail); } catch (_) { /* logging mag nooit de bestelling stoppen */ } };
  const mailCfg = () => { const s = S.getSettings(db); return { SHOP: s.shop, ETA: s.eta }; };
  const runPrint = () => print.runQueue(db, env, log, sendRaw).catch((e) => log(null, 'print_queue_error', { error: e.message }));

  /* ---------- e-mailwachtrij: nieuwe pogingen bij een storing, nooit dubbel ---------- */
  let outboxBusy = false, outboxAgain = false;
  async function runOutbox() {
    if (outboxBusy) { outboxAgain = true; return; }
    outboxBusy = true;
    try {
      do {
        outboxAgain = false;
        const rows = db.prepare("SELECT * FROM mail_outbox WHERE status IN ('pending','failed') AND next_try <= ? AND attempts <= ? ORDER BY id LIMIT 10").all(deps.now(), MAIL_BACKOFF.length);
        for (const r of rows) {
          const claim = db.prepare("UPDATE mail_outbox SET attempts = attempts + 1 WHERE id = ? AND status IN ('pending','failed')").run(r.id);
          if (claim.changes !== 1) continue;
          const o = O.row(db, r.order_id);
          if (!o || !o.email) { db.prepare("UPDATE mail_outbox SET status = 'skipped' WHERE id = ?").run(r.id); continue; }
          try {
            const res = await mail.sendMail(O.mailShape(o), r.kind, mailCfg(), dataDir, deps.now());
            db.prepare('UPDATE mail_outbox SET status = ?, sent_at = ?, last_error = NULL WHERE id = ?').run(res === 'sent' ? 'sent' : 'saved', new Date(deps.now()).toISOString(), r.id);
            log(o.id, res === 'sent' ? 'mail_sent' : 'mail_saved', { kind: r.kind });
          } catch (e) {
            const n = r.attempts + 1;
            db.prepare("UPDATE mail_outbox SET status = 'failed', last_error = ?, next_try = ? WHERE id = ?").run(String(e.message).slice(0, 200), deps.now() + MAIL_BACKOFF[Math.min(n - 1, MAIL_BACKOFF.length - 1)] * 1000, r.id);
            log(o.id, 'mail_error', { kind: r.kind, attempt: n, error: e.message });
          }
        }
      } while (outboxAgain);
    } finally { outboxBusy = false; }
  }
  function enqueueMail(order, kind) {
    if (!order.email) return;
    db.prepare('INSERT OR IGNORE INTO mail_outbox (order_id, kind, created_at) VALUES (?, ?, ?)').run(order.id, kind, new Date(deps.now()).toISOString());
    runOutbox().catch((e) => log(order.id, 'mail_queue_error', { error: e.message }));
  }

  const ctx = {
    db, deps, providers, env,
    urls: (order) => ({ redirect: `${publicUrl}/bedankt.html?o=${order.public_token}`, webhook: (secure || env.ALLOW_HTTP_WEBHOOK === '1') ? `${publicUrl}/api/webhook/${order.provider}` : null }),
    onPaid(order) { enqueueMail(order, 'confirmed'); runPrint(); },
    onNew(order) { enqueueMail(order, 'confirmed'); runPrint(); },
    onStageMail(order, kind) { enqueueMail(order, kind); }
  };

  /* ---------- verkeer via Netlify: alleen aanvragen die echt via de website komen worden geaccepteerd ---------- */
  function proxyMode() { return env.NETLIFY_SIGN_SECRET ? 'netlify' : (env.PROXY_SECRET ? 'secret' : null); }
  function proxyOk(req) {
    if (env.NETLIFY_SIGN_SECRET) {   /* Netlify ondertekent elke doorgestuurde aanvraag in de header x-nf-sign (JWS, HS256) */
      const parts = String(req.headers['x-nf-sign'] || '').split('.');
      if (parts.length !== 3) return false;
      try {
        const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        if (head.alg !== 'HS256') return false;
        const expect = crypto.createHmac('sha256', env.NETLIFY_SIGN_SECRET).update(parts[0] + '.' + parts[1]).digest();
        const got = Buffer.from(parts[2], 'base64url');
        if (got.length !== expect.length || !crypto.timingSafeEqual(got, expect)) return false;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        if (payload.exp && payload.exp * 1000 < deps.now()) return false;
        return true;
      } catch (_) { return false; }
    }
    if (env.PROXY_SECRET) {
      const sent = String(req.headers['x-shop-proxy'] || '');
      return sent.length === env.PROXY_SECRET.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(env.PROXY_SECRET));
    }
    return true;
  }
  /* IP van de bezoeker: alleen uit een header lezen als de aanvraag aantoonbaar via onze proxy kwam; anders het verbindings-IP */
  function clientIp(req) {
    const sock = req.socket.remoteAddress || '';
    if (proxyMode() && proxyOk(req) && env.CLIENT_IP_HEADER) {
      const v = String(req.headers[env.CLIENT_IP_HEADER.toLowerCase()] || '').split(',')[0].trim();
      if (v && v.length <= 45) return v;
    }
    return sock;
  }

  /* ---------- hulp ---------- */
  const hits = new Map();
  function limited(ip, key, max, windowMs) {
    const k = key + '|' + ip, now = Date.now();
    if (hits.size > 5000) for (const [kk, v] of hits) if (!v.length || now - v[v.length - 1] > 3600000) hits.delete(kk);
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    arr.push(now); hits.set(k, arr);
    return arr.length > max;
  }
  function body(req, limit = 100000) {
    return new Promise((resolve, reject) => {
      let size = 0, over = false; const chunks = [];
      req.on('data', (c) => {
        if (over) return;   /* de rest wordt weggegooid; we antwoorden eerst netjes met 413 */
        size += c.length;
        if (size > limit) { over = true; chunks.length = 0; reject(O.err('Te grote aanvraag', 413)); return; }
        chunks.push(c);
      });
      req.on('end', () => { if (!over) resolve(Buffer.concat(chunks).toString('utf8')); });
      req.on('error', reject);
    });
  }
  async function jsonBody(req) { try { return JSON.parse(await body(req) || '{}'); } catch (e) { if (e.status) throw e; throw O.err('Ongeldige gegevens'); } }
  function send(res, status, obj, headers = {}) {
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, status === 413 ? { Connection: 'close' } : {}, headers));
    res.end(JSON.stringify(obj));
  }

  function adminOrder(o) {
    return Object.assign({}, o, { items: JSON.parse(o.items), address: o.address ? JSON.parse(o.address) : null,
      print: db.prepare('SELECT id, kind, status, attempts, last_error, printed_at FROM print_jobs WHERE order_id = ? ORDER BY id').all(o.id) });
  }

  /* ---------- back-ups en systeemstatus ---------- */
  async function backupNow(by) {
    try {
      const r = await backup.runBackup(db, backupDir, env, new Date(deps.now()));
      log(null, 'backup_ok', { file: path.basename(r.file), bytes: r.bytes, orders: r.orders, encrypted: r.encrypted, uploaded: r.uploaded, by: by || 'automatisch' });
      return r;
    } catch (e) { log(null, 'backup_error', { error: e.message, by: by || 'automatisch' }); throw e; }
  }
  function systemStatus() {
    const now = deps.now(), list = backup.listBackups(backupDir), last = list[0];
    const warnings = [];
    const ageH = last ? (now - new Date(last.modified).getTime()) / 3600000 : null;
    if (!last) warnings.push('Er is nog geen back-up gemaakt.');
    else if (ageH > 30) warnings.push(`De laatste back-up is ${Math.round(ageH)} uur oud. Controleer het logboek.`);
    if (!env.BACKUP_ENCRYPTION_KEY) warnings.push('Back-ups zijn niet versleuteld (BACKUP_ENCRYPTION_KEY ontbreekt). Ze bevatten klantgegevens.');
    if (!backup.s3Configured(env)) warnings.push('Back-ups worden niet naar een externe plek gekopieerd. Gaat de server of schijf kapot, dan zijn ze mee verloren.');
    const demo = auth.demoUsers(db);
    if (demo.length) warnings.push('Er staan nog proef-inloggegevens aan (' + demo.join(', ') + '). Wijzig het wachtwoord of schakel ze uit voordat de webshop online gaat.');
    const mf = db.prepare("SELECT COUNT(*) n FROM mail_outbox WHERE status = 'failed'").get().n;
    if (mf) warnings.push(`${mf} e-mail(s) konden niet worden verstuurd. Er wordt opnieuw geprobeerd.`);
    const pf = db.prepare("SELECT COUNT(*) n FROM print_jobs WHERE status = 'failed'").get().n;
    if (pf) warnings.push(`${pf} bon(nen) zijn niet afgedrukt.`);
    if (!env.SMTP_HOST) warnings.push('E-mail is nog niet ingesteld (SMTP): klanten krijgen geen bevestiging.');
    if (secure && !proxyMode()) warnings.push('De server accepteert verkeer van overal. Stel NETLIFY_SIGN_SECRET in zodat alleen aanvragen via de website worden geaccepteerd.');
    if (!providers.active.configured) warnings.push('Online betalen is nog niet ingesteld.');
    return {
      time: new Date(now).toISOString(), node: process.version, provider: providers.active.name, providerConfigured: providers.active.configured,
      orders: db.prepare('SELECT COUNT(*) n FROM orders').get().n, retentionDays,
      backups: list, backupEncrypted: !!env.BACKUP_ENCRYPTION_KEY, backupOffsite: backup.s3Configured(env),
      mail: { configured: !!env.SMTP_HOST, pending: db.prepare("SELECT COUNT(*) n FROM mail_outbox WHERE status = 'pending'").get().n, failed: mf },
      print: { pending: db.prepare("SELECT COUNT(*) n FROM print_jobs WHERE status IN ('pending','printing')").get().n, failed: pf },
      proxy: proxyMode(), warnings
    };
  }

  /* ---------- API ---------- */
  async function api(req, res, url) {
    const p = url.pathname, m = req.method;
    if (p === '/api/health') {   /* voor de bewaking van de host: geen gegevens, alleen of de database antwoordt */
      try { db.prepare('SELECT 1').get(); return send(res, 200, { ok: true }); } catch (_) { return send(res, 503, { ok: false }); }
    }
    if (proxyMode() && !proxyOk(req)) return send(res, 403, { error: 'Alleen bereikbaar via de website' });
    const ip = clientIp(req);
    if (limited(ip, 'all', 300, 60000)) return send(res, 429, { error: 'Te veel verzoeken' });

    /* ===== openbaar ===== */
    if (m === 'GET' && p === '/api/config') {
      const s = S.getSettings(db), now = deps.now();
      return send(res, 200, {
        shop: s.shop, hours: s.hours, exceptions: s.exceptions, eta: s.eta, minOrder: s.minOrder, cashPickup: s.cashPickup, daysAhead: s.daysAhead,
        delivery: { enabled: s.delivery.enabled, freeFrom: s.delivery.freeFrom, zones: s.delivery.zones, city: s.delivery.city },
        payment: { provider: providers.active.name, available: providers.active.configured, methods: providers.active.methods },
        today: S.amsParts(now).date, menu: S.catalog(db, true), serverMode: true
      });
    }
    if (m === 'GET' && p === '/api/slots') {
      const date = url.searchParams.get('date') || '', type = url.searchParams.get('type') === 'delivery' ? 'delivery' : 'pickup';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: 'Ongeldige datum' });
      const s = S.getSettings(db), now = deps.now();
      if (date > S.addDays(S.amsParts(now).date, s.daysAhead)) return send(res, 200, { slots: [] });
      return send(res, 200, { slots: S.listSlots(db, s, date, type, now).map((x) => ({ time: x.time, available: x.available, reason: x.reason })) });
    }
    if (m === 'POST' && p === '/api/orders') {
      if (limited(ip, 'order', 15, 10 * 60000)) return send(res, 429, { error: 'Te veel bestellingen vanaf dit adres. Probeer het later opnieuw.' });
      const input = await jsonBody(req);
      input.idem = String(req.headers['idempotency-key'] || input.idem || '').slice(0, 80) || null;
      try {
        const r = await O.createOrder(ctx, input, { channel: 'web' });
        const o = r.order;
        if (r.duplicate) {
          if (o.pay_status === 'pending' && o.checkout_url) return send(res, 200, { checkoutUrl: o.checkout_url, token: o.public_token, duplicate: true });
          return send(res, 200, { orderNumber: o.number, token: o.public_token, status: o.pay_status, duplicate: true });
        }
        if (r.checkoutUrl) return send(res, 200, { checkoutUrl: r.checkoutUrl, token: o.public_token });
        return send(res, 200, { orderNumber: o.number, token: o.public_token, status: o.pay_status });
      } catch (e) { return send(res, e.status || 500, { error: e.status ? e.message : 'Serverfout' }); }
    }
    let mm;
    if (m === 'GET' && (mm = /^\/api\/order-status\/([a-f0-9]{24})$/.exec(p))) {
      let o = db.prepare('SELECT * FROM orders WHERE public_token = ?').get(mm[1]);
      if (!o) return send(res, 404, { error: 'Niet gevonden' });
      if (o.pay_status === 'pending' && o.checkout_id) { try { o = await O.syncPayment(ctx, o); } catch (e) { log(o.id, 'sync_error', { error: e.message }); } }   /* webhook kan trager zijn dan de klant */
      return send(res, 200, O.publicView(o, S.getSettings(db), deps.now()));
    }

    /* ===== betaalmeldingen: altijd verifiëren bij de provider, snel antwoorden met 200 ===== */
    if (m === 'POST' && (mm = /^\/api\/webhook\/(sumup|mollie)$/.exec(p))) {
      const provider = providers.byName(mm[1]);
      let raw = ''; try { raw = await body(req, 4000); } catch (_) { res.writeHead(413); return res.end(); }
      const id = provider.parseWebhook(raw);
      if (!id) { res.writeHead(200); return res.end(); }   /* onbekende meldingen stil negeren */
      const o = db.prepare('SELECT * FROM orders WHERE checkout_id = ? AND provider = ?').get(id, mm[1]);
      res.writeHead(200); res.end();
      if (!o) return;
      O.syncPayment(ctx, o).catch((e) => log(o.id, 'webhook_error', { error: e.message }));
      return;
    }

    /* ===== beheer: inloggen ===== */
    if (m === 'POST' && p === '/api/admin/login') {
      const b = await jsonBody(req);
      const chk = auth.loginCheck(db, b.username, ip, deps.now());
      if (chk.blocked) return send(res, 429, { error: 'Te veel pogingen vanaf dit apparaat. Wacht 10 minuten.' });
      if (chk.delay) await sleep(chk.delay);
      const u = auth.checkPassword(db, b.username, b.password);
      auth.loginRecord(db, b.username, ip, !!u, deps.now());
      if (!u) { log(null, 'login_failed', { user: String(b.username || '').slice(0, 30), ip }); return send(res, 401, { error: 'Onjuiste gebruikersnaam of wachtwoord' }); }
      const sess = auth.createSession(db, u);
      log(null, 'login', { user: u.username });
      return send(res, 200, { user: { username: u.username, role: u.role }, csrf: sess.csrf },
        { 'Set-Cookie': `bsess=${sess.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sess.maxAge}${secure ? '; Secure' : ''}` });
    }
    if (p.startsWith('/api/admin/')) {
      const owner = ((m !== 'GET') && /^\/api\/admin\/(settings|products|categories)/.test(p)) || /\/refund$/.test(p) || /^\/api\/admin\/(users|backup|debug-headers)/.test(p);
      const a = auth.authenticate(db, req, owner ? 'owner' : null);
      if (!a) return send(res, 401, { error: 'Niet ingelogd' });
      if (a.forbidden) return send(res, 403, { error: 'Alleen de eigenaar mag dit' });
      const who = a.user.username;

      if (m === 'POST' && p === '/api/admin/logout') { auth.destroySession(db, req); return send(res, 200, { ok: true }, { 'Set-Cookie': 'bsess=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + (secure ? '; Secure' : '') }); }
      if (m === 'GET' && p === '/api/admin/me') return send(res, 200, { user: a.user, csrf: a.csrf, provider: providers.active.name, providerConfigured: providers.active.configured, printer: !!env.PRINTER_HOST, mailConfigured: !!env.SMTP_HOST });

      /* eigen wachtwoord wijzigen (iedereen) */
      if (m === 'POST' && p === '/api/admin/password') {
        const b = await jsonBody(req);
        try { auth.changePassword(db, a.user.id, b.old, b.new); log(null, 'password_changed', { by: who }); const sess = auth.createSession(db, a.user);
          return send(res, 200, { ok: true, csrf: sess.csrf }, { 'Set-Cookie': `bsess=${sess.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sess.maxAge}${secure ? '; Secure' : ''}` }); }
        catch (e) { return send(res, 400, { error: e.message }); }
      }

      /* ===== eigenaar: gebruikers, back-ups, systeemstatus ===== */
      if (m === 'GET' && p === '/api/admin/system') return send(res, 200, systemStatus());
      if (m === 'POST' && p === '/api/admin/backup') {
        try { const r = await backupNow(who); return send(res, 200, { ok: true, file: path.basename(r.file), bytes: r.bytes, orders: r.orders, encrypted: r.encrypted, uploaded: r.uploaded }); }
        catch (e) { return send(res, 500, { error: 'Back-up mislukt: ' + e.message }); }
      }
      if (m === 'GET' && p === '/api/admin/users') return send(res, 200, { users: db.prepare('SELECT id, username, role, disabled, demo FROM users ORDER BY id').all() });
      if (m === 'POST' && p === '/api/admin/users') {
        const b = await jsonBody(req);
        try { auth.createUser(db, b.username, b.password, b.role === 'owner' ? 'owner' : 'staff'); log(null, 'user_created', { user: String(b.username).slice(0, 30), by: who }); return send(res, 200, { ok: true }); }
        catch (e) { return send(res, 400, { error: /UNIQUE/.test(e.message) ? 'Deze gebruikersnaam bestaat al' : e.message }); }
      }
      if ((mm = /^\/api\/admin\/users\/(\d+)$/.exec(p)) && m === 'PATCH') {
        const id = Number(mm[1]), b = await jsonBody(req), u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        if (!u) return send(res, 404, { error: 'Niet gevonden' });
        try {
          if (b.disabled != null) {
            if (id === a.user.id) throw new Error('Je kunt jezelf niet uitschakelen');
            if (b.disabled && u.role === 'owner' && db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'owner' AND disabled = 0 AND id != ?").get(id).n === 0) throw new Error('Er moet minstens één actieve eigenaar blijven');
            db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(b.disabled ? 1 : 0, id);
            if (b.disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
          }
          if (b.password) { const bad = auth.checkPasswordPolicy(b.password, u.username); if (bad) throw new Error(bad); auth.setPassword(db, id, b.password); }
          log(null, 'user_changed', { user: u.username, by: who });
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, 400, { error: e.message }); }
      }
      /* om op de testomgeving te zien welke headers via Netlify binnenkomen (zonder cookies of sleutels) */
      if (m === 'GET' && p === '/api/admin/debug-headers') {
        const h = {}; for (const [k, v] of Object.entries(req.headers)) if (!/^(cookie|authorization|x-nf-sign|x-shop-proxy|x-csrf-token)$/i.test(k)) h[k] = v;
        return send(res, 200, { clientIp: ip, socket: req.socket.remoteAddress, proxy: proxyMode(), headers: h });
      }

      if (m === 'GET' && p === '/api/admin/orders') {
        const date = url.searchParams.get('date'), all = url.searchParams.get('all') === '1';
        let rows;
        if (date) rows = db.prepare("SELECT * FROM orders WHERE slot_date = ? ORDER BY slot_time, id").all(date);
        else rows = db.prepare("SELECT * FROM orders WHERE created_at > ? ORDER BY id DESC LIMIT 300").all(new Date(deps.now() - 3 * 86400000).toISOString());
        if (!all) rows = rows.filter((o) => o.pay_status !== 'pending' || (o.reserved_until && o.reserved_until > deps.now()) ? true : false).filter((o) => !['failed', 'canceled', 'expired'].includes(o.pay_status));
        return send(res, 200, { orders: rows.map(adminOrder), now: deps.now() });
      }
      if (m === 'POST' && p === '/api/admin/orders') {
        const b = await jsonBody(req);
        const channel = b.channel === 'counter' ? 'counter' : 'phone';
        try {
          const r = await O.createOrder(ctx, Object.assign({}, b, { payment: ['cash', 'pin', 'later'].includes(b.payment) ? b.payment : 'later', idem: b.idem || null }), { channel, override: true });
          log(r.order.id, 'manual_order', { by: who });
          return send(res, 200, { order: adminOrder(r.order) });
        } catch (e) { return send(res, e.status || 500, { error: e.status ? e.message : 'Serverfout' }); }
      }
      if ((mm = /^\/api\/admin\/orders\/(\d+)\/(stage|refund|sync|reprint|eta)$/.exec(p)) && m === 'POST') {
        const id = Number(mm[1]), b = await jsonBody(req);
        try {
          if (mm[2] === 'eta') return send(res, 200, { order: adminOrder(O.setEta(ctx, id, b.minutes, who)) });
          if (mm[2] === 'stage') return send(res, 200, { order: adminOrder(O.setStage(ctx, id, b.stage, who)) });
          if (mm[2] === 'refund') return send(res, 200, { order: adminOrder(await O.refund(ctx, id, b.amountCents ? Number(b.amountCents) : 0, who)) });
          if (mm[2] === 'sync') { const o = O.row(db, id); if (!o) throw O.err('Niet gevonden', 404); return send(res, 200, { order: adminOrder(o.checkout_id ? await O.syncPayment(ctx, o) : o) }); }
          if (mm[2] === 'reprint') {
            const o = O.row(db, id); if (!o) throw O.err('Niet gevonden', 404);
            if (!['paid', 'cash', 'pin', 'later', 'partially_refunded'].includes(o.pay_status)) throw O.err('Deze bestelling is niet betaald en krijgt geen bon');
            print.enqueue(db, id, 'copy'); log(id, 'reprint', { by: who }); runPrint();
            return send(res, 200, { ok: true });
          }
        } catch (e) { return send(res, e.status || 500, { error: e.status ? e.message : (e.message || 'Serverfout') }); }
      }
      if (m === 'GET' && p === '/api/admin/events') {
        const oid = Number(url.searchParams.get('order') || 0);
        const rows = oid ? db.prepare('SELECT * FROM events WHERE order_id = ? ORDER BY id').all(oid) : db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 200').all();
        return send(res, 200, { events: rows });
      }

      /* bonnen: de browser op de kassa/tablet haalt open bonnen op, claimt ze (zodat maar één scherm print) en meldt klaar */
      if (m === 'GET' && p === '/api/admin/print-queue') {
        if (env.PRINTER_HOST) return send(res, 200, { jobs: [], server: true });
        const jobs = db.prepare("SELECT j.id, j.kind, j.attempts, o.* FROM print_jobs j JOIN orders o ON o.id = j.order_id WHERE j.status IN ('pending','failed') ORDER BY j.id LIMIT 10").all();
        return send(res, 200, { jobs: jobs.map((o) => ({ id: o.id, kind: o.kind, number: o.number, html: print.ticketHtml(o, o.kind), text: print.ticketText(o, o.kind) })) });
      }
      if ((mm = /^\/api\/admin\/print-jobs\/(\d+)\/(claim|done|fail)$/.exec(p)) && m === 'POST') {
        const id = Number(mm[1]);
        if (mm[2] === 'claim') { const r = db.prepare("UPDATE print_jobs SET status = 'printing', attempts = attempts + 1 WHERE id = ? AND status IN ('pending','failed')").run(id); return send(res, 200, { claimed: r.changes === 1 }); }
        if (mm[2] === 'done') { db.prepare("UPDATE print_jobs SET status = 'printed', printed_at = ?, last_error = NULL WHERE id = ? AND status = 'printing'").run(new Date().toISOString(), id); return send(res, 200, { ok: true }); }
        const b = await jsonBody(req); db.prepare("UPDATE print_jobs SET status = 'failed', last_error = ? WHERE id = ? AND status = 'printing'").run(String(b.error || 'fout').slice(0, 200), id); return send(res, 200, { ok: true });
      }

      if (m === 'GET' && p === '/api/admin/slots') {
        const date = url.searchParams.get('date') || S.amsParts(deps.now()).date, s = S.getSettings(db);
        const H = S.dayHours(s, date);
        const rows = []; if (H) for (let t = Math.ceil(H.open / s.slotMinutes) * s.slotMinutes; t <= H.close - s.slotMinutes; t += s.slotMinutes) {
          const time = S.hm(t), key = `${date} ${time}`;
          rows.push({ time, used: S.slotCount(db, date, time, deps.now()), limit: key in s.slotLimits ? s.slotLimits[key] : s.maxPerSlot, closed: s.closedSlots.includes(key) });
        }
        return send(res, 200, { date, open: !!H, slots: rows });
      }

      /* instellingen en menu: alleen eigenaar voor wijzigingen */
      if (m === 'GET' && p === '/api/admin/settings') return send(res, 200, { settings: S.getSettings(db) });
      if (m === 'PUT' && p === '/api/admin/settings') {
        try { const next = S.validateSettings(await jsonBody(req), S.getSettings(db)); S.saveSettings(db, next); log(null, 'settings', { by: who }); return send(res, 200, { settings: next }); }
        catch (e) { return send(res, e.status || 400, { error: e.message }); }
      }
      if (m === 'GET' && p === '/api/admin/catalog') return send(res, 200, { catalog: S.catalog(db, false) });
      if (m === 'POST' && p === '/api/admin/products') {
        const b = await jsonBody(req);
        try {
          const name = String(b.name || '').trim().slice(0, 80), price = Math.round(Number(b.price) * 100), menu = b.menu === null || b.menu === '' || b.menu == null ? null : Math.round(Number(b.menu) * 100);
          if (!name || !(price >= 0 && price <= 100000) || (menu !== null && !(menu >= 0 && menu <= 100000)) || !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(b.category)) throw O.err('Ongeldige productgegevens');
          if (name.includes('|')) throw O.err('Een naam mag geen | bevatten');
          db.prepare('INSERT INTO products (category_id, name, price_cents, menu_price_cents, sort) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort),0)+1 FROM products WHERE category_id = ?))').run(b.category, name, price, menu, b.category);
          log(null, 'product_add', { name, by: who });
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, e.status || 400, { error: /UNIQUE/.test(e.message) ? 'Dit product bestaat al in deze categorie' : e.message }); }
      }
      if ((mm = /^\/api\/admin\/products\/(\d+)$/.exec(p)) && (m === 'PATCH' || m === 'DELETE')) {
        const id = Number(mm[1]);
        if (m === 'DELETE') { db.prepare('DELETE FROM products WHERE id = ?').run(id); log(null, 'product_delete', { id, by: who }); return send(res, 200, { ok: true }); }
        const b = await jsonBody(req), cur = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!cur) return send(res, 404, { error: 'Niet gevonden' });
        try {
          const name = b.name != null ? String(b.name).trim().slice(0, 80) : cur.name;
          const price = b.price != null ? Math.round(Number(b.price) * 100) : cur.price_cents;
          const menu = 'menu' in b ? (b.menu === null || b.menu === '' ? null : Math.round(Number(b.menu) * 100)) : cur.menu_price_cents;
          const active = b.active != null ? (b.active ? 1 : 0) : cur.active;
          if (!name || name.includes('|') || !(price >= 0 && price <= 100000) || (menu !== null && !(menu >= 0 && menu <= 100000))) throw O.err('Ongeldige productgegevens');
          db.prepare('UPDATE products SET name = ?, price_cents = ?, menu_price_cents = ?, active = ? WHERE id = ?').run(name, price, menu, active, id);
          log(null, 'product_edit', { id, by: who });
          return send(res, 200, { ok: true });
        } catch (e) { return send(res, e.status || 400, { error: /UNIQUE/.test(e.message) ? 'Dit product bestaat al in deze categorie' : e.message }); }
      }
      if ((mm = /^\/api\/admin\/categories\/([a-z0-9-]+)$/.exec(p)) && m === 'PATCH') {
        const b = await jsonBody(req);
        if (b.active != null) db.prepare('UPDATE categories SET active = ? WHERE id = ?').run(b.active ? 1 : 0, mm[1]);
        if (b.name != null && String(b.name).trim()) db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(String(b.name).trim().slice(0, 60), mm[1]);
        log(null, 'category_edit', { id: mm[1], by: who });
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'Niet gevonden' });
    }
    return send(res, 404, { error: 'Niet gevonden' });
  }

  /* ---------- statische bestanden (voor lokaal gebruik; online staan de pagina's op Netlify) ---------- */
  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    if (rel === '/beheer') rel = '/beheer.html';
    if (rel === '/privacy') rel = '/privacy.html';
    const file = path.normalize(path.join(ROOT, rel));
    const ext = path.extname(file).toLowerCase();
    const first = path.relative(ROOT, file).split(path.sep)[0];
    if (!file.startsWith(ROOT + path.sep) || !TYPES[ext] || ['data', 'node_modules', 'lib', 'test', 'voorbeeld-emails', 'cutouts', 'dist', 'scripts'].includes(first) || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Niet gevonden');
    }
    res.writeHead(200, { 'Content-Type': TYPES[ext], 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    res.end(fs.readFileSync(file));
  }

  const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    let url; try { url = new URL(req.url, publicUrl); } catch (_) { res.writeHead(400); return res.end(); }
    if (url.pathname.startsWith('/api/')) {
      api(req, res, url).catch((e) => { if (!e.status) console.error(e); if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Serverfout' }); });
    } else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  });

  /* ---------- achtergrondtaken ---------- */
  const timers = [];
  async function maintenance() {
    try {
      auth.cleanSessions(db);
      if (retentionDays > 0) {
        const n = O.purgePersonalData(db, retentionDays, deps.now()); if (n) log(null, 'purge', { orders: n, days: retentionDays });
      }
      const copyDays = Number(env.MAIL_COPY_DAYS || 7);
      const k = mail.purgeMailCopies(dataDir, copyDays, deps.now()); if (k) log(null, 'purge_mail_copies', { files: k, days: copyDays });
    } catch (e) { log(null, 'maintenance_error', { error: e.message }); }
  }
  async function backupIfDue() {
    try {
      const last = backup.listBackups(backupDir)[0];
      if (!last || deps.now() - new Date(last.modified).getTime() > 23 * 3600 * 1000) await backupNow('automatisch');
    } catch (e) { console.error('Back-up mislukt:', e.message); }
  }
  function start() {
    timers.push(setInterval(() => { O.sweepPending(ctx).catch((e) => log(null, 'sweep_error', { error: e.message })); runPrint(); runOutbox().catch(() => {}); }, 30000));
    timers.push(setInterval(maintenance, 3600000));
    timers.push(setInterval(backupIfDue, 15 * 60000));   /* maakt een back-up als de laatste ouder is dan 23 uur */
    timers.forEach((t) => t.unref && t.unref());
    setTimeout(() => { maintenance(); backupIfDue(); runOutbox().catch(() => {}); }, 3000).unref();
  }
  function stop() { timers.forEach(clearInterval); server.close(); if (server.closeAllConnections) server.closeAllConnections(); }

  return { server, ctx, db, start, stop, publicUrl, runPrint, runOutbox, backupNow, systemStatus, maintenance };
}

module.exports = { createApp };
