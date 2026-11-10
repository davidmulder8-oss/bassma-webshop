'use strict';
/* Maakt een beheerder aan (of wijzigt het wachtwoord). Gebruik: node create-admin.js [gebruikersnaam] [owner|staff] */
const path = require('path');
const readline = require('readline');
const { open } = require('./lib/db');
const auth = require('./lib/auth');

function ask(q, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) { rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s); else if (s.includes('\n') || s.includes('\r')) process.stdout.write(s); }; }
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}

(async () => {
  /* Zelfde plek als de server: DATA_DIR, anders /data als die bestaat (vaste schijf op Fly.io), anders de map data naast dit bestand. */
  const fs = require('fs');
  const dataDir = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
  const db = open(path.join(dataDir, 'bassma.db'));
  console.log('Database: ' + path.join(dataDir, 'bassma.db'));
  const username = process.argv[2] || (await ask('Gebruikersnaam: ', false));
  const role = process.argv[3] || (await ask('Rol (owner = eigenaar, staff = medewerker) [owner]: ', false)) || 'owner';
  const password = process.env.ADMIN_PASSWORD || (await ask('Wachtwoord (minimaal 10 tekens): ', true));
  try {
    /* eerst het wachtwoord controleren, zodat een bestaande gebruiker nooit wordt verwijderd door een zwak wachtwoord */
    const bad = auth.checkPasswordPolicy(password, username.trim().toLowerCase());
    if (bad) throw new Error(bad);
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (exists) db.prepare('DELETE FROM users WHERE id = ?').run(exists.id);
    auth.createUser(db, username, password, role);
    console.log(`\nKlaar: gebruiker "${username.trim().toLowerCase()}" (${role}) is aangemaakt.`);
  } catch (e) { console.error('\nFout:', e.message); process.exit(1); }
})();

