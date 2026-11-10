'use strict';
/*
 * Geautomatiseerde tests. SumUp, PDOK (adressen) en de printer zijn hier NAGEBOOTST, zodat elk scenario
 * herhaalbaar is. Dit bewijst de logica van onze server, niet de echte SumUp-account of printer.
 * Uitvoeren: npm test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createApp } = require('../lib/app');
const { open } = require('../lib/db');
const auth = require('../lib/auth');
const S = require('../lib/settings');
const O = require('../lib/orders');

const NOW0 = Date.UTC(2026, 9, 21, 10, 0);   /* woensdag 21 oktober 2026, 12:00 Nederlandse tijd */
const SLOT = { date: '2026-10-21', time: '18:00' };
const ITEMS = [{ id: 'wraps|Shoarma', qty: 1, menu: true }];   /* € 14,90 */
const BIG = [{ id: 'schotels|Lamsshoarma', qty: 4 }];           /* € 65,80 */
const CUST = { name: 'Test Klant', phone: '0612345678', email: 'klant@example.com' };

function fakeNet() {
  const st = { checkouts: {}, n: 0, refunds: [], priceDelta: 0 };
  const res = (status, obj) => ({ ok: status < 300, status, json: async () => obj });
  const fetchFn = async (url, opts = {}) => {
    const u = String(url), method = (opts.method || 'GET').toUpperCase();
    if (u.includes('api.pdok.nl')) {
      const q = new URL(u).searchParams.get('q') || '';
      if (/Amsterdam/i.test(q)) return res(200, { response: { docs: [{ woonplaatsnaam: 'Amsterdam', centroide_ll: 'POINT(4.89 52.37)' }] } });
      if (/Sliedrecht/i.test(q)) return res(200, { response: { docs: [{ woonplaatsnaam: 'Sliedrecht', centroide_ll: 'POINT(4.77 51.82)' }] } });
      if (/Nergens/i.test(q)) return res(200, { response: { docs: [] } });
      return res(200, { response: { docs: [{ woonplaatsnaam: 'Gorinchem', centroide_ll: 'POINT(4.9700 51.8400)' }] } });
    }
    if (u.endsWith('/v0.1/checkouts') && method === 'POST') {
      const b = JSON.parse(opts.body), id = 'co_' + (++st.n);
      assert.equal(b.hosted_checkout.enabled, true);
      assert.equal(b.currency, 'EUR');
      st.checkouts[id] = { id, status: 'PENDING', amount: b.amount, currency: b.currency, merchant_code: b.merchant_code, checkout_reference: b.checkout_reference, transactions: [], hosted_checkout_url: 'https://pay.sumup.test/' + id, body: b };
      return res(201, { id, hosted_checkout_url: st.checkouts[id].hosted_checkout_url });
    }
    let m = /\/v0\.1\/checkouts\/([^/?]+)$/.exec(u);
    if (m && method === 'GET') { const c = st.checkouts[m[1]]; return c ? res(200, c) : res(404, {}); }
    if (/\/refunds$/.test(u) && method === 'POST') { st.refunds.push({ url: u, body: JSON.parse(opts.body || '{}') }); return res(200, {}); }
    return res(500, {});
  };
  st.fetch = fetchFn;
  st.setStatus = (id, status, extra = {}) => { const c = st.checkouts[id]; c.status = status; Object.assign(c, extra); if (status === 'PAID') c.transactions = [{ id: 'tx_' + id, status: 'SUCCESSFUL' }]; };
  return st;
}

