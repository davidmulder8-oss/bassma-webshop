'use strict';
/*
 * Maakt een voorbeeld van de bon (80 mm) als HTML met NEPGEGEVENS, met dezelfde opmaak als de echte bon (lib/print.js).
 * Gebruik: node scripts/maak-voorbeeldbon.js <uitvoer.html>
 * Daarna kan Edge/Chrome er een pdf van maken (zie voorbeeld-bon/README).
 */
const fs = require('fs');
const { ticketHtml } = require('../lib/print');

const order = {
  number: 'B-1042', type: 'delivery', channel: 'web', pay_status: 'paid',
  slot_date: '2026-11-14', slot_time: '12:30', created_at: '2026-11-14T11:52:10',
  items: JSON.stringify([
    { qty: 2, name: 'Voorbeeld broodje kip', unitCents: 550 },
    { qty: 1, name: 'Voorbeeld lunchmenu', unitCents: 895, menu: true },
    { qty: 1, name: 'Voorbeeld thee', unitCents: 250 },
  ]),
  fee_cents: 200, total_cents: 1,   /* wordt hieronder berekend */
  note: 'Zonder ui, graag. Bel aan bij de voordeur.',
  name: 'Voorbeeld Klant', phone: '06-12345678',
  address: JSON.stringify({ street: 'Voorbeeldstraat 1', zip: '0000 AA', city: 'Gorinchem' }), km: 2.4,
};
order.total_cents = JSON.parse(order.items).reduce((s, i) => s + i.qty * i.unitCents, 0) + order.fee_cents;

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Voorbeeldbon Bassma Lunchroom</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; background: #fff; color: #000; }
  .intro { font: 12px/1.4 Arial, sans-serif; text-align: center; padding: 6mm 4mm 2mm; color: #333; }
  .intro b { display: block; font-size: 13px; }
  .bon { width: 76mm; margin: 0 auto; padding: 2mm 0 8mm; font: 10.5px/1.35 "Consolas", "Courier New", monospace; overflow: hidden; }
  .bon div { white-space: pre !important; }
  .cut { text-align: center; font: 11px Arial, sans-serif; color: #888; padding: 2mm 0; }
  .foot { font: 11px/1.4 Arial, sans-serif; text-align: center; color: #333; padding: 0 4mm 6mm; }
</style></head><body>
<div class="intro"><b>Voorbeeld van een bon</b>Met nepgegevens.<br>Bij bezorging komen er twee bonnen:<br>de kassabon en de bezorgbon.</div>
<div class="bon">${ticketHtml(order, 'order')}</div>
<div class="cut">&#9986; - - - - - - - - - - - - - - - - - - - - - -</div>
<div class="bon">${ticketHtml(order, 'courier')}</div>
<div class="foot">Bedankt en eet smakelijk!<br>(Deze regel staat niet op de echte bon.)</div>
</body></html>`;

fs.writeFileSync(process.argv[2] || 'voorbeeldbon.html', html);
console.log('Klaar');
