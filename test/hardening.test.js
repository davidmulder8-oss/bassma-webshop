'use strict';
/*
 * Tests voor beveiliging, back-ups, e-mailwachtrij en storingen. SumUp, adressen en de printer zijn nagebouwd.
 * Uitvoeren: npm test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const { createApp } = require('../lib/app');
const { open } = require('../lib/db');
const auth = require('../lib/auth');
const backup = require('../lib/backup');
const mail = require('../mail');

const ROOT = path.join(__dirname, '..');
const NOW0 = Date.UTC(2026, 9, 21, 10, 0);
const SLOT = { date: '2026-10-21', time: '18:00' };
const ITEMS = [{ id: 'wraps|Shoarma', qty: 1, menu: true }];
const CUST = { name: 'Test Klant', phone: '0612345678', email: 'klant@example.com' };
const OWNER = 'Zomerse-Koffiebonen-91', STAFF = 'Blauwe-Fietsen-Rijden-47';

function fakeNet() {
  const st = { checkouts: {}, n: 0, refunds: [], refundDelay: 0 };
  const res = (status, obj) => ({ ok: status < 300, status, json: async () => obj });
  st.fetch = async (url, opts = {}) => {
    const u = String(url), method = (opts.method || 'GET').toUpperCase();
    if (u.includes('api.pdok.nl')) return res(200, { response: { docs: [{ woonplaatsnaam: 'Gorinchem', centroide_ll: 'POINT(4.9700 51.8400)' }] } });
    if (u.endsWith('/v0.1/checkouts') && method === 'POST') {
      const b = JSON.parse(opts.body), id = 'co_' + (++st.n);
      st.checkouts[id] = { id, status: 'PENDING', amount: b.amount, currency: b.currency, merchant_code: b.merchant_code, checkout_reference: b.checkout_reference, transactions: [], hosted_checkout_url: 'https://pay.sumup.test/' + id, body: b };
      return res(201, { id, hosted_checkout_url: st.checkouts[id].hosted_checkout_url });
    }
    const m = /\/v0\.1\/checkouts\/([^/?]+)$/.exec(u);
    if (m && method === 'GET') { const c = st.checkouts[m[1]]; return c ? res(200, c) : res(404, {}); }
    if (/\/refunds$/.test(u) && method === 'POST') { st.refunds.push(JSON.parse(opts.body || '{}')); if (st.refundDelay) await new Promise((r) => setTimeout(r, st.refundDelay)); return res(200, {}); }
    return res(500, {});
  };
  st.setStatus = (id, status) => { st.checkouts[id].status = status; if (status === 'PAID') st.checkouts[id].transactions = [{ id: 'tx_' + id, status: 'SUCCESSFUL' }]; };
  return st;
}

async function boot(extraEnv = {}) {
  const T = { now: NOW0 }, n = fakeNet(), printed = [];
  const env = Object.assign({ SUMUP_API_KEY: 'k', SUMUP_MERCHANT_CODE: 'MC123', PAYMENT_PROVIDER: 'sumup', PUBLIC_URL: 'https://shop.test' }, extraEnv);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bassma-h-'));
  const db = open(':memory:');
  const app = createApp({ env, db, dataDir, deps: { fetch: n.fetch, now: () => T.now }, sendRaw: async (h, p, buf) => { printed.push(buf); } });
  auth.createUser(db, 'eigenaar', OWNER, 'owner');
  auth.createUser(db, 'medewerker', STAFF, 'staff');
  await new Promise((r) => app.server.listen(0, r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const hdrs = extraEnv.__h || {};
  const http_ = async (p, o = {}) => { const r = await fetch(base + p, Object.assign({}, o, { headers: Object.assign({}, hdrs, o.headers || {}) })); let j = null; try { j = await r.json(); } catch (_) { /* geen json */ } return { status: r.status, json: j, headers: r.headers }; };
  const post = (p, b, h = {}) => http_(p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify(b) });
  const login = async (user, pw, extra = {}) => {
    const r = await post('/api/admin/login', { username: user, password: pw }, extra);
    if (r.status !== 200) return { r };
    const cookie = r.headers.get('set-cookie').split(';')[0];
    return { r, cookie, csrf: r.json.csrf, call: (m, p, b) => http_(p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': r.json.csrf }, extra), body: b ? JSON.stringify(b) : undefined }) };
  };
  const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Time-out in test'); };
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const order = (o = {}) => post('/api/orders', Object.assign({ items: ITEMS, type: 'pickup', slot: SLOT, customer: CUST, payment: 'online' }, o));
  const webhook = (id) => fetch(base + '/api/webhook/sumup', { method: 'POST', headers: Object.assign({}, hdrs, { 'Content-Type': 'application/json' }), body: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id }) });
  return { app, db, net: n, T, printed, base, http: http_, post, login, until, q, order, webhook, dataDir, stop: () => { app.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

/* Kleine SMTP-server om te testen dat e-mail echt wordt afgeleverd (en opnieuw wordt geprobeerd bij een storing) */
function smtpServer() {
  const st = { mails: [], down: false };
  const srv = net.createServer((s) => {
    if (st.down) { s.write('421 Service niet beschikbaar\r\n'); s.end(); return; }
    s.write('220 test ESMTP\r\n');
    let data = '', inData = false, buf = '';
    s.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while (!inData && (i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') s.write('250-localhost\r\n250 8BITMIME\r\n');
        else if (cmd === 'MAIL' || cmd === 'RCPT' || cmd === 'RSET') s.write('250 OK\r\n');
        else if (cmd === 'DATA') { s.write('354 Ga door\r\n'); inData = true; data = ''; }
        else if (cmd === 'QUIT') { s.write('221 Dag\r\n'); s.end(); }
        else s.write('250 OK\r\n');
      }
      if (inData) {
        data += buf; buf = '';
        const end = data.indexOf('\r\n.\r\n');
        if (end >= 0) { st.mails.push(data.slice(0, end)); inData = false; buf = data.slice(end + 5); data = ''; s.write('250 Aangenomen\r\n'); }
      }
    });
    s.on('error', () => {});
  });
  st.listen = () => new Promise((r) => srv.listen(0, '127.0.0.1', () => { st.port = srv.address().port; r(); }));
  st.close = () => new Promise((r) => { srv.close(r); srv.closeAllConnections && srv.closeAllConnections(); });
  return st;
}

/* ---------- terugbetalen ---------- */
test('twee gelijktijdige klikken op Terugbetalen geven één terugbetaling', async () => {
  const c = await boot(); c.net.refundDelay = 150;
  await c.order(); c.net.setStatus('co_1', 'PAID'); await c.webhook('co_1');
  await c.until(() => c.q('SELECT pay_status FROM orders')[0].pay_status === 'paid');
  const own = await c.login('eigenaar', OWNER), id = c.q('SELECT id FROM orders')[0].id;
  const rs = await Promise.all([own.call('POST', `/api/admin/orders/${id}/refund`, {}), own.call('POST', `/api/admin/orders/${id}/refund`, {}), own.call('POST', `/api/admin/orders/${id}/refund`, {})]);
  assert.equal(c.net.refunds.length, 1, 'maar één terugbetaling bij SumUp');
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal(c.q('SELECT pay_status FROM orders')[0].pay_status, 'refunded');
  assert.equal(c.q('SELECT refund_busy FROM orders')[0].refund_busy, 0, 'slot weer vrij');
  c.stop();
});

/* ---------- wachtwoorden en gebruikers ---------- */
test('wachtwoordbeleid, wijzigen, gebruikers beheren en proef-accounts herkennen', async () => {
  const c = await boot();
  for (const bad of ['kort', 'password12345', 'welkom123456', 'iemand-wandelt-12', 'aaaaaaaaaaaaaa', 'Wachtwoord123']) assert.throws(() => auth.createUser(c.db, 'iemand', bad, 'staff'), /wachtwoord|tekens|raden/i, 'geweigerd: ' + bad);
  auth.createUser(c.db, 'iemand', 'Rode-Peren-Fluiten-58', 'staff');   /* sterke zin mag */
  const own = await c.login('eigenaar', OWNER);
  /* nieuwe gebruiker aanmaken (eigenaar) */
  assert.equal((await own.call('POST', '/api/admin/users', { username: 'collega', password: 'zwak', role: 'staff' })).status, 400);
  assert.equal((await own.call('POST', '/api/admin/users', { username: 'collega', password: 'Gele-Wolken-Drijven-83', role: 'staff' })).status, 200);
  assert.equal((await own.call('POST', '/api/admin/users', { username: 'collega', password: 'Gele-Wolken-Drijven-83', role: 'staff' })).status, 400, 'dubbele naam');
  const staff = await c.login('medewerker', STAFF);
  assert.equal((await staff.call('GET', '/api/admin/users')).status, 403, 'medewerker ziet geen gebruikerslijst');
  /* eigen wachtwoord wijzigen: oude moet kloppen, nieuwe moet sterk zijn, andere sessies worden uitgelogd */
  const other = await c.login('medewerker', STAFF);
  assert.equal((await staff.call('POST', '/api/admin/password', { old: 'fout', new: 'Paarse-Olifanten-Dansen-29' })).status, 400);
  assert.equal((await staff.call('POST', '/api/admin/password', { old: STAFF, new: 'korter' })).status, 400);
  const ch = await staff.call('POST', '/api/admin/password', { old: STAFF, new: 'Paarse-Olifanten-Dansen-29' });
  assert.equal(ch.status, 200);
  assert.equal((await other.call('GET', '/api/admin/me')).status, 401, 'andere sessie is uitgelogd');
  assert.equal((await c.login('medewerker', STAFF)).r.status, 401, 'oud wachtwoord werkt niet meer');
  assert.equal((await c.login('medewerker', 'Paarse-Olifanten-Dansen-29')).r.status, 200);
  /* uitschakelen */
  const id = c.q("SELECT id FROM users WHERE username = 'collega'")[0].id;
  const colSess = await c.login('collega', 'Gele-Wolken-Drijven-83');
  assert.equal((await own.call('PATCH', `/api/admin/users/${id}`, { disabled: true })).status, 200);
  assert.equal((await colSess.call('GET', '/api/admin/me')).status, 401, 'uitgeschakelde gebruiker is direct uitgelogd');
  assert.equal((await c.login('collega', 'Gele-Wolken-Drijven-83')).r.status, 401);
  const selfId = c.q("SELECT id FROM users WHERE username = 'eigenaar'")[0].id;
  assert.equal((await own.call('PATCH', `/api/admin/users/${selfId}`, { disabled: true })).status, 400, 'jezelf uitschakelen kan niet');
  /* proef-accounts: worden gesignaleerd en blokkeren de start in productie */
  assert.deepEqual(auth.demoUsers(c.db), []);
  auth.createUser(c.db, 'proef', 'proefversie2026', 'owner', { demo: true });
  assert.deepEqual(auth.demoUsers(c.db), ['proef']);
  assert.ok((await own.call('GET', '/api/admin/system')).json.warnings.some((w) => /proef-inloggegevens/.test(w)));
  c.stop();
});

test('start in productie wordt geweigerd zolang er proef-inloggegevens zijn', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bassma-prod-'));
  const db = open(path.join(dir, 'bassma.db'));
  auth.createUser(db, 'eigenaar', 'proefversie2026', 'owner', { demo: true });
  db.close();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server.js')], { env: Object.assign({}, process.env, { NODE_ENV: 'production', DATA_DIR: dir, PORT: '0', PUBLIC_URL: 'https://shop.test' }), encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /proef-inloggegevens/);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ---------- verkeer via Netlify en blokkade bij foute pogingen ---------- */
test('alleen verkeer via de website: ondertekende aanvragen van Netlify of een gedeeld geheim', async () => {
  const c = await boot({ PROXY_SECRET: 'delen-met-netlify-12345' });
  assert.equal((await c.http('/api/config')).status, 403, 'zonder geheim geweigerd');
  assert.equal((await c.http('/api/config', { headers: { 'x-shop-proxy': 'fout' } })).status, 403);
  assert.equal((await c.http('/api/config', { headers: { 'x-shop-proxy': 'delen-met-netlify-12345' } })).status, 200);
  assert.equal((await c.http('/api/health')).status, 200, 'gezondheidscontrole werkt altijd');
  assert.equal((await c.http('/api/health')).json.ok, true);
  c.stop();
  const secret = 'netlify-handtekening-geheim';
  const d = await boot({ NETLIFY_SIGN_SECRET: secret });
  const jws = (payload, key = secret, alg = 'HS256') => { const h = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url'), p = Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${h}.${p}.${crypto.createHmac('sha256', key).update(h + '.' + p).digest('base64url')}`; };
  const ok = jws({ iss: 'netlify', exp: Math.floor(NOW0 / 1000) + 60 });
  assert.equal((await d.http('/api/config', { headers: { 'x-nf-sign': ok } })).status, 200);
  assert.equal((await d.http('/api/config', { headers: { 'x-nf-sign': jws({ iss: 'netlify' }, 'ander-geheim') } })).status, 403, 'verkeerde handtekening');
  assert.equal((await d.http('/api/config', { headers: { 'x-nf-sign': jws({ iss: 'netlify', exp: Math.floor(NOW0 / 1000) - 10 }) } })).status, 403, 'verlopen');
  assert.equal((await d.http('/api/config', { headers: { 'x-nf-sign': jws({ iss: 'netlify' }, secret, 'none') } })).status, 403, 'alg moet HS256 zijn');
  assert.equal((await d.http('/api/config')).status, 403);
  d.stop();
});

test('foute inlogpogingen blokkeren alleen de aanvaller, niet de echte beheerder', async () => {
  const c = await boot({ PROXY_SECRET: 'geheim-geheim-12345', CLIENT_IP_HEADER: 'x-forwarded-for' });
  const via = (ip) => ({ 'x-shop-proxy': 'geheim-geheim-12345', 'x-forwarded-for': ip });
  const bad = (ip) => c.post('/api/admin/login', { username: 'eigenaar', password: 'fout-wachtwoord' }, via(ip));
  const codes = []; for (let i = 0; i < 7; i++) codes.push((await bad('203.0.113.9')).status);
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]); assert.equal(codes[5], 429); assert.equal(codes[6], 429);
  const good = await c.post('/api/admin/login', { username: 'eigenaar', password: OWNER }, via('198.51.100.7'));
  assert.equal(good.status, 200, 'echte beheerder vanaf een ander IP kan gewoon inloggen');
  /* zonder bewezen proxy wordt de IP-header genegeerd: wisselen van header helpt een aanvaller niet */
  const d = await boot({ CLIENT_IP_HEADER: 'x-forwarded-for' });
  const r = []; for (let i = 0; i < 7; i++) r.push((await d.post('/api/admin/login', { username: 'eigenaar', password: 'fout-wachtwoord' }, { 'x-forwarded-for': '10.0.0.' + i })).status);
  assert.equal(r[5], 429, 'header nagemaakt door aanvaller wordt niet vertrouwd');
  c.stop(); d.stop();
});

/* ---------- tijdsloten blokkeren ---------- */
test('één persoon kan niet alle tijdsloten blokkeren met onbetaalde bestellingen', async () => {
  const c = await boot();
  assert.equal((await c.order({ slot: { date: '2026-10-21', time: '18:00' } })).status, 200);
  assert.equal((await c.order({ slot: { date: '2026-10-21', time: '18:15' } })).status, 200);
  const third = await c.order({ slot: { date: '2026-10-21', time: '18:30' } });
  assert.equal(third.status, 429); assert.match(third.json.error, /op betaling wacht/);
  /* een andere klant kan gewoon bestellen */
  assert.equal((await c.order({ slot: { date: '2026-10-21', time: '18:30' }, customer: { name: 'Ander', phone: '0698765432', email: 'ander@example.com' } })).status, 200);
  /* na het verlopen van de reservering (17 min) kan de eerste klant weer bestellen */
  c.T.now += 18 * 60000;
  assert.equal((await c.order({ slot: { date: '2026-10-21', time: '19:00' } })).status, 200);
  assert.equal(c.net.checkouts.co_1.body.valid_until && (new Date(c.net.checkouts.co_1.body.valid_until).getTime() > 0), true);
  c.stop();
});

/* ---------- e-mail: wachtrij, opnieuw proberen, geen kopieën van klantgegevens ---------- */
test('e-mail: bij storing opnieuw proberen, daarna precies één keer afgeleverd', async () => {
  const smtp = smtpServer(); await smtp.listen();
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), MAIL_FROM: 'test@shop.test' }); mail.resetTransporter();
  const c = await boot({ SMTP_HOST: '127.0.0.1' });
  try {
    smtp.down = true;
    await c.order({ payment: 'cash' });
    await c.until(() => c.q("SELECT * FROM mail_outbox WHERE status = 'failed'").length === 1);
    assert.equal(smtp.mails.length, 0);
    assert.equal(c.q('SELECT attempts FROM mail_outbox')[0].attempts, 1);
    assert.ok(c.q("SELECT * FROM events WHERE type = 'mail_error'").length === 1, 'storing in het logboek');
    assert.ok((await (await c.login('eigenaar', OWNER)).call('GET', '/api/admin/system')).json.warnings.some((w) => /e-mail\(s\) konden niet/.test(w)));
    await c.app.runOutbox();   /* binnen het wachtinterval: nog geen nieuwe poging */
    assert.equal(c.q('SELECT attempts FROM mail_outbox')[0].attempts, 1);
    smtp.down = false; c.T.now += 61000;
    await c.app.runOutbox(); await c.app.runOutbox();
    assert.equal(smtp.mails.length, 1, 'precies één mail afgeleverd');
    assert.match(smtp.mails[0], /Subject: =?[^\r\n]*|Subject: Bedankt voor je bestelling/);
    assert.equal(c.q('SELECT status FROM mail_outbox')[0].status, 'sent');
    assert.ok(!fs.existsSync(path.join(c.dataDir, 'mails')) || fs.readdirSync(path.join(c.dataDir, 'mails')).length === 0, 'met werkende SMTP geen kopie van klantgegevens op schijf');
  } finally { delete process.env.SMTP_HOST; delete process.env.SMTP_PORT; delete process.env.MAIL_FROM; mail.resetTransporter(); c.stop(); await smtp.close(); }
});

