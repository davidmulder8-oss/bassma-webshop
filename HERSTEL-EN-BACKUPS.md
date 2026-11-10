# Back-ups en herstellen

Alle bestellingen, klantgegevens, het menu en de instellingen staan in één databasebestand: `bassma.db`. Raak je dat kwijt, dan raak je alles kwijt. Daarom maakt de server automatisch back-ups.

## Wat er automatisch gebeurt
- **Elke nacht** (en na een herstart als de laatste back-up ouder is dan 23 uur) maakt de server een veilige kopie van de database, terwijl de webshop gewoon blijft werken.
- De kopie wordt **gecontroleerd** (integriteitscontrole). Is hij beschadigd, dan wordt hij niet bewaard en staat er een melding in het logboek.
- Is `BACKUP_ENCRYPTION_KEY` ingesteld, dan wordt de kopie **gecomprimeerd en versleuteld** (AES-256). Dat is belangrijk, want de back-up bevat klantgegevens.
- Zijn de `BACKUP_S3_...`-gegevens ingesteld, dan wordt de kopie ook naar een **externe plek** gestuurd (Backblaze B2, Cloudflare R2, Hetzner Object Storage, Amazon S3 of een andere opslag met S3-protocol).
- Lokaal bewaart de server de nieuwste `BACKUP_KEEP` back-ups (standaard 14) in de map `backups` naast de database.
- In het beheer, tabblad **Veiligheid**, zie je de back-ups, de systeemstatus en een knop **Nu een back-up maken**. Is er geen verse back-up of is er iets mis, dan staat daar een waarschuwing.

## Wat je zelf moet regelen
1. **Een externe plek** voor back-ups. Een back-up op dezelfde schijf als de database beschermt niet als die schijf of server verdwijnt. Maak bijvoorbeeld een bucket bij Backblaze B2 of Cloudflare R2 (voor een webshop als deze kost dat ongeveer niets), maak een toegangssleutel die alleen in die bucket mag schrijven, en vul `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY` en `BACKUP_S3_REGION` in. Stel bij de bucket zelf in hoe lang oude bestanden bewaard worden (bijvoorbeeld 30 dagen).
2. **De versleutelingssleutel** (`BACKUP_ENCRYPTION_KEY`) bewaar je ook buiten de server, bijvoorbeeld in je wachtwoordmanager. **Raak je die sleutel kwijt, dan zijn de back-ups niet meer te openen.**
3. **Elke maand een herstelproef** (zie hieronder). Een back-up waarvan je niet weet dat hij werkt, is geen back-up.

## Zo controleer je een back-up (er verandert niets)
1. Stop niets; dit mag terwijl de webshop draait. Open een PowerShell in de map van de webshop (of via de server).
2. Voer uit, met je eigen bestandsnaam:
   ```
   node restore-backup.js data\backups\bassma-20261020-030000Z.db.gz.enc
   ```
3. Je ziet "Back-up is in orde: integriteitscontrole geslaagd, N bestelling(en)". Klopt dat aantal ongeveer, dan is de back-up goed.

## Zo zet je een back-up terug
Doe dit als de database kwijt of beschadigd is, of als er per ongeluk iets is gewist.
1. **Stop de server.** (Lokaal: sluit de zwarte vensters. Op Fly.io: `fly machine stop`.)
2. Haal indien nodig de back-up op van de externe opslag en zet hem op de server.
3. Controleer hem eerst (stap hierboven).
4. Zet terug:
   ```
   node restore-backup.js data\backups\bassma-20261020-030000Z.db.gz.enc --zet-terug
   ```
   De huidige database wordt niet weggegooid maar bewaard als `bassma.db.voor-herstel-<tijd>`.
5. **Start de server** en kijk in het beheer of de bestellingen er weer zijn.
6. Je verliest alles van **na** het moment van die back-up. Bestellingen van die periode staan nog in je e-mail, in het SumUp-dashboard en op de bonnen. Controleer die en voer ontbrekende bestellingen eventueel handmatig in.

## Op Fly.io
- De database staat op een vaste schijf (volume `bassma_data`). Fly maakt daarnaast dagelijkse momentopnamen van volumes. Bekijk en herstel die met `fly volumes snapshots list` en een nieuw volume vanaf de momentopname. Houd daar rekening mee als aanvulling; vertrouw er niet alleen op.
- Zonder volume gaat alles verloren bij een nieuwe uitrol. Controleer in het beheer onder **Veiligheid** dat er back-ups zijn voordat je live gaat.

## Wat een back-up niet is
- Een terugbetaling of betaling die al is gebeurd, wordt niet teruggedraaid door een back-up terug te zetten. Controleer na een herstel de betalingen in het SumUp-dashboard.
- Een back-up zonder externe kopie en zonder herstelproef is geen veiligheid.
