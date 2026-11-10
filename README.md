# Bassma Lunchroom: webshop met betalen, tijdsloten en beheer

Een restaurantwebsite waar klanten kunnen bestellen en betalen, en waar het restaurant bestellingen beheert en bonnen print. Bouwt voort op de bestaande site (`index.html`, zelfde huisstijl en talen).

**Lees ook `ONLINE-ZETTEN.md` (domein + Netlify + server), `HERSTEL-EN-BACKUPS.md` en `SUMUP-KASSA.md`**: daarin staat wat de SumUp-kassa wel en niet kan (er is geen gedocumenteerde koppeling om webbestellingen in de SumUp-kassa of op de SumUp-printer te zetten).

## Wat zit erin
| Onderdeel | Bestand |
|---|---|
| Webshop (menu, mandje, afhalen/bezorgen, datum en tijd, betalen) | `index.html` |
| Terugkeerpagina na betalen | `bedankt.html` |
| Beheerpaneel (inloggen, bestellingen, telefonisch, tijden, menu, logboek, bonnen) | `beheer.html` |
| Server, API, betaalmeldingen | `server.js`, `lib/app.js` |
| Betaalproviders (SumUp, Mollie) | `lib/payments.js` |
| Bestellingen, tijdsloten reserveren, terugbetalen | `lib/orders.js`, `lib/settings.js` |
| Bonnen (ESC/POS en browser) | `lib/print.js` |
| Inloggen | `lib/auth.js`, `create-admin.js` |
| E-mails (bevestiging, onderweg, klaar) | `mail.js` |
| Database (SQLite, één bestand `data/bassma.db`) | `lib/db.js` |
| Tests en SumUp-simulator | `test/` |

