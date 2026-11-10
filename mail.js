'use strict';
/* E-mails voor klanten: bevestiging, "onderweg" en "klaar om af te halen". */
const fs = require('fs');
const path = require('path');

const fmt = (c) => '€ ' + (c / 100).toFixed(2).replace('.', ',');
const clock = (d) => new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(d);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Verwachte tijd: gerecht 5-10 minuten (CFG.ETA) plus 1 minuut per kilometer bij bezorgen */
function eta(order, cfg, now) {
  const E = cfg.ETA || { prepMin: 5, prepMax: 10, minPerKm: 1 };
  const drive = order.type === 'delivery' ? Math.ceil(order.km || 0) * E.minPerKm : 0;
  return { min: E.prepMin + drive, max: E.prepMax + drive, drive, from: new Date(now.getTime() + (E.prepMin + drive) * 60000), to: new Date(now.getTime() + (E.prepMax + drive) * 60000) };
}

function render(order, kind, cfg, now = new Date()) {
  const shop = cfg.SHOP || {};
  const E = eta(order, cfg, now);
  const delivery = order.type === 'delivery';
  const planned = order.time && order.time !== 'asap';
  let subject, head, lead, boxTitle, boxText;

  if (kind === 'onderweg') {
    /* heeft de beheerder een verwachte tijd doorgegeven, dan gebruiken we die; anders 1 minuut per kilometer */
    const arrive = order.etaAt && order.etaAt > now.getTime() ? new Date(order.etaAt) : new Date(now.getTime() + E.drive * 60000);
    const mins = Math.max(1, Math.round((arrive.getTime() - now.getTime()) / 60000));
    subject = `Je eten is onderweg! (${order.id})`;
    head = 'Je eten is onderweg';
    lead = `Hoi ${order.customer.name.split(' ')[0]}, onze bezorger is net vertrokken met je bestelling.`;
    boxTitle = 'Verwachte aankomst';
    boxText = `rond ${clock(arrive)} <span style="font-weight:400;font-size:15px;color:#7a6a64">(over ca. ${mins} minuten)</span>`;
  } else if (kind === 'klaar') {
    subject = `Je bestelling staat klaar (${order.id})`;
    head = 'Je bestelling staat klaar';
    lead = `Hoi ${order.customer.name.split(' ')[0]}, je kunt je bestelling nu ophalen.`;
    boxTitle = 'Ophalen bij';
    boxText = esc(shop.address || '');
  } else {
    subject = `Bedankt voor je bestelling (${order.id})`;
    head = 'We hebben je bestelling ontvangen';
    lead = `Hoi ${order.customer.name.split(' ')[0]}, bedankt voor je bestelling. We gaan ermee aan de slag.`;
    if (planned) { boxTitle = delivery ? 'Gewenst bezorgtijdstip' : 'Gewenst afhaaltijdstip'; boxText = esc(order.time); }
    else if (delivery) { boxTitle = 'Verwachte bezorging'; boxText = `tussen ${clock(E.from)} en ${clock(E.to)} <span style="font-weight:400;font-size:15px;color:#7a6a64">(over ca. ${E.min}–${E.max} minuten)</span>`; }
    else { boxTitle = 'Klaar om af te halen'; boxText = `tussen ${clock(E.from)} en ${clock(E.to)} <span style="font-weight:400;font-size:15px;color:#7a6a64">(over ca. ${E.min}–${E.max} minuten)</span>`; }
  }

  const lines = order.lines.map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #ece0cd">${l.qty}× ${esc(l.name)}${l.menu ? ' (menu)' : ''}</td><td style="padding:6px 0;border-bottom:1px solid #ece0cd;text-align:right;white-space:nowrap">${fmt(l.unitCents * l.qty)}</td></tr>`).join('');
  const sub = order.lines.reduce((a, l) => a + l.unitCents * l.qty, 0);
  const feeRow = delivery ? `<tr><td style="padding:6px 0">Bezorgkosten</td><td style="padding:6px 0;text-align:right">${order.feeCents ? fmt(order.feeCents) : 'Gratis'}</td></tr>` : '';
  const where = delivery
    ? `<p style="margin:0 0 4px;font-weight:600">Bezorgadres</p><p style="margin:0;color:#7a6a64">${esc(order.address.street)}<br>${esc(order.address.zip)} ${esc(order.address.city)}</p>`
    : `<p style="margin:0 0 4px;font-weight:600">Afhalen bij</p><p style="margin:0;color:#7a6a64">${esc(shop.name || 'Bassma Lunchroom')}<br>${esc(shop.address || '')}</p>`;
  const pay = order.method === 'cash' ? 'Contant bij afhalen' : 'Online betaald';

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f5eee3;font-family:Arial,Helvetica,sans-serif;color:#2d2523">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5eee3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffaf3;border:1px solid #e2d3bf;border-radius:16px;overflow:hidden">
<tr><td style="background:#8d2f2b;padding:20px 28px;color:#fff"><div style="font-size:22px;font-weight:700;letter-spacing:.08em">BASSMA</div><div style="font-size:11px;letter-spacing:.34em;margin-top:2px">LUNCHROOM</div></td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 8px;font-size:26px;line-height:1.2;color:#8d2f2b">${esc(head)}</h1><p style="margin:0;color:#7a6a64;font-size:16px;line-height:1.5">${lead}</p></td></tr>
<tr><td style="padding:16px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6e6e1;border-radius:12px"><tr><td style="padding:16px 20px"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8d2f2b;font-weight:700">${boxTitle}</div><div style="font-size:24px;font-weight:700;margin-top:4px;color:#2d2523">${boxText}</div></td></tr></table></td></tr>
<tr><td style="padding:8px 28px"><p style="margin:0 0 8px;font-weight:600">Bestelling ${esc(order.id)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${lines}
<tr><td style="padding:6px 0">Subtotaal</td><td style="padding:6px 0;text-align:right">${fmt(sub)}</td></tr>${feeRow}
<tr><td style="padding:8px 0;font-weight:700;font-size:17px;border-top:2px solid #2d2523">Totaal</td><td style="padding:8px 0;font-weight:700;font-size:17px;text-align:right;border-top:2px solid #2d2523">${fmt(order.totalCents)}</td></tr>
<tr><td colspan="2" style="padding:0 0 4px;color:#7a6a64;font-size:13px">${pay}</td></tr></table></td></tr>
<tr><td style="padding:16px 28px 8px">${where}${order.note ? `<p style="margin:12px 0 0;color:#7a6a64"><b>Opmerking:</b> ${esc(order.note)}</p>` : ''}</td></tr>
<tr><td style="padding:20px 28px 28px;color:#7a6a64;font-size:13px;line-height:1.5;border-top:1px solid #ece0cd">Vragen over je bestelling? Bel ons op ${esc(shop.phone || '')}.<br>${esc(shop.name || 'Bassma Lunchroom')} · ${esc(shop.address || '')}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [head, '', lead, '', `${boxTitle}: ${boxText.replace(/<[^>]+>/g, '')}`, '', `Bestelling ${order.id}`,
    ...order.lines.map((l) => `${l.qty}x ${l.name}${l.menu ? ' (menu)' : ''}  ${fmt(l.unitCents * l.qty)}`),
    delivery ? `Bezorgkosten: ${order.feeCents ? fmt(order.feeCents) : 'gratis'}` : '', `Totaal: ${fmt(order.totalCents)}`, '',
    `Vragen? Bel ${shop.phone || ''}`].filter((x) => x !== '').join('\n');

  return { subject, html, text };
}

let transporter = null;
function getTransporter() {
  if (transporter !== null) return transporter;
  if (!process.env.SMTP_HOST) { transporter = false; return false; }
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined
  });
  return transporter;
}

