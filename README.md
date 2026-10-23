# Remako Studio

Zasebna iPhone aplikacija za ekipo (Teo, Urška, Nives, Andjela), samo prek TestFlighta.
Na računalniku: **https://byurska-studio.web.app** (ista prijava in podatki, objavi se samodejno z workflowom *Spletna različica*).

- **Domov** je postavljen kot skica: Byurska.com s podstranmi in Apps (Nakupko, Manifest, Sentinel). Mape lahko dodajaš.
- **Objave** za Instagram in TikTok: vsak si v Nastavitvah sam izbere, kdaj ga telefon opomni (privzeto 2 in 1 dan prej ob 9:00 ter ob uri objave). Vsako objavo lahko dodaš v Koledar ali Opomnike na iPhonu.
- **Vsaka mapa** ima zavihke *TO DO* (naloge s stroški, vsaka z osebo in njeno barvo), *Ideje*, *Urejeno* (pripravljeno za objavo), *Surovo* (posnetki za urejanje), *Gesla*, *Opombe*, *Skripte* (za videe) in *Objave*. Mapo lahko zakleneš z lastnim geslom (meni ⋯). Vsebino shraniš v Fotografije ali pošlješ v Instagram/TikTok z gumbom *Shrani ali deli*.
- **Gesla** so šifrirana na telefonu s skupnim geslom ekipe (AES-GCM). Strežnik vidi samo šifrirano besedilo.
- **Nove aplikacije**: vsak dan ob 8:17 workflow *Nove aplikacije v Studio* doda vsak nov javni repozitorij na GitHubu kot mapo pod Apps. Kar izbrišeš, se ne vrne. Ročno dodaš app ali stran z gumbom *+ Dodaj* pod skupino.
- **Skupno**: vsi člani vidijo vse, razen *Moje mape* (osebni zapiski, vidi jih samo lastnik). Dostop imajo samo člani s potrjeno e-pošto (Teo, Urška in kdor je dodan v Nastavitve › Ekipa).

## Zgradba

| Mapa | Kaj je |
| --- | --- |
| `web/` | Zasloni (HTML, CSS, JavaScript). `web/src/main.js` je logika, `data.js` in `trezor.js` imata preizkuse v `web/tests/`. |
| `app/` | Capacitor ovoj za iOS. `app/ios/App/App/Studio.swift` je domači del: koledar, opomniki, obvestila, deljenje, Keychain. |
| `firebase/` | Pravila za Firestore (podatki) in Storage (slike, videi). |

## Nastavitve (enkrat)

1. **Firebase**: nov projekt `byurska-studio` (če je ID zaseden, nastavi spremenljivko `FIREBASE_PROJECT`), paket Blaze. Servisni račun z vlogo Owner, njegov JSON shrani v skrivnost `FIREBASE_SERVICE_ACCOUNT`. Workflow *Strežnik (Firebase)* nato sam ustvari bazo, vklopi prijavo z e-pošto, shrambo in objavi pravila.
2. **Apple**: ID paketa `com.byurska.studio` (Certificates, Identifiers & Profiles) in aplikacija v App Store Connect s tem ID-jem. Skrivnosti `APPLE_TEAM_ID`, `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_P8` (enake kot pri Fixku).
3. **Testerji**: workflow *TestFlight testerji* z e-poštami. Kdor še ni v ekipi App Store Connect, dobi povabilo samo za to aplikacijo; ko ga sprejme, workflow zaženi znova.

## Gradnja

- Vsak push na `main` zgradi aplikacijo in jo naloži na TestFlight (`.github/workflows/ios.yml`).
- Spremembe v `firebase/` se objavijo samodejno (`.github/workflows/firebase.yml`).
- Lokalni preizkus: `cd firebase && npx firebase-tools emulators:start --project demo-byurska`, nato
  `STUDIO_FB_CONFIG='{"apiKey":"x","projectId":"demo-byurska","storageBucket":"demo-byurska.appspot.com","appId":"x","emulator":true}' node app/scripts/build-www.js` in odpri `app/www`.