## Opstarten
1. Installeer **Node.js 22.5 of nieuwer** (https://nodejs.org). De database is ingebouwd, er is geen aparte databaseserver nodig.
2. In deze map: `npm install`
3. Kopieer `.env.example` naar `.env` en vul in (zie de uitleg in het bestand).
4. Maak een beheerder: `node create-admin.js` (naam, rol `owner` voor de eigenaar of `staff` voor een medewerker, wachtwoord van minstens 10 tekens).
5. Start: `node server.js` en open `http://localhost:3000` (webshop) en `http://localhost:3000/beheer`.

Bij de eerste start wordt het menu uit `index.html` in de database gezet. Daarna wijzig je prijzen en producten in het beheerpaneel (de lijst in `index.html` wordt dan niet meer gebruikt door de server).

## Proberen zonder SumUp-account (simulator)
In een tweede venster: `node test/mock-sumup.js`. Zet in `.env`:
```
PAYMENT_PROVIDER=sumup
SUMUP_API_BASE=http://localhost:4010
SUMUP_API_KEY=simulator
SUMUP_MERCHANT_CODE=MCSIM
ALLOW_HTTP_WEBHOOK=1
PUBLIC_URL=http://localhost:3000
```
De betaalpagina is dan een simulator met knoppen "slagen" en "mislukken". Er wordt niets afgeschreven. Haal deze regels weg voor gebruik met echte betalingen.

## Betalen: SumUp of Mollie
- `PAYMENT_PROVIDER=sumup`: SumUp Online Checkout (kaart, Apple Pay, Google Pay; iDEAL alleen als SumUp dat voor jouw account activeert).
- `PAYMENT_PROVIDER=mollie`: iDEAL, Bancontact, creditcard.
- Test eerst met een SumUp **sandbox**-account. Doe pas daarna een kleine echte betaling en terugbetaling. De server doet nooit zelf echte betalingen of terugbetalingen: een terugbetaling gebeurt alleen als de eigenaar in het beheer op "Terugbetalen" klikt en bevestigt.

### Wat er veilig is geregeld
- Prijzen, bezorgkosten en totaal worden **op de server** berekend uit de database. Bedragen uit de browser worden genegeerd.
- Een bestelling is pas **betaald** als de server bij SumUp/Mollie zelf heeft opgehaald dat de betaling geslaagd is, en bedrag, valuta, referentie en merchant code kloppen.
- Dubbele betaalmeldingen (webhooks), vernieuwen van de pagina en dubbelklikken leveren **één** bestelling, **één** bon en **één** mail op.
- Mislukte, geannuleerde en verlopen betalingen geven het tijdslot vrij en krijgen nooit een bon. Verloopt een reservering terwijl de klant toch betaalt, dan wordt de bestelling alsnog betaald en staat er een melding in het logboek.
- Tijdsloten worden in één databasestap gecontroleerd en gereserveerd, zodat twee klanten niet dezelfde laatste plek krijgen.

## Beheerpaneel (`/beheer`)
- **Bestellingen:** per dag, "actie nodig" bij nieuwe bestellingen, statussen (accepteren, in bereiding, klaar, onderweg, afgerond, weigeren), bon opnieuw printen, betaalstatus vernieuwen, terugbetalen (alleen eigenaar). "Onderweg" en "Klaar" sturen een mail naar de klant.
- **Telefonisch:** bestelling invoeren (nog te betalen / contant / gepind). Er komt direct een bon; volle tijdsloten mogen bij telefonische bestellingen.
- **Tijden & drukte (eigenaar):** openingstijden per dag, uitzonderingen (feestdagen), tijdslotlengte, maximum per tijdslot (ook per slot), tijdsloten sluiten, voorbereidingstijd, bezorgen aan/uit, bezorggebieden met kosten, gratis bezorging, minimaal bedrag.
- **Menu & prijzen (eigenaar):** prijzen, menuprijzen, beschikbaarheid, categorieën zichtbaar/verborgen, producten toevoegen of verwijderen.
- **Logboek:** alle gebeurtenissen; rood = betaling, bon of mail mislukt.
- Werkt op de kassa, tablet of computer. Medewerkers (`staff`) kunnen bestellingen verwerken, maar geen instellingen, menu of terugbetalingen wijzigen.

## Volgen door de klant
Na het bestellen krijgt de klant een link naar een volgpagina (edankt.html). Die toont live wat er gebeurt: een animatie met een pan bij **in bereiding** en een rijdende bezorger bij **onderweg** (alleen bij bezorgen), de verwachte tijd die de beheerder doorgeeft (per 2,5 minuut, maximaal 30 minuten) en bij bezorgen een knop met de route in Google Maps van Bassma naar het adres van de klant.

## Bonnen
Zie `SUMUP-KASSA.md`. Kort: netwerkprinter via ESC/POS (`PRINTER_HOST`) of "Bonnenmodus" in het beheerpaneel op de kassa/tablet. Mislukte bonnen worden met wachttijden automatisch opnieuw geprobeerd (10 s, 30 s, 1, 2, 5, 10, 15 min) en nooit dubbel geprint; "Bon opnieuw" maakt een bewuste kopie met het woord KOPIE.

## Bezorgen
Standaard: € 2 binnen 17,5 km (hemelsbreed vanaf de zaak, adres via PDOK), gratis vanaf € 60. Aan te passen in het beheerpaneel (zones met afstand en kosten). Verwachte tijd: 5–10 minuten voor het gerecht plus 1 minuut per kilometer.

## Online zetten (live)
1. Host met **Node.js 22.5+**, een **vaste schijf** voor `data/` en **HTTPS** op je eigen domein. Gewone webhosting zonder Node.js werkt niet.
2. Zet `.env` (of omgevingsvariabelen) op de server. Deel `.env` nooit en zet `data/` en `.env` niet in git.
3. `PUBLIC_URL` = je https-adres. SumUp en Mollie sturen betaalmeldingen alleen naar bereikbare https-adressen.
4. Maak een back-up van `data/bassma.db` (bijvoorbeeld dagelijks).
5. Start de server met een procesbewaker (bijvoorbeeld systemd, pm2 of de herstartfunctie van je host) zodat hij na een storing weer opstart.
6. Test met de sandbox, daarna één kleine echte bestelling inclusief terugbetaling, en kijk in het logboek of alles klopt.
7. Meld in het beheer je openingstijden, bezorgregels en prijzen na.

## Beveiliging en privacy (bijgewerkt)
- Opzet online: Netlify (pagina's en domein) + een kleine server met de database. De server accepteert dan alleen aanvragen die Netlify ondertekent (`NETLIFY_SIGN_SECRET`). Zie `ONLINE-ZETTEN.md`.
- Wachtwoorden: minstens 12 tekens en geen veelgebruikte wachtwoorden; wijzigen en gebruikers beheren in het beheer (tabblad Veiligheid). Foute inlogpogingen blokkeren alleen de aanvaller (per gebruiker en IP), niet iedereen. De server start niet in productie zolang er proef-inloggegevens zijn.
- Terugbetalen kan maar één keer tegelijk per bestelling; een bezoeker kan maximaal 2 onbetaalde bestellingen tegelijk hebben (voorkomt dat tijdsloten worden geblokkeerd).
- E-mails staan in een wachtrij en worden bij een storing opnieuw geprobeerd. Kopieën met klantgegevens worden alleen zonder SMTP bewaard en na 7 dagen gewist.
- Dagelijkse automatische, versleutelde back-ups, optioneel naar externe opslag (`HERSTEL-EN-BACKUPS.md`). Gezondheidscontrole op `/api/health`.
- Een privacyverklaring staat als concept in `privacy.html` (invullen en laten controleren).
- Beheer: wachtwoorden met scrypt, sessie in een HttpOnly/SameSite=Strict-cookie (Secure op https), CSRF-sleutel op alle wijzigingen, maximaal 8 inlogpogingen per 10 minuten, rollen eigenaar/medewerker.
- Geheime sleutels staan alleen in `.env` op de server. De browser krijgt nooit een sleutel te zien.
- Er worden **geen kaartgegevens** opgeslagen of verwerkt; de klant betaalt op de pagina van SumUp/Mollie.
- Bewaartermijn: na `RETENTION_DAYS` (standaard 90) dagen worden naam, telefoon, e-mail, adres en opmerking gewist; bedragen en bestelregels blijven voor de administratie. Pas dit aan in overleg met je boekhouder.
- Beperk de toegang tot `/beheer` indien mogelijk verder (bijvoorbeeld via je host of firewall). Maak een privacyverklaring voor de website (AVG): welke gegevens, waarvoor, hoe lang, en wie de verwerkers zijn (SumUp/Mollie, e-mailprovider, hosting).

## Tests
`npm test` draait 38 tests (nagebouwd SumUp, adressen en printer): geslaagde, mislukte en dubbele betaling, bedrag-mismatch, afhalen, bezorgen, gesloten/volle tijdsloten, telefonische bestelling, bon opnieuw verwerken, echte TCP-printerverbinding, terugbetaling, verlopen reservering, rechten en privacy. Dit bewijst de logica van onze server; het bewijst **niet** dat jouw SumUp-account of printer werkt. Dat controleer je met de sandbox en de eerste echte bestelling.

## Bekende beperkingen
- Terugbetalingen die je buiten dit systeem doet (in het SumUp-dashboard) worden niet automatisch overgenomen; gebruik de knop in het beheer.
- Geen koppeling met de SumUp-kassa (zie `SUMUP-KASSA.md`).
- Bezorgafstand is hemelsbreed, niet over de weg.
- E-mails vragen eigen SMTP-gegevens. Zonder die gegevens worden ze alleen opgeslagen in `data/mails`.