async function boot(extraEnv = {}) {
  const T = { now: NOW0 };
  const net = fakeNet();
  const printed = [], printer = { fail: false };
  const env = Object.assign({ SUMUP_API_KEY: 'sup_sk_test', SUMUP_MERCHANT_CODE: 'MC123', PAYMENT_PROVIDER: 'sumup', PUBLIC_URL: 'https://shop.test', PRINTER_HOST: 'printer.local' }, extraEnv);
  if (env.PRINTER_HOST === null) delete env.PRINTER_HOST;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bassma-'));
  const db = open(':memory:');
  const app = createApp({
    env, db, dataDir, deps: { fetch: net.fetch, now: () => T.now },
    sendRaw: extraEnv.REAL_PRINTER ? undefined : async (host, port, buf) => { if (printer.fail) throw new Error('Printer niet bereikbaar'); printed.push(buf.toString('latin1')); }
  });
  auth.createUser(db, 'eigenaar', 'Zomerse-Koffiebonen-91', 'owner');
  auth.createUser(db, 'medewerker', 'Blauwe-Fietsen-Rijden-47', 'staff');
  await new Promise((r) => app.server.listen(0, r));
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const http = async (p, opts = {}) => { const r = await fetch(base + p, opts); let j = null; try { j = await r.json(); } catch (_) { /* geen json */ } return { status: r.status, json: j, headers: r.headers }; };
  const post = (p, body, headers = {}) => http(p, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) });
  async function login(user, pass) {
    const r = await post('/api/admin/login', { username: user, password: pass });
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    return { cookie, csrf: r.json.csrf, H: { Cookie: cookie, 'X-CSRF-Token': r.json.csrf }, call: (m, p, body) => http(p, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': r.json.csrf }, {}), body: body ? JSON.stringify(body) : undefined }) };
  }
  const webhook = (id) => fetch(base + '/api/webhook/sumup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'CHECKOUT_STATUS_CHANGED', id }) });
  const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Time-out in test'); };
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const stop = () => { app.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); };
  return { app, db, net, T, printed, printer, base, http, post, login, webhook, until, q, stop, dataDir };
}

const order = (c, over = {}) => c.post('/api/orders', Object.assign({ items: ITEMS, type: 'pickup', slot: SLOT, customer: CUST, payment: 'online' }, over));

test('menu en instellingen komen uit de database', async () => {
  const c = await boot();
  const r = await c.http('/api/config');
  assert.equal(r.status, 200);
  assert.ok(r.json.menu.length >= 17);
  assert.equal(r.json.payment.provider, 'sumup');
  assert.equal(r.json.delivery.zones[0].fee, 2);
  assert.equal(r.json.delivery.freeFrom, 60);
  c.stop();
});

test('geslaagde betaling: bon en mail pas na verificatie bij SumUp, en maar één keer', async () => {
  const c = await boot();
  const r = await order(c);
  assert.equal(r.status, 200);
  assert.match(r.json.checkoutUrl, /^https:\/\/pay\.sumup\.test\/co_1$/);
  assert.equal(c.q('SELECT * FROM print_jobs').length, 0, 'nog geen bon vóór betaling');
  assert.equal(c.printed.length, 0);
  const checkout = c.net.checkouts.co_1;
  assert.equal(checkout.amount, 14.9);
  assert.ok(checkout.body.return_url.endsWith('/api/webhook/sumup'));
  assert.match(checkout.body.redirect_url, /bedankt\.html\?o=[a-f0-9]{24}$/);

  /* een webhook zonder dat SumUp betaald meldt doet niets */
  await c.webhook('co_1');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(c.q('SELECT pay_status FROM orders')[0].pay_status, 'pending');
  assert.equal(c.q('SELECT * FROM print_jobs').length, 0);

  c.net.setStatus('co_1', 'PAID');
  await c.webhook('co_1');
  await c.until(() => c.q('SELECT pay_status FROM orders')[0].pay_status === 'paid');
  await c.until(() => c.printed.length === 1);
  assert.match(c.printed[0], /BAS-\d{6}/);
  assert.equal(c.q('SELECT * FROM print_jobs').length, 1);
  assert.equal(c.q("SELECT status FROM print_jobs")[0].status, 'printed');
  await c.until(() => fs.readdirSync(path.join(c.dataDir, 'mails')).some((f) => f.endsWith('-confirmed.html')));
  c.stop();
});

test('dubbele betaalmelding en dubbele verwerking leveren geen tweede bon of mail op', async () => {
  const c = await boot();
  await order(c);
  c.net.setStatus('co_1', 'PAID');
  await Promise.all([c.webhook('co_1'), c.webhook('co_1'), c.webhook('co_1')]);
  await c.until(() => c.q('SELECT pay_status FROM orders')[0].pay_status === 'paid');
  await new Promise((r) => setTimeout(r, 200));
  await c.webhook('co_1');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(c.q("SELECT * FROM events WHERE type = 'paid'").length, 1);
  assert.equal(c.q('SELECT * FROM print_jobs').length, 1);
  assert.equal(c.printed.length, 1);
  assert.equal(c.q("SELECT * FROM events WHERE type IN ('mail_sent','mail_saved')").length, 1);
  c.stop();
});

test('mislukte betaling levert geen betaalde bestelling of bon op en geeft het tijdslot vrij', async () => {
  const c = await boot({});
  c.db.prepare("INSERT INTO settings (key, value) VALUES ('config', ?)").run(JSON.stringify({ maxPerSlot: 1 }));
  const r = await order(c);
  assert.equal(r.status, 200);
  assert.equal((await order(c, { customer: Object.assign({}, CUST, { name: 'Tweede' }) })).status, 409, 'slot is gereserveerd tijdens het betalen');
  c.net.setStatus('co_1', 'FAILED');
  await c.webhook('co_1');
  await c.until(() => c.q('SELECT pay_status FROM orders')[0].pay_status === 'failed');
  assert.equal(c.q('SELECT * FROM print_jobs').length, 0);
  assert.equal(c.printed.length, 0);
  assert.equal((await order(c, { customer: Object.assign({}, CUST, { name: 'Derde' }) })).status, 200, 'slot weer vrij');
  c.stop();
});

test('vernieuwen/dubbelklikken met dezelfde Idempotency-Key maakt één bestelling', async () => {
  const c = await boot();
  const h = { 'Idempotency-Key': 'abc-123' };
  const [a, b] = await Promise.all([c.post('/api/orders', { items: ITEMS, type: 'pickup', slot: SLOT, customer: CUST, payment: 'online' }, h), c.post('/api/orders', { items: ITEMS, type: 'pickup', slot: SLOT, customer: CUST, payment: 'online' }, h)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(c.q('SELECT * FROM orders').length, 1);
  const again = await c.post('/api/orders', { items: ITEMS, type: 'pickup', slot: SLOT, customer: CUST, payment: 'online' }, h);
  assert.equal(again.json.duplicate, true);
  assert.equal(Object.keys(c.net.checkouts).length, 1, 'één checkout bij SumUp');
  c.stop();
});

test('afwijkend bedrag of verkeerde referentie wordt nooit als betaald gemarkeerd', async () => {
  const c = await boot();
  await order(c);
  c.net.setStatus('co_1', 'PAID', { amount: 1.0 });
  await c.webhook('co_1');
  await c.until(() => c.q("SELECT * FROM events WHERE type = 'payment_mismatch'").length === 1);
  assert.equal(c.q('SELECT pay_status FROM orders')[0].pay_status, 'pending');
  assert.equal(c.q('SELECT * FROM print_jobs').length, 0);
  c.stop();
});

test('prijzen komen van de server, niet van de browser', async () => {
  const c = await boot();
  const r = await order(c, { items: [{ id: 'wraps|Shoarma', qty: 1, menu: true, unitCents: 1, price: 0.01 }], total: 1 });
  assert.equal(r.status, 200);
  assert.equal(c.q('SELECT total_cents FROM orders')[0].total_cents, 1490);
  assert.equal(c.net.checkouts.co_1.amount, 14.9);
  c.stop();
});

test('afhaalbestelling contant: direct bon, nog te betalen vermeld', async () => {
  const c = await boot();
  const r = await order(c, { payment: 'cash' });
  assert.equal(r.status, 200);
  await c.until(() => c.printed.length === 1);
  assert.match(c.printed[0], /NOG TE BETALEN/);
  assert.match(c.printed[0], /AFHALEN/);
  c.stop();
});

test('bezorgen: € 2 in het gebied, gratis vanaf € 60, buiten het gebied geweigerd, uitschakelen werkt', async () => {
  const c = await boot();
  const addr = { street: 'Voorbeeldstraat 1', zip: '4205AA', city: 'Gorinchem' };
  let r = await order(c, { type: 'delivery', address: addr });
  assert.equal(r.status, 200);
  assert.equal(c.q('SELECT fee_cents, total_cents FROM orders')[0].fee_cents, 200);
  assert.equal(c.net.checkouts.co_1.amount, 16.9);

  r = await order(c, { type: 'delivery', address: addr, items: BIG, slot: { date: '2026-10-21', time: '18:15' } });
  assert.equal(r.status, 200);
  assert.equal(c.q('SELECT fee_cents FROM orders ORDER BY id DESC')[0].fee_cents, 0, 'gratis boven € 60');

  r = await order(c, { type: 'delivery', address: { street: 'Dam 1', zip: '1012JS', city: 'Amsterdam' }, slot: { date: '2026-10-21', time: '18:30' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /buiten ons bezorggebied/);
  r = await order(c, { type: 'delivery', address: { street: 'Xxx 1', zip: '0000AA', city: 'Nergens' }, slot: { date: '2026-10-21', time: '18:30' } });
  assert.equal(r.status, 400);

  const owner = await c.login('eigenaar', 'Zomerse-Koffiebonen-91');
  await owner.call('PUT', '/api/admin/settings', { delivery: { enabled: false } });
  r = await order(c, { type: 'delivery', address: addr, slot: { date: '2026-10-21', time: '19:00' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /Bezorgen is op dit moment niet mogelijk/);
  c.stop();
});

test('tijdsloten: maximum per slot, gesloten slot, slot in het verleden, tegelijk bestellen', async () => {
  const c = await boot();
  const owner = await c.login('eigenaar', 'Zomerse-Koffiebonen-91');
  await owner.call('PUT', '/api/admin/settings', { maxPerSlot: 1, closedSlots: ['2026-10-21 20:00'] });
  const results = await Promise.all([0, 1, 2].map((i) => order(c, { payment: 'cash', customer: Object.assign({}, CUST, { name: 'Klant ' + i }) })));
  assert.equal(results.filter((x) => x.status === 200).length, 1, 'precies één klant krijgt de laatste plek');
  assert.equal(results.filter((x) => x.status === 409).length, 2);
  let r = await order(c, { payment: 'cash', slot: { date: '2026-10-21', time: '20:00' } });
  assert.equal(r.status, 409); assert.match(r.json.error, /gesloten/);
  r = await order(c, { payment: 'cash', slot: { date: '2026-10-21', time: '11:00' } });
  assert.equal(r.status, 409, 'binnen de voorbereidingstijd niet beschikbaar');
  r = await order(c, { payment: 'cash', slot: { date: '2026-10-21', time: '23:00' } });
  assert.equal(r.status, 409, 'buiten openingstijden');
  const s = await c.http('/api/slots?date=2026-10-21&type=pickup');
  const e = s.json.slots.find((x) => x.time === '18:00'); assert.equal(e.available, false); assert.equal(e.reason, 'vol');
  assert.equal(s.json.slots.find((x) => x.time === '20:00').reason, 'gesloten');
  c.stop();
});

test('openingstijden en uitzonderingen: gesloten dag geeft geen tijdsloten', async () => {
  const c = await boot();
  const owner = await c.login('eigenaar', 'Zomerse-Koffiebonen-91');
  let r = await owner.call('PUT', '/api/admin/settings', { exceptions: { '2026-10-22': null } });
  assert.equal(r.status, 200);
  assert.deepEqual((await c.http('/api/slots?date=2026-10-22&type=pickup')).json.slots, []);
  assert.ok((await c.http('/api/slots?date=2026-10-23&type=pickup')).json.slots.length > 10);
  r = await owner.call('PUT', '/api/admin/settings', { hours: { 5: [11, 0, 14, 0] } });
  const t = (await c.http('/api/slots?date=2026-10-23&type=pickup')).json.slots;
  assert.equal(t[0].time, '11:00'); assert.equal(t[t.length - 1].time, '13:45');
  r = await owner.call('PUT', '/api/admin/settings', { maxPerSlot: -3 });
  assert.equal(r.status, 400);
  c.stop();
});

test('beheer: inloggen, CSRF, rollen', async () => {
  const c = await boot();
  assert.equal((await c.http('/api/admin/orders')).status, 401);
  assert.equal((await c.post('/api/admin/login', { username: 'eigenaar', password: 'fout' })).status, 401);
  const staff = await c.login('medewerker', 'Blauwe-Fietsen-Rijden-47');
  assert.equal((await staff.call('GET', '/api/admin/orders')).status, 200);
  assert.equal((await staff.call('PUT', '/api/admin/settings', { maxPerSlot: 3 })).status, 403, 'medewerker mag geen instellingen wijzigen');
  assert.equal((await staff.call('PATCH', '/api/admin/products/1', { price: 1 })).status, 403);
  const noCsrf = await c.http('/api/admin/logout', { method: 'POST', headers: { Cookie: staff.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 401, 'zonder CSRF-sleutel geweigerd');
  assert.match(staff.cookie, /^bsess=/);
  const r = await c.post('/api/admin/login', { username: 'eigenaar', password: 'Zomerse-Koffiebonen-91' });
  assert.match(r.headers.get('set-cookie'), /HttpOnly/); assert.match(r.headers.get('set-cookie'), /SameSite=Strict/); assert.match(r.headers.get('set-cookie'), /Secure/);
  c.stop();
});

test('telefonische bestelling via beheer, statussen en onderweg-mail', async () => {
  const c = await boot();
  const staff = await c.login('medewerker', 'Blauwe-Fietsen-Rijden-47');
  let r = await staff.call('POST', '/api/admin/orders', { items: ITEMS, type: 'delivery', slot: { date: '2026-10-21', time: '13:00' }, customer: CUST, address: { street: 'Telefoonweg 2', zip: '4205AA', city: 'Gorinchem' }, payment: 'later', channel: 'phone' });
  assert.equal(r.status, 200);
  const id = r.json.order.id;
  assert.equal(r.json.order.channel, 'phone');
  await c.until(() => c.printed.length === 1);
  assert.match(c.printed[0], /telefoon/);
  assert.equal((await staff.call('POST', `/api/admin/orders/${id}/stage`, { stage: 'geaccepteerd' })).json.order.stage, 'geaccepteerd');
  assert.equal((await staff.call('POST', `/api/admin/orders/${id}/stage`, { stage: 'bereiden' })).json.order.stage, 'bereiden');
  assert.equal((await staff.call('POST', `/api/admin/orders/${id}/stage`, { stage: 'onderweg' })).json.order.stage, 'onderweg');
  await c.until(() => fs.readdirSync(path.join(c.dataDir, 'mails')).some((f) => f.endsWith('-onderweg.html')));
  /* afhalen kan niet "onderweg" zijn */
  r = await staff.call('POST', '/api/admin/orders', { items: ITEMS, type: 'pickup', slot: { date: '2026-10-21', time: '13:15' }, customer: { name: 'Bel Klant', phone: '06' }, payment: 'pin', channel: 'counter' });
  assert.equal(r.status, 200);
  assert.equal((await staff.call('POST', `/api/admin/orders/${r.json.order.id}/stage`, { stage: 'onderweg' })).status, 400);
  c.stop();
});

test('bon opnieuw verwerken: mislukte opdracht wordt herhaald zonder dubbele bonnen', async () => {
  const c = await boot();
  c.printer.fail = true;
  await order(c, { payment: 'cash' });
  await c.until(() => c.q("SELECT * FROM print_jobs WHERE status = 'failed'").length === 1);
  assert.equal(c.printed.length, 0);
  assert.equal(c.q("SELECT * FROM events WHERE type = 'print_fail'").length, 1);
  /* pas na het wachtinterval wordt het opnieuw geprobeerd */
  await c.app.runPrint();
  assert.equal(c.q("SELECT attempts FROM print_jobs")[0].attempts, 1, 'nog binnen het wachtinterval');
  c.db.prepare('UPDATE print_jobs SET next_try = 0').run();
  c.printer.fail = false;
  await c.app.runPrint();
  assert.equal(c.printed.length, 1);
  assert.equal(c.q("SELECT status, attempts FROM print_jobs")[0].status, 'printed');
  await c.app.runPrint(); await c.app.runPrint();
  assert.equal(c.printed.length, 1, 'niet nog eens geprint');
  assert.equal(c.q('SELECT * FROM print_jobs').length, 1);
  /* bewuste kopie door medewerker */
  const staff = await c.login('medewerker', 'Blauwe-Fietsen-Rijden-47');
  const id = c.q('SELECT id FROM orders')[0].id;
  assert.equal((await staff.call('POST', `/api/admin/orders/${id}/reprint`, {})).status, 200);
  await c.until(() => c.printed.length === 2);
  assert.match(c.printed[1], /KOPIE/);
  c.stop();
});

test('zonder netwerkprinter: kassa/tablet haalt bonnen op, claimt ze en maar één scherm print', async () => {
  const c = await boot({ PRINTER_HOST: null });
  await order(c, { payment: 'cash' });
  const staff = await c.login('medewerker', 'Blauwe-Fietsen-Rijden-47');
  const q1 = await staff.call('GET', '/api/admin/print-queue');
  assert.equal(q1.json.jobs.length, 1);
  assert.match(q1.json.jobs[0].html, /BESTELLING BAS-/);
  const jid = q1.json.jobs[0].id;
  assert.equal((await staff.call('POST', `/api/admin/print-jobs/${jid}/claim`, {})).json.claimed, true);
  assert.equal((await staff.call('POST', `/api/admin/print-jobs/${jid}/claim`, {})).json.claimed, false, 'tweede scherm krijgt de bon niet');
  await staff.call('POST', `/api/admin/print-jobs/${jid}/done`, {});
  assert.equal((await staff.call('GET', '/api/admin/print-queue')).json.jobs.length, 0);
  c.stop();
});

test('terugbetaling: alleen eigenaar, via SumUp-API, status wordt bijgewerkt', async () => {
  const c = await boot();
  await order(c);
  c.net.setStatus('co_1', 'PAID');
  await c.webhook('co_1');
  await c.until(() => c.q('SELECT pay_status FROM orders')[0].pay_status === 'paid');
  const id = c.q('SELECT id FROM orders')[0].id;
  const staff = await c.login('medewerker', 'Blauwe-Fietsen-Rijden-47');
  assert.equal((await staff.call('POST', `/api/admin/orders/${id}/refund`, {})).status, 403);
  const owner = await c.login('eigenaar', 'Zomerse-Koffiebonen-91');
  let r = await owner.call('POST', `/api/admin/orders/${id}/refund`, { amountCents: 500 });
  assert.equal(r.json.order.pay_status, 'partially_refunded');
  assert.match(c.net.refunds[0].url, /\/v1\.0\/merchants\/MC123\/payments\/tx_co_1\/refunds$/);
  assert.equal(c.net.refunds[0].body.amount, 5);
  r = await owner.call('POST', `/api/admin/orders/${id}/refund`, { amountCents: 99999 });
  assert.equal(r.status, 400);
  r = await owner.call('POST', `/api/admin/orders/${id}/refund`, {});
  assert.equal(r.json.order.pay_status, 'refunded');
  assert.equal(r.json.order.refunded_cents, 1490);
  c.stop();
});

test('verlopen reservering: eerst controleren bij SumUp; te laat betaald blijft gewoon geldig', async () => {
  const c = await boot();
  await order(c);
  c.T.now += 40 * 60 * 1000;   /* 40 minuten later, klant heeft niet betaald */
  await O.sweepPending(c.app.ctx);
  assert.equal(c.q('SELECT pay_status FROM orders')[0].pay_status, 'expired');
  assert.equal(c.q('SELECT * FROM print_jobs').length, 0);
  /* toch betaald (melding kwam laat): bestelling wordt betaald, medewerker ziet het aan de gebeurtenis */
  c.net.setStatus('co_1', 'PAID');
  await c.webhook('co_1');
  await c.until(() => c.q('SELECT pay_status FROM orders')[0].pay_status === 'paid');
  assert.equal(c.q("SELECT * FROM events WHERE type = 'paid_after_expiry'").length, 1);
  assert.equal(c.q('SELECT * FROM print_jobs').length, 1);
  c.stop();
});

test('betaalstatus bij terugkeer van de klant wordt zelf gecontroleerd (webhook kan trager zijn)', async () => {
  const c = await boot();
  await order(c);
  const token = c.q('SELECT public_token FROM orders')[0].public_token;
  assert.equal((await c.http('/api/order-status/' + token)).json.status, 'pending');
  c.net.setStatus('co_1', 'PAID');
  assert.equal((await c.http('/api/order-status/' + token)).json.status, 'paid');
  assert.equal((await c.http('/api/order-status/' + 'a'.repeat(24))).status, 404);
  assert.equal((await c.http('/api/order-status/BAS-123456')).status, 404, 'ordernummer is niet genoeg om een bestelling te zien');
  c.stop();
});

test('menu beheren: prijs wijzigen en product uitzetten werkt direct in de webshop', async () => {
  const c = await boot();
  const owner = await c.login('eigenaar', 'Zomerse-Koffiebonen-91');
  const cat = (await owner.call('GET', '/api/admin/catalog')).json.catalog;
  const shoarma = cat.find((x) => x.id === 'wraps').i.find((p) => p.name === 'Shoarma');
  await owner.call('PATCH', `/api/admin/products/${shoarma.pid}`, { price: 9.5, menu: 15.5 });
  let r = await order(c);
  assert.equal(c.q('SELECT total_cents FROM orders')[0].total_cents, 1550);
  await owner.call('PATCH', `/api/admin/products/${shoarma.pid}`, { active: false });
  r = await order(c, { slot: { date: '2026-10-21', time: '18:15' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /niet meer beschikbaar/);
  assert.ok(!(await c.http('/api/config')).json.menu.find((x) => x.id === 'wraps').i.some((p) => p[0] === 'Shoarma'));
  r = await owner.call('POST', '/api/admin/products', { category: 'wraps', name: 'Test wrap', price: 7, menu: null });
  assert.equal(r.status, 200);
  c.stop();
});

test('privacy: persoonsgegevens worden na de bewaartermijn gewist', async () => {
  const c = await boot();
  await order(c, { payment: 'cash' });
  assert.equal(O.purgePersonalData(c.db, 90, NOW0 + 10 * 86400000), 0);
  assert.equal(O.purgePersonalData(c.db, 90, NOW0 + 100 * 86400000), 1);
  const o = c.q('SELECT name, phone, email, address, total_cents FROM orders')[0];
  assert.equal(o.name, null); assert.equal(o.email, null); assert.equal(o.total_cents, 1490);
  c.stop();
});

test('webhook met onbekend of ongeldig bericht wordt stil genegeerd', async () => {
  const c = await boot();
  assert.equal((await c.webhook('co_999')).status, 200);
  const r = await fetch(c.base + '/api/webhook/sumup', { method: 'POST', body: 'rommel' });
  assert.equal(r.status, 200);
  const r2 = await fetch(c.base + '/api/webhook/sumup', { method: 'POST', body: JSON.stringify({ event_type: 'IETS_NIEUWS', id: 'co_1' }) });
  assert.equal(r2.status, 200);
  c.stop();
});

test('bonnen bevatten alle verplichte gegevens', async () => {
  const c = await boot();
  await order(c, { payment: 'cash', note: 'Zonder ui', type: 'pickup' });
  const t = c.printed[0] || (await c.until(() => c.printed[0]));
  for (const needle of ['BASSMA LUNCHROOM', 'BESTELLING BAS-', 'AFHALEN', '21-10-2026 18:00', 'Besteld:', '1x Shoarma (MENU)', 'OPMERKING', 'Zonder ui', 'Naam: Test Klant', '0612345678', 'TOTAAL EUR']) assert.ok(t.includes(needle), 'ontbreekt op bon: ' + needle);
  c.stop();
});


test('echte netwerkverbinding met printer (ESC/POS over TCP) en bon blijft staan als de printer uit is', async () => {
  const net = require('net');
  const got = [];
  const srv = net.createServer((s) => { const chunks = []; s.on('data', (d) => chunks.push(d)); s.on('end', () => got.push(Buffer.concat(chunks))); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const tmp = net.createServer(); await new Promise((r) => tmp.listen(0, '127.0.0.1', r)); const freePort = tmp.address().port; await new Promise((r) => tmp.close(r));   /* poort waar niets luistert = printer uit */
  const c = await boot({ REAL_PRINTER: '1', PRINTER_HOST: '127.0.0.1', PRINTER_PORT: String(freePort) });
  await order(c, { payment: 'cash' });
  await c.until(() => c.q("SELECT * FROM print_jobs WHERE status = 'failed'").length === 1, 9000);
  assert.match(c.q('SELECT last_error FROM print_jobs')[0].last_error, /Printer niet bereikbaar/);
  /* printer gaat aan: zelfde bon wordt alsnog (één keer) geprint */
  c.app.ctx.env.PRINTER_PORT = String(port);
  c.db.prepare('UPDATE print_jobs SET next_try = 0').run();
  await c.app.runPrint();
  await c.until(() => got.length === 1);
  assert.equal(got[0][0], 0x1b); assert.equal(got[0][1], 0x40, 'begint met ESC @ (printer reset)');
  assert.ok(got[0].includes(Buffer.from('BESTELLING BAS-')));
  assert.deepEqual([...got[0].slice(-4)], [0x1d, 0x56, 0x42, 0x03], 'eindigt met snijden');
  assert.equal(c.q("SELECT status FROM print_jobs")[0].status, 'printed');
  c.stop(); srv.close();
});




test('verwachte tijd voor de klant: per 2,5 minuut, maximaal 30 minuten, zichtbaar voor de klant en in de onderweg-mail', async () => {
  const c = await boot();
  const r0 = await order(c, { payment: 'cash' });
  const token = r0.json.token, id = c.q('SELECT id FROM orders')[0].id;
  const staff = await c.login('medewerker', 'Blauwe-Fietsen-Rijden-47');
  const set = (m) => staff.call('POST', `/api/admin/orders/${id}/eta`, { minutes: m });
  for (const bad of [3, 1, 31, 32.5, -2.5, 'abc', 7.4]) assert.equal((await set(bad)).status, 400, 'geweigerd: ' + bad);
  for (const good of [2.5, 5, 7.5, 12.5, 30]) assert.equal((await set(good)).status, 200, 'toegestaan: ' + good);
  let r = await set(7.5);
  assert.equal(r.json.order.eta_minutes, 7.5);
  assert.equal(r.json.order.eta_at, NOW0 + 7.5 * 60000);
  /* de klant ziet de tijd op de statuspagina */
  const st = (await c.http('/api/order-status/' + token)).json;
  assert.equal(st.etaAt, NOW0 + 7.5 * 60000); assert.equal(st.etaMinutes, 7.5); assert.equal(st.now, NOW0);
  /* wissen */
  r = await set(0);
  assert.equal(r.json.order.eta_at, null);
  assert.equal((await c.http('/api/order-status/' + token)).json.etaAt, null);
  /* tijd voor een niet-betaalde bestelling kan niet */
  const pend = await order(c, { slot: { date: '2026-10-21', time: '18:15' } });
  const pid = c.q("SELECT id FROM orders WHERE pay_status = 'pending'")[0].id;
  assert.equal((await staff.call('POST', `/api/admin/orders/${pid}/eta`, { minutes: 5 })).status, 400);
  /* zonder inloggen kan het niet */
  assert.equal((await c.post(`/api/admin/orders/${id}/eta`, { minutes: 5 })).status, 401);
  /* bezorgbestelling: onderweg-mail gebruikt de doorgegeven tijd */
  const d = await order(c, { type: 'delivery', payment: 'online', address: { street: 'Voorbeeldstraat 1', zip: '4205AA', city: 'Gorinchem' }, slot: { date: '2026-10-21', time: '19:00' } });
  c.net.setStatus('co_2', 'PAID');
  await c.webhook('co_2');
  await c.until(() => c.q("SELECT pay_status FROM orders WHERE type = 'delivery'")[0].pay_status === 'paid');
  const did = c.q("SELECT id FROM orders WHERE type = 'delivery'")[0].id;
  await staff.call('POST', `/api/admin/orders/${did}/eta`, { minutes: 15 });
  await staff.call('POST', `/api/admin/orders/${did}/stage`, { stage: 'onderweg' });
  const num = c.q("SELECT number FROM orders WHERE type = 'delivery'")[0].number;
  await c.until(() => fs.existsSync(path.join(c.dataDir, 'mails', `${num}-onderweg.html`)));
  const mailHtml = fs.readFileSync(path.join(c.dataDir, 'mails', `${num}-onderweg.html`), 'utf8');
  assert.match(mailHtml, /over ca\. 15 minuten/);
  c.stop();
});

test('klantpagina: bezorgadres voor de routeknop en het moment waarop de status veranderde; afhalen toont geen adres', async () => {
  const c = await boot();
  const addr = { street: 'Voorbeeldstraat 1', zip: '4205AA', city: 'Gorinchem' };
  const d = await order(c, { type: 'delivery', address: addr });
  const p = await order(c, { payment: 'cash', slot: { date: '2026-10-21', time: '18:15' } });
  c.net.setStatus('co_1', 'PAID'); await c.webhook('co_1');
  await c.until(() => c.q("SELECT pay_status FROM orders WHERE type = 'delivery'")[0].pay_status === 'paid');
  const staff = await c.login('medewerker', 'Blauwe-Fietsen-Rijden-47');
  const did = c.q("SELECT id FROM orders WHERE type = 'delivery'")[0].id, pid = c.q("SELECT id FROM orders WHERE type = 'pickup'")[0].id;
  /* onderweg kan alleen bij bezorgen */
  assert.equal((await staff.call('POST', `/api/admin/orders/${pid}/stage`, { stage: 'onderweg' })).status, 400);
  assert.equal((await staff.call('POST', `/api/admin/orders/${pid}/stage`, { stage: 'bereiden' })).status, 200);
  assert.equal((await staff.call('POST', `/api/admin/orders/${did}/stage`, { stage: 'bereiden' })).status, 200);
  c.T.now += 60000;
  assert.equal((await staff.call('POST', `/api/admin/orders/${did}/stage`, { stage: 'onderweg' })).status, 200);
  const sd = (await c.http('/api/order-status/' + d.json.token)).json;
  assert.equal(sd.stage, 'onderweg'); assert.equal(sd.stageAt, NOW0 + 60000);
  assert.deepEqual(sd.address, addr); assert.match(sd.shopAddress, /Gorinchem/);
  const sp = (await c.http('/api/order-status/' + p.json.token)).json;
  assert.equal(sp.address, null); assert.equal(sp.stage, 'bereiden');
  c.stop();
});

