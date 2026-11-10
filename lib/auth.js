'use strict';
/* Inloggen voor het beheerpaneel: wachtwoorden met scrypt, sessies in de database (alleen een hash van de sessiesleutel),
 * wachtwoordbeleid, blokkade bij foute pogingen (per gebruiker+IP, niet voor iedereen tegelijk). */
const crypto = require('crypto');

const SESSION_HOURS = 12;
const DEMO_PASSWORD = 'proefversie2026';

/* veelgebruikte wachtwoorden (klein lijstje; aanvullend op de lengte-eis) */
const COMMON = ['password', 'wachtwoord', 'welkom', 'welkom123', 'qwerty', 'abc123', 'letmein', 'iloveyou', 'admin', 'administrator', 'bassma', 'lunchroom', 'gorinchem', 'restaurant', 'webshop', 'proefversie', 'test', 'changeme', 'geheim', 'voetbal', 'amsterdam', 'nederland', 'zomer', 'winter', 'lente', 'herfst', 'sunshine', 'football', 'monkey', 'dragon', 'master', 'shadow', '123456', '12345678', 'qwertyuiop', 'asdfghjkl'];

function checkPasswordPolicy(password, username) {
  const p = String(password || '');
  if (p.length < 12) return 'Het wachtwoord moet minstens 12 tekens zijn';
  const low = p.toLowerCase(), user = String(username || '').toLowerCase();
  if (user && low.includes(user)) return 'Het wachtwoord mag je gebruikersnaam niet bevatten';
  const stripped = low.replace(/[^a-z]/g, '');
  if (COMMON.some((c) => stripped === c || low === c || (stripped.length <= c.length + 4 && stripped.includes(c) && /^\D*\d{0,6}\D*$/.test(low.replace(c, ''))))) return 'Dit wachtwoord is te makkelijk te raden. Kies een langere zin of meerdere woorden.';
  if (new Set(p).size < 6) return 'Gebruik meer verschillende tekens';
  return null;
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

function createUser(db, username, password, role, opts = {}) {
  username = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Gebruikersnaam: 3-30 tekens (letters, cijfers, . _ -)');
  if (!['owner', 'staff'].includes(role)) throw new Error('Rol moet owner of staff zijn');
  if (!opts.demo) { const bad = checkPasswordPolicy(password, username); if (bad) throw new Error(bad); }
  const { salt, hash } = hashPassword(password);
  db.prepare('INSERT INTO users (username, salt, hash, role, demo) VALUES (?, ?, ?, ?, ?)').run(username, salt, hash, role, opts.demo ? 1 : 0);
}

function verify(u, password) {
  const { hash } = hashPassword(String(password || ''), u ? u.salt : 'ffffffffffffffffffffffffffffffff');   /* altijd één hash berekenen, zodat het niet uitmaakt of de gebruiker bestaat */
  if (!u) return false;
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function checkPassword(db, username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!verify(u, password) || u.disabled) return null;
  return u;
}

function changePassword(db, userId, oldPassword, newPassword) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u || !verify(u, oldPassword)) throw new Error('Het huidige wachtwoord klopt niet');
  const bad = checkPasswordPolicy(newPassword, u.username); if (bad) throw new Error(bad);
  setPassword(db, userId, newPassword);
}

function setPassword(db, userId, newPassword) {
  const { salt, hash } = hashPassword(newPassword);
  db.prepare('UPDATE users SET salt = ?, hash = ?, demo = 0 WHERE id = ?').run(salt, hash, userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);   /* andere ingelogde apparaten worden uitgelogd */
}

/* Gebruikers die nog het proefwachtwoord hebben (mag nooit online staan) */
function demoUsers(db) {
  return db.prepare('SELECT * FROM users WHERE disabled = 0').all().filter((u) => u.demo || verify(u, DEMO_PASSWORD)).map((u) => u.username);
}

/* ---------- blokkade bij foute pogingen ---------- */
const WIN = 10 * 60 * 1000;
function loginCheck(db, username, ip, now = Date.now()) {
  username = String(username || '').trim().toLowerCase().slice(0, 40);
  db.prepare('DELETE FROM login_attempts WHERE ts < ?').run(now - 24 * 3600 * 1000);
  const pair = db.prepare('SELECT COUNT(*) n FROM login_attempts WHERE ok = 0 AND ts > ? AND username = ? AND ip = ?').get(now - WIN, username, ip).n;
  const fromIp = db.prepare('SELECT COUNT(*) n FROM login_attempts WHERE ok = 0 AND ts > ? AND ip = ?').get(now - WIN, ip).n;
  const forUser = db.prepare('SELECT COUNT(*) n FROM login_attempts WHERE ok = 0 AND ts > ? AND username = ?').get(now - 15 * 60 * 1000, username).n;
  /* hard blokkeren: dezelfde gebruiker vanaf hetzelfde IP, of één IP dat veel verschillende pogingen doet.
     Een echte beheerder vanaf een ander IP wordt niet buitengesloten door een aanvaller: die krijgt alleen een korte vertraging. */
  if (pair >= 5 || fromIp >= 20) return { blocked: true, delay: 0 };
  return { blocked: false, delay: forUser > 8 ? Math.min(3000, (forUser - 8) * 400) : 0 };
}
function loginRecord(db, username, ip, ok, now = Date.now()) {
  db.prepare('INSERT INTO login_attempts (ts, username, ip, ok) VALUES (?, ?, ?, ?)').run(now, String(username || '').trim().toLowerCase().slice(0, 40), ip, ok ? 1 : 0);
  if (ok) db.prepare('DELETE FROM login_attempts WHERE ok = 0 AND username = ? AND ip = ?').run(String(username || '').trim().toLowerCase().slice(0, 40), ip);
}

/* ---------- sessies ---------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(16).toString('hex');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires, csrf) VALUES (?, ?, ?, ?)').run(sha(token), user.id, Date.now() + SESSION_HOURS * 3600 * 1000, csrf);
  return { token, csrf, maxAge: SESSION_HOURS * 3600 };
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

/* Geeft { user, csrf } of null. Voor schrijvende verzoeken moet de X-CSRF-Token kloppen. */
function authenticate(db, req, needRole) {
  const token = parseCookies(req).bsess;
  if (!token) return null;
  const row = db.prepare(`SELECT s.csrf, s.expires, u.id, u.username, u.role, u.disabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(sha(token));
  if (!row || row.expires < Date.now() || row.disabled) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const sent = String(req.headers['x-csrf-token'] || '');
    if (sent.length !== row.csrf.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(row.csrf))) return null;
  }
  if (needRole === 'owner' && row.role !== 'owner') return { forbidden: true };
  return { user: { id: row.id, username: row.username, role: row.role }, csrf: row.csrf };
}

function destroySession(db, req) {
  const token = parseCookies(req).bsess;
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token));
}

function cleanSessions(db) { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); }

module.exports = { createUser, checkPassword, changePassword, setPassword, checkPasswordPolicy, demoUsers, DEMO_PASSWORD,
  loginCheck, loginRecord, createSession, authenticate, destroySession, cleanSessions, parseCookies };
