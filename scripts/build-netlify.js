'use strict';
/*
 * Maakt de map "netlify-site" voor Netlify (optie A: Netlify = pagina's en domein, kleine server = bestellen en database):
 *   netlify-site/dist/          de openbare pagina's en de afbeeldingen die ze gebruiken
 *   netlify-site/netlify.toml   instellingen: /api/* wordt (met handtekening) doorgestuurd naar de server, plus veiligheidskoppen
 *
 * De handtekening ("signed") kan bij Netlify alleen in netlify.toml staan, niet in een _redirects-bestand.
 * Het geheim zelf staat NIET in deze bestanden: alleen de NAAM van de omgevingsvariabele (NETLIFY_SIGN_SECRET).
 * Die variabele zet je bij Netlify (Site configuration > Environment variables, met bereik "Runtime") en op de server.
 *
 * Gebruik (PowerShell, in de projectmap):
 *   $env:BACKEND_URL = "https://bassma-api-test.fly.dev"
 *   node scripts/build-netlify.js
 * Daarna uitrollen vanuit de map netlify-site (zie ONLINE-ZETTEN.md).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'netlify-site');
const OUT = path.join(SITE, 'dist');
const PAGES = ['index.html', 'bedankt.html', 'beheer.html', 'privacy.html'];

const backend = (process.env.BACKEND_URL || '').replace(/\/$/, '');
if (!/^https:\/\/[^/\s]+$/.test(backend)) {
  console.error('BACKEND_URL ontbreekt of is geen https-adres (bijvoorbeeld https://bassma-api-test.fly.dev).');
  process.exit(1);
}

fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const images = new Set();
for (const p of PAGES) {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  fs.writeFileSync(path.join(OUT, p), html);
  for (const m of html.matchAll(/images\/[A-Za-z0-9_\-./]+\.(?:png|jpe?g|webp|svg)/g)) images.add(m[0]);
}
for (let n = 1; n <= 3; n++) images.add(`images/gerechten/gerecht-${n}.png`);   /* de bewegende gerechten worden dynamisch geladen */

let copied = 0;
for (const img of images) {
  const src = path.join(ROOT, img);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(path.join(OUT, img)), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, img));
  copied++;
}
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /beheer\nDisallow: /bedankt.html\n');

/* veiligheidskoppen overnemen uit de netlify.toml van het project (alles vanaf het eerste [[headers]]-blok) */
const rootToml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const hi = rootToml.indexOf('[[headers]]');
const headers = hi >= 0 ? rootToml.slice(hi) : '';

fs.writeFileSync(path.join(SITE, 'netlify.toml'), `# Gegenereerd door scripts/build-netlify.js: niet met de hand aanpassen.
[build]
  publish = "dist"

# Alles onder /api/ gaat naar de server. Netlify ondertekent elke aanvraag (header x-nf-sign) met het geheim uit
# de omgevingsvariabele NETLIFY_SIGN_SECRET, zodat de server alleen verkeer via deze website accepteert.
[[redirects]]
  from = "/api/*"
  to = "${backend}/api/:splat"
  status = 200
  force = true
  signed = "NETLIFY_SIGN_SECRET"

[[redirects]]
  from = "/beheer"
  to = "/beheer.html"
  status = 200

[[redirects]]
  from = "/privacy"
  to = "/privacy.html"
  status = 200

${headers}`);

console.log(`Klaar: map netlify-site met ${PAGES.length} pagina's, ${copied} afbeeldingen en doorverwijzing naar ${backend}`);
