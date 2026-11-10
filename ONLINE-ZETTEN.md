# Online zetten met je eigen domein en Netlify (optie A)

**Opzet:** Netlify toont de pagina's op jouw domein. Alles onder `/api/…` stuurt Netlify (ondertekend) door naar een kleine server die de database en de betalingen draait. Voor de bezoeker is het één adres.

```
bezoeker  →  www.jouwdomein.nl (Netlify: pagina's)  →  /api/*  →  bassma-api (server met database, Amsterdam)
                                                               ←  SumUp stuurt betaalmeldingen óók via www.jouwdomein.nl/api/webhook/sumup
```

## Wat wel en niet getest is
- Getest met 38 automatische tests: de server zelf, betalingen (nagebouwd), back-ups, e-mailwachtrij, beveiliging, het controleren van de Netlify-handtekening.
- **Niet getest, omdat daar jouw accounts voor nodig zijn:** Netlify zelf (of de doorverwijzing met handtekening en de cookies van de beheerlogin goed doorkomen), Fly.io, de Dockerfile, de echte SumUp en een echte e-mailserver. Daarom begin je met een **testomgeving** (zie onder).

## Wat je nodig hebt (jij maakt deze aan)
1. Je domein en toegang tot de DNS-instellingen.
2. Een Netlify-account (heb je al).
3. Een hostingaccount voor de server: aanbevolen Fly.io, regio Amsterdam (ongeveer $4–5 per maand voor een kleine server plus $0,15 per GB schijf; controleer de actuele prijs). Hetzner (Duitsland/Finland) kan ook.
4. Een SumUp developer-account (sandbox-sleutel om te testen, later de live sleutel + merchant code).
5. E-mailgegevens (SMTP) en een externe opslag voor back-ups (zie `HERSTEL-EN-BACKUPS.md`).

## Stap 1: testomgeving (zonder echte klanten of geld)
Doe alles eerst met een **testadres** (bijvoorbeeld `test.jouwdomein.nl` of het gratis `…netlify.app`-adres) en een **aparte** server `bassma-api-test` met een eigen database en de **sandbox**-sleutels van SumUp. Zo kan er niets misgaan met echte gegevens.

1. **Server (Fly.io)**, in de map van de webshop:
   ```
   fly apps create bassma-api-test
   fly volumes create bassma_data --app bassma-api-test --region ams --size 1
   fly secrets set --app bassma-api-test SUMUP_API_KEY=... SUMUP_MERCHANT_CODE=... NETLIFY_SIGN_SECRET=... BACKUP_ENCRYPTION_KEY=... SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... MAIL_FROM="Bassma <bestellingen@jouwdomein.nl>"
   fly deploy --config fly.test.toml
   ```
   (Voor de testomgeving gebruik je `fly.test.toml`; pas daarin `PUBLIC_URL` aan zodra je het Netlify-testadres weet. De echte `fly.toml` laat je ongemoeid.) De server weigert te starten zolang er proef-inloggegevens zijn; maak daarom een echte beheerder: `fly ssh console --app bassma-api-test` en dan `su-exec node node create-admin.js` (met `su-exec node` zodat de database van de juiste gebruiker blijft). Het scherm toont "Database: /data/bassma.db"; staat daar iets anders, stop dan.
2. **Netlify (uitrollen met het Netlify-programma, niet met slepen):** de handtekening voor de doorverwijzing werkt bij Netlify alleen via `netlify.toml`, en slepen leest dat bestand niet. Daarom:
   - Bouw de map: `$env:BACKEND_URL = "https://bassma-api-test.fly.dev"` en dan `node scripts/build-netlify.js`. Dat maakt de map `netlify-site` (met `dist` en een `netlify.toml`).
   - Installeer het Netlify-programma: `npm install -g netlify-cli`, log in met `netlify login` en maak een site met `netlify sites:create`.
   - Zet bij Netlify onder *Site configuration → Environment variables* de variabele `NETLIFY_SIGN_SECRET` met **dezelfde** waarde als op de server en met bereik **Runtime**.
   - Rol uit vanuit de map `netlify-site`: `netlify deploy --prod --dir dist`.
3. Zet op de server `PUBLIC_URL` op het testadres (bijvoorbeeld `https://test.jouwdomein.nl`).
4. **Controleer:**
   - `https://test.jouwdomein.nl` toont de webshop; bestellen werkt; beheer (`/beheer`) logt in.
   - Beheer → Veiligheid → de waarschuwingen. Stel in tot er niets meer staat dat jij belangrijk vindt.
   - Beheer-inlog blijft ingelogd na het verversen. Werkt dat niet via Netlify, dan zit het probleem in de doorverwijzing van cookies en zoeken we een oplossing (bijvoorbeeld dat het beheer rechtstreeks op de server staat).
   - Tabblad Veiligheid → "Nu een back-up maken" → de back-up staat ook in je externe opslag. Doe een **herstelproef**.
   - **IP-adres van de bezoeker:** de inlogbeveiliging moet het echte IP weten. Log in als eigenaar en open `/api/admin/debug-headers`: kijk welke header het IP van je eigen computer bevat en zet die naam als `CLIENT_IP_HEADER` op de server. Dat is zo nodig om niet iedereen als één bezoeker te zien.
   - Doe een SumUp-sandbox-betaling (bedrag € 11,00 laat een betaling altijd mislukken) en controleer dat de bestelling pas na de gelukte betaling in het beheer staat, en dat de bon en de mail komen.
5. Wijst iets niet goed? Zeg het, dan pas ik het aan.

## Stap 2: live
Pas als stap 1 klopt:
1. Maak een tweede server (`bassma-api`) met een **eigen** database en de **live** SumUp-sleutel. Zet `PUBLIC_URL` op `https://www.jouwdomein.nl`.
2. Zet in Netlify (productie) `BACKEND_URL` op die server en zet je domein in Netlify (Domain management). Volg Netlify voor de DNS-instellingen; HTTPS regelt Netlify.
3. Meld in het SumUp-dashboard niets: de betaalmelding (`return_url`) wordt per betaling meegestuurd, via je domein.
4. Doe één kleine echte bestelling en één terugbetaling vanuit het beheer. Controleer het logboek.
5. Zet een privacyverklaring op de site (`privacy.html` invullen en laten controleren).
6. Controleer elke week het tabblad Veiligheid en doe elke maand een herstelproef.

## Kosten (richtprijzen, check bij aanschaf)
| Onderdeel | Ongeveer |
|---|---|
| Netlify (je bestaande plan) | wat je nu al betaalt |
| Server op Fly.io (shared-cpu-1x, 512 MB) | $4–5 per maand + $0,15 per GB schijf |
| Domein | € 10–15 per jaar (heb je al) |
| Externe back-upopslag (B2/R2) | meestal minder dan € 1 per maand |
| E-mailverzending (SMTP) | vaak gratis tot een aantal mails per maand, anders enkele euro's |
| SumUp-kosten per betaling | afhankelijk van je contract (niet onderzocht) |
| Btw komt eventueel nog bij | |

## Wat alleen jij kunt beslissen
- Welke bewaartermijn voor klantgegevens (nu 90 dagen; wettelijke administratieplicht geldt voor bedragen, niet voor namen en adressen).
- Of bonnen via het beheer op de kassa/tablet gaan of via een netwerkprinter in de zaak (die laatste werkt niet vanaf een server in de cloud).


