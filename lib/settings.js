'use strict';
/* Instellingen (openingstijden, tijdsloten, bezorgen) en het menu in de database, plus tijdsloten-berekening. */
const crypto = require('crypto');

const DEFAULTS = {
  shop: { name: 'Bassma Lunchroom', address: 'Koningin Wilhelminalaan 34, 4205 EX Gorinchem', phone: '0183 785 769', lat: 51.8404394, lon: 4.9680569 },
  /* 0 = zondag ... 6 = zaterdag; [uur open, minuut open, uur dicht, minuut dicht] of null = gesloten */
  hours: { 0: [12, 0, 20, 0], 1: [10, 0, 22, 0], 2: [10, 0, 22, 0], 3: [10, 0, 22, 0], 4: [10, 0, 22, 0], 5: [10, 0, 22, 0], 6: [10, 0, 22, 0] },
  exceptions: {},          /* 'YYYY-MM-DD': null (gesloten) of [uur, min, uur, min] */
  closedSlots: [],         /* 'YYYY-MM-DD HH:MM' */
  slotLimits: {},          /* 'YYYY-MM-DD HH:MM': aantal (overschrijft maxPerSlot) */
  slotMinutes: 15,
  maxPerSlot: 6,
  leadMinutes: { pickup: 15, delivery: 30 },   /* vroegste tijd vanaf nu */
  daysAhead: 6,
  eta: { prepMin: 5, prepMax: 10, minPerKm: 1 },
  delivery: {
    enabled: true,
    zones: [{ name: 'Tot 17,5 km', maxKm: 17.5, fee: 2 }],  /* eerste zone waarvan maxKm >= afstand */
    freeFrom: 60,
    city: 'Gorinchem'
  },
  minOrder: 0,
  cashPickup: true         /* contant betalen bij afhalen toestaan */
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function getSettings(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'config'").get();
  const saved = row ? JSON.parse(row.value) : {};
  const s = clone(DEFAULTS);
  for (const k of Object.keys(saved)) {
    if (saved[k] && typeof saved[k] === 'object' && !Array.isArray(saved[k]) && s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) Object.assign(s[k], saved[k]);
    else s[k] = saved[k];
  }
  return s;
}

function saveSettings(db, s) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(s));
}

/* Controleert wat het beheerpaneel opstuurt en geeft een schone kopie terug (gooit bij foute waarden) */
function validateSettings(inp, current) {
  const s = clone(current);
  const num = (v, min, max, name) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new Error('Ongeldige waarde: ' + name); return n; };
  const hhmm = (a) => { if (a === null) return null; if (!Array.isArray(a) || a.length !== 4) throw new Error('Ongeldige tijden'); const [h1, m1, h2, m2] = a.map(Number); if ([h1, h2].some((x) => !(x >= 0 && x <= 23)) || [m1, m2].some((x) => !(x >= 0 && x <= 59)) || h2 * 60 + m2 <= h1 * 60 + m1) throw new Error('Ongeldige openingstijden'); return [h1, m1, h2, m2]; };
  if (inp.hours) { for (let d = 0; d < 7; d++) if (d in inp.hours) s.hours[d] = hhmm(inp.hours[d]); }
  if (inp.exceptions) {
    s.exceptions = {};
    for (const [date, v] of Object.entries(inp.exceptions)) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ongeldige datum'); s.exceptions[date] = hhmm(v); }
  }
  if (inp.closedSlots) { if (!Array.isArray(inp.closedSlots) || inp.closedSlots.some((x) => !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(x))) throw new Error('Ongeldige tijdsloten'); s.closedSlots = [...new Set(inp.closedSlots)]; }
  if (inp.slotLimits) { s.slotLimits = {}; for (const [k, v] of Object.entries(inp.slotLimits)) { if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(k)) throw new Error('Ongeldig tijdslot'); s.slotLimits[k] = num(v, 0, 100, 'limiet'); } }
  if (inp.slotMinutes != null) s.slotMinutes = [10, 15, 20, 30, 60].includes(Number(inp.slotMinutes)) ? Number(inp.slotMinutes) : (() => { throw new Error('Ongeldige tijdslotlengte'); })();
  if (inp.maxPerSlot != null) s.maxPerSlot = num(inp.maxPerSlot, 0, 100, 'maximum per tijdslot');
  if (inp.leadMinutes) { s.leadMinutes.pickup = num(inp.leadMinutes.pickup, 0, 600, 'voorbereidingstijd afhalen'); s.leadMinutes.delivery = num(inp.leadMinutes.delivery, 0, 600, 'voorbereidingstijd bezorgen'); }
  if (inp.daysAhead != null) s.daysAhead = num(inp.daysAhead, 0, 30, 'dagen vooruit');
  if (inp.eta) { s.eta.prepMin = num(inp.eta.prepMin, 0, 120, 'prepMin'); s.eta.prepMax = num(inp.eta.prepMax, s.eta.prepMin, 180, 'prepMax'); s.eta.minPerKm = num(inp.eta.minPerKm, 0, 10, 'minuten per km'); }
  if (inp.delivery) {
    const d = inp.delivery;
    if (d.enabled != null) s.delivery.enabled = !!d.enabled;
    if (d.freeFrom != null) s.delivery.freeFrom = num(d.freeFrom, 0, 10000, 'gratis vanaf');
    if (d.zones) {
      if (!Array.isArray(d.zones) || !d.zones.length || d.zones.length > 10) throw new Error('Ongeldige bezorggebieden');
      s.delivery.zones = d.zones.map((z) => ({ name: String(z.name || '').slice(0, 40) || 'Zone', maxKm: num(z.maxKm, 0.1, 100, 'maximale afstand'), fee: num(z.fee, 0, 100, 'bezorgkosten') })).sort((a, b) => a.maxKm - b.maxKm);
    }
  }
  if (inp.minOrder != null) s.minOrder = num(inp.minOrder, 0, 1000, 'minimaal bestelbedrag');
  if (inp.cashPickup != null) s.cashPickup = !!inp.cashPickup;
  return s;
}

