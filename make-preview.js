'use strict';
/* Maakt voorbeeld-e-mails met een nep-bestelling in de map "voorbeeld-emails". Gebruik: node make-preview.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mail = require('./mail');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const CFG = vm.runInNewContext('(' + /var CFG=(\{[\s\S]*?\n\});/.exec(html)[1] + ')', {});

const base = {
  id: 'BAS-123456', status: 'paid', stage: 'nieuw', method: 'ideal', time: 'asap', note: 'Zonder ui graag.',
  customer: { name: 'Sanne de Vries', phone: '06 12345678', email: 'sanne@voorbeeld.nl' },
  lines: [
    { name: 'Shoarma', category: 'Wraps', menu: true, qty: 1, unitCents: 1490 },
    { name: 'Kapsalon Bassma', category: 'Kapsalon', menu: false, qty: 1, unitCents: 1345 },
    { name: 'Ayran 200ml', category: 'Dranken', menu: false, qty: 2, unitCents: 250 }
  ]
};
const delivery = Object.assign({}, base, { type: 'delivery', km: 4.2, feeCents: 200, address: { street: 'Voorbeeldstraat 12', zip: '4205 AB', city: 'Gorinchem' } });
delivery.totalCents = delivery.lines.reduce((a, l) => a + l.unitCents * l.qty, 0) + delivery.feeCents;
const pickup = Object.assign({}, base, { id: 'BAS-654321', type: 'pickup', km: 0, feeCents: 0, address: null });
pickup.totalCents = pickup.lines.reduce((a, l) => a + l.unitCents * l.qty, 0);

const out = path.join(__dirname, 'voorbeeld-emails');
fs.mkdirSync(out, { recursive: true });
const files = [
  ['1-bevestiging-bezorgen.html', delivery, 'confirmed'],
  ['2-onderweg.html', delivery, 'onderweg'],
  ['3-bevestiging-afhalen.html', pickup, 'confirmed'],
  ['4-klaar-om-af-te-halen.html', pickup, 'klaar']
];
files.forEach(([name, o, kind]) => {
  const m = mail.render(o, kind, CFG);
  fs.writeFileSync(path.join(out, name), m.html);
  console.log(name, '->', m.subject);
});

