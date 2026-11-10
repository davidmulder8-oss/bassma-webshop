'use strict';
/*
 * Bassma Lunchroom: webshop-server (bestellen, betalen via SumUp of Mollie, tijdsloten, beheerpaneel, bonnen, e-mails).
 * Vereist Node.js 22.5 of nieuwer en eenmalig: npm install
 * Start: node server.js   (instellingen in .env, zie .env.example)
 * Eerste beheerder aanmaken: node create-admin.js
 */
const fs = require('fs');
const path = require('path');

/* .env inlezen */
(function loadEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
})();

const { createApp } = require('./lib/app');

/* Onverwachte fouten: vastleggen en netjes stoppen, zodat de host (Fly.io, systemd, ...) de server direct opnieuw start. */
process.on('uncaughtException', (e) => { console.error('ONVERWACHTE FOUT, server herstart:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('ONAFGEVANGEN BELOFTE, server herstart:', e); process.exit(1); });
const PORT = Number(process.env.PORT || 3000);
const app = createApp({});
if (process.env.NODE_ENV === 'production') {
  const demo = require('./lib/auth').demoUsers(app.db);
  if (demo.length) { console.error('GEWEIGERD: er staan nog proef-inloggegevens aan (' + demo.join(', ') + '). Wijzig het wachtwoord of schakel ze uit voordat je in productie draait.'); process.exit(1); }
}
app.start();
app.server.listen(PORT, () => {
  const e = process.env;
  console.log(`Bassma webshop draait op ${app.publicUrl}`);
  const p = app.ctx.providers.active;
  console.log(`Betaalprovider: ${p.name}${p.configured ? '' : '  (LET OP: sleutel ontbreekt in .env, online betalen werkt nog niet)'}`);
  if (!e.SMTP_HOST) console.log('LET OP: SMTP_HOST ontbreekt, e-mails worden alleen opgeslagen in data/mails.');
  console.log(e.PRINTER_HOST ? `Bonprinter: ${e.PRINTER_HOST}:${e.PRINTER_PORT || 9100}` : 'Geen netwerkprinter ingesteld: bonnen worden geprint via het beheerpaneel (Bonnenmodus).');
  if (!app.db.prepare('SELECT COUNT(*) AS n FROM users').get().n) console.log('Nog geen beheerder. Maak er een met: node create-admin.js');
});

