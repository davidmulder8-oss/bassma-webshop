'use strict';
/*
 * Bonnen. Een bon wordt alleen aangemaakt als de bestelling echt betaald is (of contant/telefonisch is aangenomen).
 * Uitvoer:
 *  1. Netwerkprinter met ESC/POS (Epson, Star, ...): de server stuurt de bon rechtstreeks naar PRINTER_HOST:PRINTER_PORT (standaard 9100).
 *  2. Het beheerpaneel op de kassa/tablet: print automatisch in 80 mm-formaat via de browser (zie beheer.html, "Bonnenmodus").
 * De eigen SumUp-printer accepteert geen opdrachten van buitenaf. Daarvoor is dus geen koppeling gebouwd.
 */
const net = require('net');

const W = 42;
const pad = (l, r) => { l = String(l); r = String(r); const sp = Math.max(1, W - l.length - r.length); return l + ' '.repeat(sp) + r; };
const money = (c) => (c / 100).toFixed(2).replace('.', ',');
const wrap = (s, w = W) => { const out = []; let line = ''; String(s).split(/\s+/).forEach((word) => { if ((line + ' ' + word).trim().length > w) { if (line) out.push(line); line = word; } else line = (line + ' ' + word).trim(); }); if (line) out.push(line); return out; };

function payLine(o) {
  if (o.pay_status === 'paid' || o.pay_status === 'partially_refunded') return 'BETAALD (online)';
  if (o.pay_status === 'cash') return `NOG TE BETALEN: EUR ${money(o.total_cents)} (contant bij afhalen)`;
  if (o.pay_status === 'later') return `NOG TE BETALEN: EUR ${money(o.total_cents)} (bij ophalen/bezorgen)`;
  if (o.pay_status === 'pin') return 'BETAALD (pin aan de kassa)';
  return 'STATUS: ' + o.pay_status;
}

/* Geeft een lijst regels: { t: tekst, big?: bool, bold?: bool, center?: bool } */
function courierLines(o) {
  const items = JSON.parse(o.items), addr = o.address ? JSON.parse(o.address) : null;
  const L = [];
  L.push({ t: '*** BEZORGBON ***', center: true, bold: true });
  L.push({ t: 'BASSMA LUNCHROOM', center: true, bold: true });
  L.push({ t: `BESTELLING ${o.number}`, big: true, center: true });
  L.push({ t: `BEZORGEN OM ${o.slot_time}`, big: true, center: true });
  L.push({ t: `Datum: ${o.slot_date.split('-').reverse().join('-')}`, bold: true, center: true });
  L.push({ t: '-'.repeat(W) });
  L.push({ t: 'ADRES:', bold: true });
  if (addr) { wrap(addr.street, 20).forEach((t) => L.push({ t, big: true })); L.push({ t: `${addr.zip} ${addr.city}`, big: true }); if (o.km) L.push({ t: `(${o.km} km)` }); }
  else L.push({ t: '(geen adres bekend)', bold: true });
  L.push({ t: '-'.repeat(W) });
  L.push({ t: `Naam: ${o.name || '-'}`, bold: true });
  L.push({ t: `Tel:  ${o.phone || '-'}`, bold: true });
  if (o.note) { L.push({ t: '-'.repeat(W) }); L.push({ t: 'OPMERKING:', bold: true }); wrap(o.note).forEach((t) => L.push({ t })); }
  L.push({ t: '-'.repeat(W) });
  items.forEach((i) => L.push({ t: `${i.qty}x ${i.name}${i.menu ? ' (MENU)' : ''}` }));
  L.push({ t: '-'.repeat(W) });
  const paid = o.pay_status === 'paid' || o.pay_status === 'partially_refunded' || o.pay_status === 'pin';
  if (paid) L.push({ t: 'AL BETAALD - NIETS INNEN', big: true, center: true });
  else { L.push({ t: 'TE BETALEN BIJ KLANT:', big: true, center: true }); L.push({ t: `EUR ${money(o.total_cents)}`, big: true, center: true }); }
  return L;
}

