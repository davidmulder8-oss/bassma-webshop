'use strict';
/*
 * Back-ups van de database.
 *  - Een veilige kopie terwijl de server draait (SQLite "VACUUM INTO"), met controle van de kopie.
 *  - Optioneel versleuteld (AES-256-GCM, sleutel uit BACKUP_ENCRYPTION_KEY) en gecomprimeerd.
 *  - Optioneel naar externe opslag met S3-protocol (Backblaze B2, Cloudflare R2, AWS S3, Hetzner Object Storage, ...).
 *  - Bewaart lokaal de laatste N back-ups.
 * Herstellen: zie restore-backup.js en HERSTEL-EN-BACKUPS.md.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const https = require('https');
const http = require('http');

const MAGIC = Buffer.from('BSMBK1');
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');

/* ---------- versleutelen ---------- */
function encrypt(buf, passphrase) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}
function decrypt(buf, passphrase) {
  if (buf.length < MAGIC.length + 44 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Dit bestand is geen versleutelde Bassma-back-up');
  let o = MAGIC.length;
  const salt = buf.subarray(o, o + 16); o += 16;
  const iv = buf.subarray(o, o + 12); o += 12;
  const tag = buf.subarray(o, o + 16); o += 16;
  const key = crypto.scryptSync(passphrase, salt, 32);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(buf.subarray(o)), d.final()]); }
  catch (_) { throw new Error('Ontsleutelen mislukt: verkeerde sleutel of beschadigd bestand'); }
}

/* ---------- AWS Signature versie 4 (voor S3-opslag) ---------- */
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
function signV4({ method, host, canonicalUri, query = '', headers = {}, payloadHash, region, service = 's3', accessKey, secretKey, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const date = amzDate.slice(0, 8);
  const all = Object.assign({}, headers, { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate });
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = {}; Object.keys(all).forEach((k) => { lower[k.toLowerCase()] = String(all[k]).trim(); });
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [method, canonicalUri, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canonical)].join('\n');
  const kDate = hmac('AWS4' + secretKey, date), kRegion = hmac(kDate, region), kService = hmac(kRegion, service), kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  return { signature, signedHeaders, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`, amzDate, canonical };
}

function s3Configured(env) { return !!(env.BACKUP_S3_ENDPOINT && env.BACKUP_S3_BUCKET && env.BACKUP_S3_ACCESS_KEY && env.BACKUP_S3_SECRET_KEY); }

function s3Put(env, key, buf) {
  return new Promise((resolve, reject) => {
    const ep = new URL(env.BACKUP_S3_ENDPOINT);
    const region = env.BACKUP_S3_REGION || 'us-east-1';
    const uriPath = `/${encodeURIComponent(env.BACKUP_S3_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`;   /* path-style */
    const payloadHash = hex(buf);
    const s = signV4({ method: 'PUT', host: ep.host, canonicalUri: uriPath, payloadHash, region, accessKey: env.BACKUP_S3_ACCESS_KEY, secretKey: env.BACKUP_S3_SECRET_KEY, headers: { 'content-length': String(buf.length) } });
    const lib = ep.protocol === 'https:' ? https : http;
    const req = lib.request({ host: ep.hostname, port: ep.port || (ep.protocol === 'https:' ? 443 : 80), path: uriPath, method: 'PUT',
      headers: { Host: ep.host, 'Content-Length': buf.length, 'x-amz-content-sha256': payloadHash, 'x-amz-date': s.amzDate, Authorization: s.authorization } }, (res) => {
      let b = ''; res.on('data', (d) => { b += d; });
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300 ? resolve() : reject(new Error('Externe opslag weigerde de back-up (' + res.statusCode + ')'))));
    });
    req.setTimeout(60000, () => req.destroy(new Error('Externe opslag reageert niet (timeout)')));
    req.on('error', reject);
    req.end(buf);
  });
}

/* ---------- back-up maken ---------- */
function integrity(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const r = db.prepare('PRAGMA integrity_check').get();
    const ok = Object.values(r)[0] === 'ok';
    const orders = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
    return { ok, orders };
  } finally { db.close(); }
}

async function runBackup(db, dir, env, now = new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  const name = `bassma-${stamp(now)}`;
  const tmp = path.join(dir, name + '.tmp.db');
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const chk = integrity(tmp);
  if (!chk.ok) { fs.unlinkSync(tmp); throw new Error('De back-up is beschadigd (integriteitscontrole mislukt)'); }
  let outFile, remoteKey;
  if (env.BACKUP_ENCRYPTION_KEY) {
    const enc = encrypt(zlib.gzipSync(fs.readFileSync(tmp)), env.BACKUP_ENCRYPTION_KEY);
    outFile = path.join(dir, name + '.db.gz.enc');
    fs.writeFileSync(outFile, enc);
    fs.unlinkSync(tmp);
  } else {
    outFile = path.join(dir, name + '.db');
    fs.renameSync(tmp, outFile);   /* zonder sleutel blijft de back-up onversleuteld: bevat klantgegevens */
  }
  let uploaded = false;
  if (s3Configured(env)) {
    remoteKey = (env.BACKUP_S3_PREFIX ? env.BACKUP_S3_PREFIX.replace(/\/?$/, '/') : 'bassma/') + path.basename(outFile);
    await s3Put(env, remoteKey, fs.readFileSync(outFile));
    uploaded = true;
  }
  /* oude lokale back-ups opruimen: bewaar de nieuwste N */
  const keep = Number(env.BACKUP_KEEP || 14);
  const files = fs.readdirSync(dir).filter((f) => /^bassma-.*\.(db|db\.gz\.enc)$/.test(f)).sort().reverse();
  files.slice(keep).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  return { file: outFile, bytes: fs.statSync(outFile).size, orders: chk.orders, encrypted: !!env.BACKUP_ENCRYPTION_KEY, uploaded, remoteKey };
}

function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^bassma-.*\.(db|db\.gz\.enc)$/.test(f)).sort().reverse()
    .map((f) => { const s = fs.statSync(path.join(dir, f)); return { name: f, bytes: s.size, modified: s.mtime.toISOString(), encrypted: f.endsWith('.enc') }; });
}

/* ---------- terugzetten (wordt gebruikt door restore-backup.js) ---------- */
function readBackupToDbFile(file, passphrase, outFile) {
  let buf = fs.readFileSync(file);
  if (file.endsWith('.enc')) { if (!passphrase) throw new Error('Deze back-up is versleuteld: geef de sleutel (BACKUP_ENCRYPTION_KEY)'); buf = zlib.gunzipSync(decrypt(buf, passphrase)); }
  fs.writeFileSync(outFile, buf);
  const chk = integrity(outFile);
  if (!chk.ok) throw new Error('De back-up is beschadigd (integriteitscontrole mislukt)');
  return chk;
}

module.exports = { runBackup, listBackups, readBackupToDbFile, encrypt, decrypt, signV4, s3Put, s3Configured, integrity };
