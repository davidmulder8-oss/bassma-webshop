'use strict';
/* Bedrijfslogica: bestelling opbouwen (prijzen altijd op de server), tijdsslot reserveren, betaling verwerken, terugbetalen. */
const S = require('./settings');
const { tx, logEvent } = require('./db');
const print = require('./print');
const mail = require('../mail');

const HOLD_MS = 17 * 60 * 1000;   /* een tijdslot blijft zolang gereserveerd tijdens het betalen (de checkout bij SumUp verloopt na 15 minuten) */
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
const err = (msg, code = 400) => Object.assign(new Error(msg), { status: code });

/* ---------- adres en bezorgkosten ---------- */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocode(fetchFn, a) {
  const q = encodeURIComponent(`${a.street} ${a.zip} ${a.city}`);
  const r = await fetchFn(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fq=type:adres&fl=woonplaatsnaam,centroide_ll,weergavenaam&q=${q}`);
  if (!r.ok) throw err('Adres opzoeken mislukt, probeer het later opnieuw', 503);
  const j = await r.json();
  const d = j.response && j.response.docs && j.response.docs[0];
  const m = d && /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(d.centroide_ll || '');
  return m ? { lat: Number(m[2]), lon: Number(m[1]), town: d.woonplaatsnaam } : null;
}

function deliveryFee(settings, km, subtotalCents) {
  const zone = settings.delivery.zones.find((z) => km <= z.maxKm);
  if (!zone) return null;
  return subtotalCents >= Math.round(settings.delivery.freeFrom * 100) ? 0 : Math.round(zone.fee * 100);
}

/* ---------- aanmaken ---------- */
function newNumber(db) {
  const crypto = require('crypto');
  for (let i = 0; i < 30; i++) {
    const n = 'BAS-' + (100000 + crypto.randomInt(900000));
    if (!db.prepare('SELECT 1 FROM orders WHERE number = ?').get(n)) return n;
  }
  throw new Error('Geen vrij ordernummer');
}

function toLines(db, items) {
  if (!Array.isArray(items) || !items.length || items.length > 60) throw err('Je bestelling is leeg');
  const lines = []; let sub = 0;
  for (const it of items) {
    const p = S.findProduct(db, it.id);
    const qty = Math.floor(Number(it.qty));
    if (!p) throw err('Een product in je bestelling is niet meer beschikbaar: ' + clean(String(it.id).split('|')[1] || it.id, 60));
    if (!(qty >= 1 && qty <= 50)) throw err('Ongeldig aantal');
    const useMenu = !!it.menu && p.menu_price_cents != null;
    const unit = useMenu ? p.menu_price_cents : p.price_cents;
    sub += unit * qty;
    lines.push({ id: it.id, name: p.name, category: p.cat_name, menu: useMenu, qty, unitCents: unit });
  }
  return { lines, sub };
}

const row = (db, id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

/*
 * input: { items, type, slot:{date,time}, customer:{name,phone,email}, address, note, payment ('online'|'cash'|'pin'|'later'), method, idem, channel }
 * ctx:   { db, deps:{fetch,now}, providers, env, urls:{redirect(order), webhook}, onPaid(order) }
 */
async function createOrder(ctx, input, opts = {}) {
  const { db } = ctx, now = ctx.deps.now(), channel = opts.channel || 'web', staff = channel !== 'web';
  const settings = S.getSettings(db);

  /* dubbele verzending (vernieuwen, dubbelklik): zelfde sleutel geeft dezelfde bestelling terug */
  if (input.idem) {
    const ex = db.prepare('SELECT * FROM orders WHERE idem = ?').get(String(input.idem).slice(0, 80));
    if (ex) return { order: ex, duplicate: true };
  }

  const type = input.type === 'delivery' ? 'delivery' : 'pickup';
  if (type === 'delivery' && !settings.delivery.enabled) throw err('Bezorgen is op dit moment niet mogelijk. Kies afhalen.');
  const { lines, sub } = toLines(db, input.items);
  if (settings.minOrder && sub < Math.round(settings.minOrder * 100)) throw err('Het minimale bestelbedrag is € ' + settings.minOrder.toFixed(2).replace('.', ','));

  const c = input.customer || {};
  const customer = { name: clean(c.name, 80), phone: clean(c.phone, 30), email: clean(c.email, 120) };
  if (!customer.name || !customer.phone) throw err('Vul naam en telefoonnummer in');
  if (channel === 'web' && !/^\S+@\S+\.\S+$/.test(customer.email)) throw err('Vul een geldig e-mailadres in');
  if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) customer.email = '';

  let address = null, km = 0, fee = 0;
  if (type === 'delivery') {
    const a = input.address || {};
    address = { street: clean(a.street, 100), zip: clean(a.zip, 12), city: clean(a.city, 60) };
    if (!address.street || !address.zip || !address.city) throw err('Vul je volledige bezorgadres in');
    const g = await geocode(ctx.deps.fetch, address);
    if (!g) throw err('Adres niet gevonden. Controleer straat, postcode en plaats.');
    km = haversineKm(settings.shop.lat, settings.shop.lon, g.lat, g.lon);
    const f = deliveryFee(settings, km, sub);
    if (f === null) throw err('Dit adres ligt buiten ons bezorggebied');
    fee = f; km = Math.round(km * 10) / 10;
  }

  let payMethod = input.payment || 'online';
  if (!['online', 'cash', 'pin', 'later'].includes(payMethod)) payMethod = 'online';
  if (!staff && !['online', 'cash'].includes(payMethod)) payMethod = 'online';
  if (payMethod === 'cash' && !staff && (type === 'delivery' || !settings.cashPickup)) throw err('Contant betalen is niet mogelijk voor deze bestelling');

  const slot = input.slot || {};
  if (!staff && /^\d{4}-\d{2}-\d{2}$/.test(slot.date || '') && slot.date > S.addDays(S.amsParts(now).date, settings.daysAhead)) throw err('Je kunt niet zo ver vooruit bestellen', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date || '') || !/^\d{2}:\d{2}$/.test(slot.time || '')) throw err('Kies een datum en tijd');

  const online = payMethod === 'online';
  /* voorkomt dat één persoon alle tijdsloten blokkeert met onbetaalde bestellingen */
  if (!staff && online) {
    const open = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE pay_status = 'pending' AND reserved_until > ? AND channel = 'web' AND (phone = ? OR (email != '' AND email = ?))").get(now, customer.phone, customer.email).n;
    if (open >= 2) throw err('Je hebt al een bestelling die op betaling wacht. Rond die eerst af, of probeer het over een paar minuten opnieuw.', 429);
  }
  if (online && !ctx.providers.active.configured) throw err('Online betalen is op dit moment niet beschikbaar', 503);

  const number = newNumber(db);
  const public_token = S.newToken(12);
  const status = online ? 'pending' : payMethod;   /* cash | pin | later */
  const nowIso = new Date(now).toISOString();
  const total = sub + fee;

  /* slot controleren en bestelling opslaan in één stap: twee klanten kunnen niet dezelfde laatste plek krijgen */
  const order = tx(db, () => {
    if (input.idem && db.prepare('SELECT 1 FROM orders WHERE idem = ?').get(String(input.idem).slice(0, 80))) return null;
    if (!(staff && opts.override)) {
      const slots = S.listSlots(db, settings, slot.date, type, now);
      const s = slots.find((x) => x.time === slot.time);
      if (!s) throw err('Dit tijdstip is niet beschikbaar. Kies een ander tijdstip.', 409);
      if (!s.available) throw err(s.reason === 'vol' ? 'Dit tijdstip is helaas net vol. Kies een ander tijdstip.' : 'Dit tijdstip is gesloten. Kies een ander tijdstip.', 409);
    }
    const r = db.prepare(`INSERT INTO orders (number, public_token, idem, created_at, channel, type, slot_date, slot_time, name, phone, email, address, km, note, items,
        subtotal_cents, fee_cents, total_cents, pay_method, provider, checkout_ref, pay_status, reserved_until)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      number, public_token, input.idem ? String(input.idem).slice(0, 80) : null, nowIso, channel, type, slot.date, slot.time,
      customer.name, customer.phone, customer.email, address ? JSON.stringify(address) : null, km, clean(input.note, 500), JSON.stringify(lines),
      sub, fee, total, payMethod, online ? ctx.providers.active.name : null, online ? number : null, status, online ? now + HOLD_MS : null);
    const o = row(db, r.lastInsertRowid);
    logEvent(db, o.id, 'created', { channel, type, total, status });
    /* contant/telefonisch: direct een bon; online: pas na bevestigde betaling */
    if (!online) { print.enqueue(db, o.id, 'order'); logEvent(db, o.id, 'print_queued', { reason: payMethod }); }
    return o;
  });
  if (!order) return { order: db.prepare('SELECT * FROM orders WHERE idem = ?').get(String(input.idem).slice(0, 80)), duplicate: true };

  if (!online) { ctx.onNew && ctx.onNew(order); return { order }; }

  /* online betalen: checkout bij de provider aanmaken */
  try {
    const urls = ctx.urls(order);
    const res = await ctx.providers.active.create(order, urls, input.method);
    db.prepare('UPDATE orders SET checkout_id = ?, checkout_url = ? WHERE id = ?').run(res.id, res.url, order.id);
    logEvent(db, order.id, 'checkout_created', { provider: order.provider, checkout: res.id });
    return { order: row(db, order.id), checkoutUrl: res.url };
  } catch (e) {
    db.prepare("UPDATE orders SET pay_status = 'failed', reserved_until = NULL WHERE id = ? AND pay_status = 'pending'").run(order.id);
    logEvent(db, order.id, 'checkout_error', { error: e.message });
    throw err('Betaling starten mislukt. Probeer het opnieuw.', 502);
  }
}