/*
 * Verstuurt een e-mail. Geeft 'sent' (verstuurd) of 'saved' (SMTP niet ingesteld: alleen opgeslagen voor de proefversie) terug
 * en GOOIT een fout als versturen mislukt, zodat de wachtrij het later opnieuw kan proberen.
 * Een kopie op schijf (met naam en gegevens van de klant) wordt alleen bewaard zonder SMTP of met KEEP_MAIL_COPIES=1,
 * en na de bewaartermijn weer opgeruimd (purgeMailCopies).
 */
async function sendMail(order, kind, cfg, dataDir, nowMs) {
  const m = render(order, kind, cfg, new Date(nowMs || Date.now()));
  const tr = getTransporter();
  if (!tr || process.env.KEEP_MAIL_COPIES === '1') {
    try {
      const dir = path.join(dataDir, 'mails');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${order.id}-${kind}.html`), m.html);
    } catch (e) { /* een kopie is niet essentieel */ }
  }
  if (!tr) { console.log(`[mail] SMTP niet ingesteld: e-mail "${m.subject}" aan ${order.customer.email} alleen opgeslagen in data/mails`); return 'saved'; }
  await tr.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: order.customer.email, subject: m.subject, text: m.text, html: m.html });
  return 'sent';
}

function purgeMailCopies(dataDir, days, nowMs) {
  const dir = path.join(dataDir, 'mails');
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).mtimeMs < nowMs - days * 86400000) { fs.unlinkSync(p); n++; }
  }
  return n;
}

function resetTransporter() { transporter = null; }
module.exports = { render, sendMail, purgeMailCopies, resetTransporter, eta };