function ticketLines(o, kind) {
  if (kind === 'courier') return courierLines(o);
  const items = JSON.parse(o.items), addr = o.address ? JSON.parse(o.address) : null;
  const L = [];
  if (kind === 'copy') L.push({ t: '*** KOPIE ***', center: true, bold: true });
  L.push({ t: '*** KASSABON ***', center: true, bold: true });
  L.push({ t: 'BASSMA LUNCHROOM', center: true, bold: true });
  L.push({ t: `BESTELLING ${o.number}`, big: true, center: true });
  L.push({ t: o.type === 'delivery' ? 'BEZORGEN' : 'AFHALEN', big: true, center: true });
  L.push({ t: `Gewenst: ${o.slot_date.split('-').reverse().join('-')} ${o.slot_time}`, bold: true, center: true });
  L.push({ t: `Besteld: ${o.created_at.replace('T', ' ').slice(0, 16)} (${o.channel === 'web' ? 'website' : o.channel === 'phone' ? 'telefoon' : 'kassa'})`, center: true });
  L.push({ t: '-'.repeat(W) });
  items.forEach((i) => {
    L.push({ t: pad(`${i.qty}x ${i.name}${i.menu ? ' (MENU)' : ''}`, money(i.unitCents * i.qty)), bold: true });
  });
  L.push({ t: '-'.repeat(W) });
  if (o.fee_cents || o.type === 'delivery') L.push({ t: pad('Bezorgkosten', o.fee_cents ? money(o.fee_cents) : 'gratis') });
  L.push({ t: pad('TOTAAL EUR', money(o.total_cents)), bold: true });
  L.push({ t: payLine(o), bold: true });
  if (o.note) { L.push({ t: '-'.repeat(W) }); L.push({ t: 'OPMERKING:', bold: true }); wrap(o.note).forEach((t) => L.push({ t })); }
  L.push({ t: '-'.repeat(W) });
  L.push({ t: `Naam: ${o.name || '-'}`, bold: true });
  L.push({ t: `Tel:  ${o.phone || '-'}` });
  if (addr) { L.push({ t: `${addr.street}` }); L.push({ t: `${addr.zip} ${addr.city}` }); if (o.km) L.push({ t: `(${o.km} km)` }); }
  return L;
}

function ticketText(o, kind) { return ticketLines(o, kind).map((l) => (l.center ? ' '.repeat(Math.max(0, Math.floor((W - l.t.length) / 2))) + l.t : l.t)).join('\n') + '\n'; }

function ticketHtml(o, kind) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return ticketLines(o, kind).map((l) => `<div style="white-space:pre-wrap;${l.center ? 'text-align:center;' : ''}${l.bold ? 'font-weight:700;' : ''}${l.big ? 'font-size:1.5em;font-weight:700;' : ''}">${esc(l.t) || '&nbsp;'}</div>`).join('');
}

/* Tekens die in codepagina CP858 een andere code hebben dan in Latin-1 */
const CP858 = { 'é': 0x82, 'è': 0x8a, 'ë': 0x89, 'ê': 0x88, 'à': 0x85, 'á': 0xa0, 'â': 0x83, 'ä': 0x84, 'ï': 0x8b, 'î': 0x8c, 'í': 0xa1, 'ì': 0x8d, 'ö': 0x94, 'ô': 0x93, 'ó': 0xa2, 'ò': 0x95, 'ü': 0x81, 'û': 0x96, 'ú': 0xa3, 'ù': 0x97, 'ç': 0x87, 'ñ': 0xa4, 'ß': 0xe1, 'É': 0x90, 'Ç': 0x80, '€': 0xd5, '’': 0x27, '·': 0xfa };
function enc(s) { return Buffer.from(Array.from(String(s)).map((ch) => (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : (CP858[ch] || 0x3f)))); }