/* ---------- betaling verwerken (idempotent: dubbele meldingen doen niets) ---------- */
async function syncPayment(ctx, order) {
  if (!order.checkout_id) return order;
  const provider = ctx.providers.byName(order.provider);
  const res = await provider.get(order.checkout_id);   /* altijd bij de provider verifiëren */
  return applyStatus(ctx, order.id, res);
}

function applyStatus(ctx, orderId, res) {
  const { db } = ctx;
  const order = row(db, orderId);
  if (!order) return null;
  if (res.status === 'paid') {
    const settings = S.getSettings(db);
    const merchantOk = !ctx.env.SUMUP_MERCHANT_CODE || order.provider !== 'sumup' || res.merchant === ctx.env.SUMUP_MERCHANT_CODE;
    if (res.amountCents !== order.total_cents || res.currency !== 'EUR' || !merchantOk || (res.reference && res.reference !== order.checkout_ref)) {
      logEvent(db, order.id, 'payment_mismatch', { expected: order.total_cents, got: res.amountCents, currency: res.currency, reference: res.reference });
      return order;   /* nooit als betaald markeren als bedrag, valuta of referentie niet klopt */
    }
    const changed = tx(db, () => {
      const r = db.prepare("UPDATE orders SET pay_status = 'paid', paid_at = ?, transaction_id = COALESCE(?, transaction_id), reserved_until = NULL WHERE id = ? AND pay_status IN ('pending','failed','expired','canceled')")
        .run(new Date(ctx.deps.now()).toISOString(), res.transactionId || null, order.id);
      if (r.changes !== 1) return false;
      const late = order.pay_status !== 'pending';
      logEvent(db, order.id, late ? 'paid_after_expiry' : 'paid', { transaction: res.transactionId });
      print.enqueue(db, order.id, 'order');
      logEvent(db, order.id, 'print_queued', { reason: 'paid' });
      return true;
    });
    const fresh = row(db, order.id);
    if (changed) ctx.onPaid && ctx.onPaid(fresh);
    return fresh;
  }
  if (['failed', 'canceled', 'expired'].includes(res.status)) {
    const r = db.prepare("UPDATE orders SET pay_status = ?, reserved_until = NULL WHERE id = ? AND pay_status = 'pending'").run(res.status, order.id);
    if (r.changes === 1) logEvent(db, order.id, 'payment_' + res.status, null);
  }
  return row(db, order.id);
}

