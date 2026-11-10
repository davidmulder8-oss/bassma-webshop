# SumUp-kassa en bonprinter: wat kan wel en niet

Onderzocht in oktober 2026 in de officiële SumUp-documentatie (developer.sumup.com). Controleer bij SumUp of dit nog klopt voordat je er iets op bouwt.

## 1. Online betalen: dit is gebouwd
De **SumUp Online Checkout API** is geïntegreerd (`lib/payments.js`):
- `POST /v0.1/checkouts` met `hosted_checkout.enabled = true`: de klant betaalt op een betaalpagina van SumUp (kaart, Apple Pay, Google Pay).
- SumUp meldt een statuswijziging met een POST naar `return_url`: `{ "event_type": "CHECKOUT_STATUS_CHANGED", "id": "..." }`. Dat bericht is **niet ondertekend** en bevat geen status. Daarom haalt onze server altijd zelf `GET /v0.1/checkouts/{id}` op en vertrouwt alleen dat antwoord. Ook bedrag, valuta, referentie en merchant code worden vergeleken.
- Terugbetalen: `POST /v1.0/merchants/{merchant_code}/payments/{transaction_id}/refunds` (alleen door de eigenaar, met bevestiging).
- Een sessie van de betaalpagina duurt 30 minuten; het tijdslot blijft zo lang gereserveerd.

**Nog niet gecontroleerd tegen de echte SumUp-omgeving:** er zijn geen SumUp-sleutels beschikbaar geweest. De code is getest tegen een nagebouwde API (`test/shop.test.js`) en een simulator (`test/mock-sumup.js`). Doe eerst een proef in een **SumUp sandbox-account** (Developer Settings > Sandboxes). Een bedrag van € 11,00 laat een betaling in de sandbox altijd mislukken.

### iDEAL
iDEAL staat bij SumUp als "alternatieve betaalmethode" (alleen Nederland) en is niet automatisch actief: eenmanszaken krijgen het na registratie en een testbetaling, andere rechtsvormen moeten het bij SumUp aanvragen. In de documentatie van de Hosted Checkout wordt iDEAL niet genoemd. Daarom staat er een tweede provider klaar: **Mollie** (`PAYMENT_PROVIDER=mollie`), die iDEAL, Bancontact en creditcard biedt. Kies Mollie als je zeker iDEAL wilt hebben. Vraag je bij SumUp iDEAL aan en bevestigen ze dat het op de Hosted Checkout staat, zet dan `SUMUP_IDEAL=1`.

## 2. Bestellingen in de SumUp-kassa zetten: niet mogelijk met een gedocumenteerde API
In de publieke SumUp-API zijn alleen deze onderdelen gevonden: checkouts, transacties, terugbetalingen, uitbetalingen, bonnen (receipts), klanten, lezers (Cloud API voor kaartlezers) en leden/rollen. **Er is geen gedocumenteerde API om een externe bestelling als order of verkoop in de SumUp POS te zetten, en geen API om naar de SumUp-printer te sturen.**

Daarom is er bewust **geen koppeling met de SumUp-kassa** gebouwd en geen omweg. Wat wel kan:
- **SumUp Order & Pay** (onderdeel van POS Plus) is SumUp's eigen bestelfunctie voor gasten, bijvoorbeeld via QR-code aan tafel. Dat is niet hetzelfde als ons eigen webshop-systeem.
- **Een integratiepartner:** Deliverect meldt een tweerichtingskoppeling met SumUp POS (voor bestellingen van bezorgplatforms naar de kassa). Op hun pagina staan Frankrijk, Italië en Spanje; of Nederland ondersteund wordt en welk abonnement nodig is moet je bij Deliverect navragen. Het vraagt een abonnement bij SumUp POS én Deliverect.
- **Dit systeem naast de kassa:** bestellingen komen in het beheerpaneel (`/beheer`) en op een bonprinter, zoals hieronder. De kassa blijft voor de verkoop in de zaak.

Vraag SumUp (partner-/developerondersteuning) schriftelijk: "Kan een eigen webshop bestellingen aanmaken in SumUp POS en laten printen? Voor welk kassamodel en softwareversie?" Zonder bevestiging bouwen we hier niets op.

## 3. Bonprinter
De SumUp-printer neemt geen opdrachten aan van buitenaf. Twee betrouwbare manieren zijn gebouwd:

1. **Netwerkprinter met ESC/POS** (Epson TM-serie, Star, enz.) die op het lokale netwerk zit. De server stuurt de bon rechtstreeks (`PRINTER_HOST`, poort 9100), met automatisch opnieuw proberen en zonder dubbele bonnen. Dit werkt alleen als de server in hetzelfde netwerk draait (bijvoorbeeld op een mini-PC in de zaak) of de printer via een veilige verbinding bereikbaar is.
2. **Bonnenmodus in het beheerpaneel**: de kassa, tablet of pc met een gewone (USB/netwerk) bonprinter laat `/beheer` open staan. Nieuwe bonnen worden automatisch afgedrukt in 80 mm-formaat. Voor stil printen zonder dialoogvenster start je Chrome met `--kiosk-printing`.

Een bon wordt pas aangemaakt als de betaling bij SumUp is gecontroleerd (of bij contant/telefonische bestelling).

## 4. Wat jij moet regelen
- SumUp developer-account, sandbox-sleutel (testen) en later de live API-sleutel + merchant code.
- Voor iDEAL: aanvraag bij SumUp, of een Mollie-account.
- Een bonprinter met netwerkaansluiting (of een gewone kassa-pc met USB-bonprinter voor de Bonnenmodus) en het merk/model voor controle.
- Antwoord van SumUp over een eventuele kassakoppeling.