function escpos(o, kind) {
  const ESC = 0x1b, GS = 0x1d, parts = [Buffer.from([ESC, 0x40, ESC, 0x74, 19])];   /* reset + codepagina CP858 */
  ticketLines(o, kind).forEach((l) => {
    parts.push(Buffer.from([ESC, 0x61, l.center ? 1 : 0]));
    parts.push(Buffer.from([ESC, 0x45, l.bold || l.big ? 1 : 0]));
    parts.push(Buffer.from([GS, 0x21, l.big ? 0x11 : 0x00]));
    parts.push(enc(l.t), Buffer.from([0x0a]));
  });
  parts.push(Buffer.from([GS, 0x21, 0x00, ESC, 0x45, 0x00, ESC, 0x61, 0x00, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x03]));   /* feed + snijden */
  return Buffer.concat(parts);
}

function sendRaw(host, port, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port });
    let done = false;
    const fin = (err) => { if (done) return; done = true; s.destroy(); err ? reject(err) : resolve(); };
    s.setTimeout(timeoutMs, () => fin(new Error('Printer reageert niet (timeout)')));
    s.on('error', (e) => fin(new Error('Printer niet bereikbaar: ' + e.message)));
    s.on('connect', () => s.write(data, (err) => { if (err) fin(err); else s.end(() => fin()); }));
  });
}

/* ---------- wachtrij ---------- */
const BACKOFF = [10, 30, 60, 120, 300, 600, 900];   /* seconden */

function enqueue(db, orderId, kind = 'order') {
  const ins = db.prepare("INSERT OR IGNORE INTO print_jobs (order_id, kind, status, created_at, next_try) VALUES (?, ?, 'pending', ?, 0)");
  const r = ins.run(orderId, kind, new Date().toISOString());
  /* bezorging: er komt naast de kassabon ook een bon voor de bezorger (één keer per bestelling) */
  if (kind === 'order') {
    const o = db.prepare('SELECT type FROM orders WHERE id = ?').get(orderId);
    if (o && o.type === 'delivery') ins.run(orderId, 'courier', new Date().toISOString());
  }
  return r.changes === 1;
}

/* Verwerkt openstaande bonnen via de netwerkprinter (als die is ingesteld). Elke bon wordt maar één keer als 'printed' gemarkeerd. */
async function runQueue(db, env, log, sender = sendRaw) {
  if (!env.PRINTER_HOST) return 0;
  const jobs = db.prepare("SELECT * FROM print_jobs WHERE status IN ('pending','failed') AND attempts < ? AND (next_try IS NULL OR next_try <= ?) ORDER BY id LIMIT 10").all(BACKOFF.length + 1, Date.now());
  let ok = 0;
  for (const job of jobs) {
    /* claim: voorkomt dat twee rondes dezelfde bon tegelijk versturen */
    const claim = db.prepare("UPDATE print_jobs SET status = 'printing', attempts = attempts + 1 WHERE id = ? AND status IN ('pending','failed')").run(job.id);
    if (claim.changes !== 1) continue;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(job.order_id);
    try {
      await sender(env.PRINTER_HOST, Number(env.PRINTER_PORT || 9100), escpos(order, job.kind));
      db.prepare("UPDATE print_jobs SET status = 'printed', printed_at = ?, last_error = NULL WHERE id = ?").run(new Date().toISOString(), job.id);
      log(order.id, 'print_ok', { job: job.id });
      ok++;
    } catch (e) {
      const n = job.attempts + 1;
      db.prepare("UPDATE print_jobs SET status = 'failed', last_error = ?, next_try = ? WHERE id = ?").run(String(e.message).slice(0, 200), Date.now() + (BACKOFF[Math.min(n - 1, BACKOFF.length - 1)]) * 1000, job.id);
      log(order.id, 'print_fail', { job: job.id, attempt: n, error: e.message });
    }
  }
  return ok;
}

module.exports = { ticketText, ticketHtml, ticketLines, escpos, enqueue, runQueue, sendRaw, BACKOFF };