/* Lopende betalingen waarvan de reservering is verlopen: eerst controleren bij de provider (klant kan net betaald hebben), anders vrijgeven */
async function sweepPending(ctx) {
  const { db } = ctx, now = ctx.deps.now();
  const list = db.prepare("SELECT * FROM orders WHERE pay_status = 'pending' AND reserved_until IS NOT NULL AND reserved_until < ?").all(now);
  for (const o of list) {
    try {
      if (o.checkout_id) {
        const after = await syncPayment(ctx, o);
        if (after.pay_status !== 'pending') continue;
      }
    } catch (e) { logEvent(db, o.id, 'sweep_error', { error: e.message }); continue; }
    db.prepare("UPDATE orders SET pay_status = 'expired', reserved_until = NULL WHERE id = ? AND pay_status = 'pending'").run(o.id);
    logEvent(db, o.id, 'payment_expired', null);
  }
  return list.length;
}

/* ---------- status door medewerkers ---------- */
const STAGES = ['nieuw', 'geaccepteerd', 'bereiden', 'klaar', 'onderweg', 'afgerond', 'geweigerd'];

function setStage(ctx, orderId, stage, who) {
  const { db } = ctx;
  if (!STAGES.includes(stage)) throw err('Ongeldige status');
  const o = row(db, orderId);
  if (!o) throw err('Bestelling niet gevonden', 404);
  if (!['paid', 'cash', 'pin', 'later', 'partially_refunded'].includes(o.pay_status) && stage !== 'geweigerd') throw err('Deze bestelling is nog niet betaald');
  if (stage === 'onderweg' && o.type !== 'delivery') throw err('"Onderweg" kan alleen bij bezorgen');
  db.prepare('UPDATE orders SET stage = ?, stage_at = ?, accepted_at = COALESCE(accepted_at, ?) WHERE id = ?').run(stage, ctx.deps.now(), stage === 'geaccepteerd' ? new Date(ctx.deps.now()).toISOString() : null, o.id);
  logEvent(db, o.id, 'stage', { stage, by: who });
  const fresh = row(db, o.id);
  if ((stage === 'onderweg' && o.type === 'delivery') || (stage === 'klaar' && o.type === 'pickup')) ctx.onStageMail && ctx.onStageMail(fresh, stage === 'onderweg' ? 'onderweg' : 'klaar');
  return fresh;
}

