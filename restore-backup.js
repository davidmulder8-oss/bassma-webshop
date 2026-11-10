'use strict';
/*
 * Back-up terugzetten.
 *   node restore-backup.js <back-upbestand>                 controleert alleen (er verandert niets)
 *   node restore-backup.js <back-upbestand> --zet-terug     zet de back-up terug als database
 * Versleutelde back-ups (.enc) hebben de sleutel nodig: zet BACKUP_ENCRYPTION_KEY in .env of in de omgeving.
 * Stop eerst de server! De huidige database wordt bewaard als bassma.db.voor-herstel-<tijd>.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { readBackupToDbFile } = require('./lib/backup');

(function loadEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
})();

const file = process.argv[2];
const apply = process.argv.includes('--zet-terug');
if (!file || !fs.existsSync(file)) { console.error('Geef het back-upbestand op, bijvoorbeeld: node restore-backup.js data\\backups\\bassma-20261020-030000Z.db.gz.enc'); process.exit(1); }

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const target = path.join(dataDir, 'bassma.db');
const tmp = path.join(os.tmpdir(), 'bassma-herstel-' + Date.now() + '.db');
try {
  const chk = readBackupToDbFile(file, process.env.BACKUP_ENCRYPTION_KEY, tmp);
  console.log(`Back-up is in orde: integriteitscontrole geslaagd, ${chk.orders} bestelling(en).`);
  if (!apply) { console.log('Er is niets teruggezet. Voeg --zet-terug toe om de back-up echt terug te zetten.'); fs.unlinkSync(tmp); process.exit(0); }
  if (fs.existsSync(target)) {
    const keep = target + '.voor-herstel-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(target, keep);
    ['-wal', '-shm'].forEach((s) => { if (fs.existsSync(target + s)) fs.renameSync(target + s, keep + s); });
    console.log('De huidige database is bewaard als: ' + keep);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(tmp, target);
  fs.unlinkSync(tmp);
  console.log('Klaar: de back-up is teruggezet in ' + target + '. Start de server weer.');
} catch (e) {
  try { fs.unlinkSync(tmp); } catch (_) { /* niets */ }
  console.error('Mislukt: ' + e.message);
  process.exit(1);
}