/* ---------- tijd in Nederland ---------- */
function amsParts(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
    .formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  const h = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(h).padStart(2, '0')}:${p.minute}`, minutes: h * 60 + Number(p.minute), dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
const dowOf = (dateStr) => new Date(dateStr + 'T12:00:00Z').getUTCDay();
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

function dayHours(s, dateStr) {
  const h = (dateStr in s.exceptions) ? s.exceptions[dateStr] : s.hours[dowOf(dateStr)];
  return h ? { open: h[0] * 60 + h[1], close: h[2] * 60 + h[3] } : null;
}

/* Aantal bestellingen dat een tijdslot nu bezet (betaald, contant/telefonisch, of nog lopende betaling met reservering) */
function slotCount(db, date, time, nowMs) {
  return db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE slot_date = ? AND slot_time = ? AND stage != 'geweigerd'
    AND (pay_status IN ('paid','cash','pin','later','partially_refunded') OR (pay_status = 'pending' AND reserved_until > ?))`).get(date, time, nowMs).n;
}

function listSlots(db, s, date, type, nowMs) {
  const H = dayHours(s, date);
  if (!H) return [];
  const now = amsParts(nowMs);
  if (date < now.date) return [];
  const lead = s.leadMinutes[type === 'delivery' ? 'delivery' : 'pickup'];
  const earliest = date === now.date ? now.minutes + lead : 0;
  const step = s.slotMinutes, out = [];
  let m = Math.ceil(Math.max(H.open, earliest) / step) * step;
  for (; m <= H.close - step; m += step) {
    const time = hm(m), key = `${date} ${time}`;
    const limit = key in s.slotLimits ? s.slotLimits[key] : s.maxPerSlot;
    const n = slotCount(db, date, time, nowMs);
    const closed = s.closedSlots.includes(key);
    out.push({ time, available: !closed && n < limit, reason: closed ? 'gesloten' : (n >= limit ? 'vol' : null), left: Math.max(0, limit - n) });
  }
  return out;
}

/* ---------- menu in de database ---------- */
function seedCatalog(db, MENU) {
  if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n) return false;
  const insC = db.prepare('INSERT INTO categories (id, name, sub, has_menu, sort) VALUES (?, ?, ?, ?, ?)');
  const insP = db.prepare('INSERT INTO products (category_id, name, price_cents, menu_price_cents, sort) VALUES (?, ?, ?, ?, ?)');
  MENU.forEach((c, ci) => {
    insC.run(c.id, c.n, c.s || null, c.m ? 1 : 0, ci);
    c.i.forEach((p, pi) => insP.run(c.id, p[0], Math.round(p[1] * 100), p[2] != null ? Math.round(p[2] * 100) : null, pi));
  });
  return true;
}

/* Zelfde vorm als de MENU-lijst in index.html: [naam, prijs, menuprijs]. Alleen actieve producten voor klanten. */
function catalog(db, onlyActive = true) {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort, rowid').all();
  const prods = db.prepare('SELECT * FROM products ORDER BY sort, id').all();
  return cats.filter((c) => !onlyActive || c.active).map((c) => ({
    id: c.id, n: c.name, s: c.sub || undefined, m: c.has_menu ? 1 : 0, active: !!c.active,
    i: prods.filter((p) => p.category_id === c.id && (!onlyActive || p.active)).map((p) => onlyActive
      ? [p.name, p.price_cents / 100, p.menu_price_cents != null ? p.menu_price_cents / 100 : undefined]
      : { pid: p.id, name: p.name, price: p.price_cents / 100, menu: p.menu_price_cents != null ? p.menu_price_cents / 100 : null, active: !!p.active })
  })).filter((c) => !onlyActive || c.i.length);
}

function findProduct(db, id) {
  const [catId, ...rest] = String(id || '').split('|');
  const name = rest.join('|');
  const p = db.prepare(`SELECT p.*, c.name AS cat_name FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.category_id = ? AND p.name = ? AND p.active = 1 AND c.active = 1`).get(catId, name);
  return p || null;
}

const newToken = (n = 16) => crypto.randomBytes(n).toString('hex');

module.exports = { DEFAULTS, getSettings, saveSettings, validateSettings, amsParts, dowOf, addDays, hm, dayHours, slotCount, listSlots, seedCatalog, catalog, findProduct, newToken };