/* De beheerder geeft door wanneer het eten komt: per 2,5 minuut, maximaal 30 minuten vanaf nu. 0 = tijd weghalen. */
function setEta(ctx, orderId, minutes, who) {
  const { db } = ctx;
  const o = row(db, orderId);
  if (!o) throw err('Bestelling niet gevonden', 404);
  if (!['paid', 'cash', 'pin', 'later', 'partially_refunded'].includes(o.pay_status)) throw err('Deze bestelling is nog niet betaald');
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 0 || m > 30 || Math.abs(m / 2.5 - Math.round(m / 2.5)) > 1e-9) throw err('Kies een tijd tussen 2,5 en 30 minuten, in stappen van 2,5 minuut');
  const at = m === 0 ? null : ctx.deps.now() + m * 60000;
  db.prepare('UPDATE orders SET eta_at = ?, eta_minutes = ? WHERE id = ?').run(at, m === 0 ? null : m, o.id);
  logEvent(db, o.id, 'eta', { minutes: m, by: who });
  return row(db, o.id);
}

async function refund(ctx, orderId, cents, who) {
  const { db } = ctx, now = ctx.deps.now();
  if (!row(db, orderId)) throw err('Bestelling niet gevonden', 404);
  /* slot: maar één terugbetaling tegelijk per bestelling (dubbelklikken of twee medewerkers). Een vergrendeling ouder dan 5 minuten (crash) vervalt. */
  const claim = db.prepare('UPDATE orders SET refund_busy = ? WHERE id = ? AND (refund_busy = 0 OR refund_busy < ?)').run(now, orderId, now - 5 * 60000);
  if (claim.changes !== 1) throw err('Er loopt al een terugbetaling voor deze bestelling. Wacht even en vernieuw de pagina.', 409);
  try {
    const o = row(db, orderId);   /* opnieuw lezen nu we het slot hebben */
    if (!['paid', 'partially_refunded'].includes(o.pay_status) || o.pay_method !== 'online') throw err('Alleen online betaalde bestellingen kunnen worden terugbetaald');
    const left = o.total_cents - o.refunded_cents;
    const amount = cents ? Math.round(cents) : left;
    if (!(amount > 0 && amount <= left)) throw err('Ongeldig bedrag voor terugbetaling');
    logEvent(db, o.id, 'refund_started', { amount, by: who });
    await ctx.providers.byName(o.provider).refund(o, amount === o.total_cents ? 0 : amount);
    const total = o.refunded_cents + amount;
    db.prepare('UPDATE orders SET refunded_cents = ?, pay_status = ? WHERE id = ?').run(total, total >= o.total_cents ? 'refunded' : 'partially_refunded', o.id);
    logEvent(db, o.id, 'refund', { amount, by: who });
    return row(db, o.id);
  } finally {
    db.prepare('UPDATE orders SET refund_busy = 0 WHERE id = ?').run(orderId);
  }
}
/* ---------- weergave ---------- */
function mailShape(o) {
  const addr = o.address ? JSON.parse(o.address) : null;
  return { id: o.number, type: o.type, km: o.km, feeCents: o.fee_cents, totalCents: o.total_cents, method: o.pay_method === 'online' ? 'online' : 'cash', note: o.note,
    etaAt: o.eta_at || null, time: `${o.slot_date.split('-').reverse().join('-')} ${o.slot_time}`, customer: { name: o.name || '', phone: o.phone || '', email: o.email || '' }, address: addr,
    lines: JSON.parse(o.items).map((l) => ({ name: l.name, menu: l.menu, qty: l.qty, unitCents: l.unitCents })) };
}