test('mailkopieën (alleen zonder SMTP) worden na de bewaartermijn gewist', async () => {
  mail.resetTransporter();
  const c = await boot();
  await c.order({ payment: 'cash' });
  await c.until(() => fs.existsSync(path.join(c.dataDir, 'mails')) && fs.readdirSync(path.join(c.dataDir, 'mails')).length === 1);
  assert.equal(mail.purgeMailCopies(c.dataDir, 7, NOW0 + 3 * 86400000), 0);
  assert.equal(mail.purgeMailCopies(c.dataDir, 7, Date.now() + 8 * 86400000), 1);
  assert.equal(fs.readdirSync(path.join(c.dataDir, 'mails')).length, 0);
  c.stop();
});

/* ---------- back-ups ---------- */
test('AWS-handtekening (SigV4) klopt met het officiële voorbeeld van Amazon', () => {
  const s = backup.signV4({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', canonicalUri: '/test.txt', headers: { range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', region: 'us-east-1', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', now: new Date('2013-05-24T00:00:00Z') });
  assert.equal(s.signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('back-up: veilige kopie, versleuteld, naar externe opslag, opruimen en terugzetten', async () => {
  const c = await boot();
  await c.order({ payment: 'cash' });
  const dir = path.join(c.dataDir, 'backups');
  /* externe opslag (S3-protocol) nagebootst */
  const got = [];
  const s3 = http.createServer((req, res) => { const ch = []; req.on('data', (d) => ch.push(d)); req.on('end', () => { got.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(ch) }); res.writeHead(200); res.end(); }); });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  const env = { BACKUP_ENCRYPTION_KEY: 'een-lange-geheime-zin-voor-de-test', BACKUP_KEEP: '2', BACKUP_S3_ENDPOINT: 'http://127.0.0.1:' + s3.address().port, BACKUP_S3_BUCKET: 'bassma-backups', BACKUP_S3_ACCESS_KEY: 'AKTEST', BACKUP_S3_SECRET_KEY: 'geheimtest', BACKUP_S3_REGION: 'eu-central-1' };
  let r;
  for (let i = 0; i < 4; i++) r = await backup.runBackup(c.db, dir, env, new Date(NOW0 + i * 86400000));
  assert.ok(r.encrypted && r.uploaded && r.orders === 1);
  assert.ok(r.file.endsWith('.db.gz.enc'));
  assert.equal(backup.listBackups(dir).length, 2, 'alleen de nieuwste 2 lokaal bewaard');
  assert.equal(got.length, 4);
  const up = got[3];
  assert.equal(up.method, 'PUT'); assert.match(up.url, /^\/bassma-backups\/bassma\/bassma-.*\.db\.gz\.enc$/);
  assert.match(up.headers.authorization, /^AWS4-HMAC-SHA256 Credential=AKTEST\/\d{8}\/eu-central-1\/s3\/aws4_request, SignedHeaders=.*host.*x-amz-content-sha256.*x-amz-date, Signature=[a-f0-9]{64}$/);
  assert.equal(up.headers['x-amz-content-sha256'], crypto.createHash('sha256').update(up.body).digest('hex'));
  assert.ok(!up.body.includes(Buffer.from('Test Klant')) && !up.body.includes(Buffer.from('SQLite format')), 'in het bestand staan geen leesbare gegevens');
  /* zonder externe opslag of sleutel mislukt niets stil */
  await assert.rejects(() => backup.runBackup(c.db, dir, Object.assign({}, env, { BACKUP_S3_ENDPOINT: 'http://127.0.0.1:1' }), new Date(NOW0 + 9 * 86400000)), /Printer|ECONNREFUSED|externe|connect/i);
  s3.close();
  /* terugzetten via restore-backup.js */
  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bassma-restore-'));
  const run = (args, key) => spawnSync(process.execPath, [path.join(ROOT, 'restore-backup.js'), ...args], { env: Object.assign({}, process.env, { DATA_DIR: restoreDir, BACKUP_ENCRYPTION_KEY: key }), encoding: 'utf8' });
  const bad = run([r.file], 'verkeerde-sleutel'); assert.equal(bad.status, 1); assert.match(bad.stderr, /verkeerde sleutel/);
  const check = run([r.file], env.BACKUP_ENCRYPTION_KEY); assert.equal(check.status, 0); assert.match(check.stdout, /1 bestelling/); assert.ok(!fs.existsSync(path.join(restoreDir, 'bassma.db')), 'zonder --zet-terug verandert er niets');
  const doit = run([r.file, '--zet-terug'], env.BACKUP_ENCRYPTION_KEY); assert.equal(doit.status, 0, doit.stderr);
  const restored = open(path.join(restoreDir, 'bassma.db'));
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);
  assert.equal(restored.prepare('SELECT name FROM orders').get().name, 'Test Klant');
  restored.close();
  /* tweede keer terugzetten bewaart de bestaande database */
  const again = run([r.file, '--zet-terug'], env.BACKUP_ENCRYPTION_KEY); assert.equal(again.status, 0);
  assert.ok(fs.readdirSync(restoreDir).some((f) => f.includes('voor-herstel')), 'oude database bewaard');
  fs.rmSync(restoreDir, { recursive: true, force: true });
  c.stop();
});

test('beheer: back-up maken is alleen voor de eigenaar en de systeemstatus waarschuwt', async () => {
  const c = await boot();
  const staff = await c.login('medewerker', STAFF), own = await c.login('eigenaar', OWNER);
  assert.equal((await staff.call('POST', '/api/admin/backup', {})).status, 403);
  const before = (await own.call('GET', '/api/admin/system')).json;
  assert.ok(before.warnings.some((w) => /geen back-up/.test(w)));
  assert.ok(before.warnings.some((w) => /niet versleuteld/.test(w)));
  assert.ok(before.warnings.some((w) => /externe plek/.test(w)));
  const r = await own.call('POST', '/api/admin/backup', {});
  assert.equal(r.status, 200); assert.equal(r.json.orders, 0);
  const after = (await own.call('GET', '/api/admin/system')).json;
  assert.equal(after.backups.length, 1);
  assert.ok(!after.warnings.some((w) => /geen back-up/.test(w)));
  assert.equal(c.q("SELECT * FROM events WHERE type = 'backup_ok'").length, 1);
  c.stop();
});

/* ---------- storingen en verzoeken die niet mogen ---------- */
test('te grote aanvraag krijgt een nette 413 en de server blijft draaien; veiligheidskoppen aanwezig', async () => {
  const c = await boot();
  const big = await c.post('/api/orders', { x: 'y'.repeat(300000) });
  assert.equal(big.status, 413);
  assert.equal((await c.http('/api/config')).status, 200);
  const h = (await c.http('/')).headers;
  assert.match(h.get('content-security-policy'), /default-src 'self'/);
  assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.ok(h.get('permissions-policy')); assert.ok(h.get('strict-transport-security'));
  assert.equal(h.get('x-frame-options'), 'DENY');
  c.stop();
});

test('SumUp onbereikbaar: klant krijgt een duidelijke fout, tijdslot komt vrij, niets blijft hangen', async () => {
  const c = await boot();
  const orig = c.net.fetch; c.app.ctx.providers.sumup; /* provider gebruikt c.net.fetch via deps */
  let down = true;
  const realCreate = c.app.ctx.providers.active.create;
  c.app.ctx.providers.active.create = async (...a) => { if (down) throw new Error('netwerk onbereikbaar'); return realCreate.apply(c.app.ctx.providers.active, a); };
  const r = await c.order();
  assert.equal(r.status, 502); assert.match(r.json.error, /opnieuw/);
  assert.equal(c.q('SELECT pay_status FROM orders')[0].pay_status, 'failed');
  down = false;
  assert.equal((await c.order()).status, 200, 'direct daarna opnieuw bestellen kan');
  void orig;
  c.stop();
});

