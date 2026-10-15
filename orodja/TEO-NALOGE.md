# Teove naloge (samodejno delo v oblaku)

Ura za uro se zažene seja, ki dela namesto Teota. V aplikaciji je vse videti, kot da je delo opravil Teo.

## Postopek
1. `node orodja/teo-naloge.mjs seznam` vrne odprte naloge za Teota (`za` = njegov e-naslov) in za Vse (`za` = "vsi").
2. Vzemi nalogo, ki je dodeljena Teotu. Nalogo pod "vsi" vzemi samo, če iz besedila jasno izhaja, da je mišljena za Teota
   (omenja Teota, aplikacije, kodo, splet, Nakupko, Fixko, Byurska Studio, tehnične stvari ...). Kar je očitno za Urško ali Nives, pusti pri miru.
3. Nalogo naredi do konca. Potem `node orodja/teo-naloge.mjs opravljeno <mapa> <id> "kratek opis, kaj je narejeno in kje je rezultat"`.
   Datoteke (videi, slike, PDF), ki jih naloga zahteva v aplikaciji, naloži z
   `node orodja/teo-naloge.mjs nalozi <mapa> urejeno|surovo <datoteka>` (urejeno = končna vsebina, surovo = surovi material).
   Videe lahko narediš z ffmpeg (namesti z apt, če ga ni): npr. 9:16, 1080x1920, besedilo, slike, glasba brez avtorskih pravic ni nujna.
   Vsebino o projektih najdeš v javnih repozitorijih (remako.si: github.com/repusicurska-dot/remako-si, Popravko: github.com/myedgeofficial/fixko).
4. Nalogo, ki je ni mogoče narediti samodejno, označi z `node orodja/teo-naloge.mjs preskoci <mapa> <id>`, da se ne ponavlja. Ostane odprta za Teota.

## Kaj se ne dela samodejno (preskoči)
- Prijave v tuje račune kot Teo: AJPES, banka, urad, e-uprava, Apple/Google konzole, družbena omrežja.
- Plačila, nakupi, pogodbe, podpisi, pošiljanje sporočil ali e-pošte ljudem.
- Fizične stvari (kupi, pojdi, pokliči) in vse, kar zahteva Teotovo osebno odločitev.
- Brisanje podatkov ali karkoli, česar ni mogoče razveljaviti.

## Pravila
- Opis (porocilo) piši v slovenščini, kratko (do ~1000 znakov), kaj je narejeno in kje: povezava do PR, datoteke ali spletne strani.
  Ne omenjaj Claude ali umetne inteligence. Ne trdi stvari, ki se niso zgodile.
- Koda: delaj v repozitorijih myedgeofficial, na novi veji in odpri PR (ne združuj v main sam).
  NIKOLI ne odpiraj repozitorijev Sentinel, my-edge-platform ali Sentinel-Desktop.
- Naloga je opravljena samo, če je res narejena. Če je narejeno le delno, jo pusti odprto in v opis napiši, kaj manjka (ukaz opravljeno uporabi šele na koncu).
- Na eno zagon največ 3 naloge.