function publicView(o, settings, nowMs) {
  const E = settings.eta;
  const drive = o.type === 'delivery' ? Math.ceil(o.km || 0) * E.minPerKm : 0;
  return { number: o.number, status: o.pay_status, stage: o.stage, type: o.type, slot: `${o.slot_date} ${o.slot_time}`, total: (o.total_cents / 100).toFixed(2), email: o.email, etaMin: E.prepMin + drive, etaMax: E.prepMax + drive,
    etaAt: o.eta_at || null, etaMinutes: o.eta_minutes || null, stageAt: o.stage_at || null, now: nowMs || Date.now(),
    /* het bezorgadres is van de klant zelf (alleen zichtbaar met de geheime link) en wordt gebruikt voor de routeknop */
    address: o.type === 'delivery' && o.address ? JSON.parse(o.address) : null, shopAddress: settings.shop.address };
}

function purgePersonalData(db, days, nowMs) {
  const cutoff = new Date(nowMs - days * 86400000).toISOString();
  const r = db.prepare(`UPDATE orders SET name = NULL, phone = NULL, email = NULL, address = NULL, note = NULL, anonymized = 1
    WHERE anonymized = 0 AND created_at < ? AND pay_status NOT IN ('pending')`).run(cutoff);
  return r.changes;
}

module.exports = { createOrder, syncPayment, applyStatus, sweepPending, setStage, setEta, refund, mailShape, publicView, purgePersonalData, deliveryFee, haversineKm, geocode, row, STAGES, HOLD_MS, err };



