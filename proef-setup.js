'use strict';
/* Zet de proefversie klaar: maakt twee proef-beheerders aan als er nog geen zijn. Wordt door start.bat gestart. */
const path = require('path');
const { open } = require('./lib/db');
const auth = require('./lib/auth');

const db = open(path.join(__dirname, 'data', 'bassma.db'));
if (!db.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
  auth.createUser(db, 'eigenaar', 'proefversie2026', 'owner', { demo: true });
  auth.createUser(db, 'medewerker', 'proefversie2026', 'staff', { demo: true });
  console.log('Proef-beheerders aangemaakt (eigenaar en medewerker).');
}

