import { test } from "node:test";
import assert from "node:assert/strict";
import { drevo, ZACETNE_MAPE, dan, opomnikiZa, opisOpomnikov, platformeIme, vrstaDatoteke, velikost } from "../src/data.js";

test("drevo kot na skici", () => {
  const d = drevo(ZACETNE_MAPE);
  assert.deepEqual(d.map((g) => g.ime), ["Byurska.com", "Apps"]);
  assert.equal(d[0].otroci.length, 5);
  assert.deepEqual(d[1].otroci.map((m) => m.ime), ["Nakupko", "Manifest", "Sentinel"]);
});

test("dan", () => {
  const zdaj = new Date(2026, 9, 12, 10).getTime();
  assert.equal(dan(new Date(2026, 9, 12, 20).getTime(), zdaj), "danes");
  assert.equal(dan(new Date(2026, 9, 13, 8).getTime(), zdaj), "jutri");
  assert.equal(dan(new Date(2026, 9, 14, 8).getTime(), zdaj), "pojutrišnjem");
  assert.equal(dan(new Date(2026, 9, 16, 8).getTime(), zdaj), "pet 16. 10.");
});

test("opomniki dva dni in dan prej ob 9:00 ter ob uri objave", () => {
  const zdaj = new Date(2026, 9, 12, 10).getTime();
  const o = { id: "x", kdaj: new Date(2026, 9, 16, 18, 0).getTime(), platforme: ["ig", "tiktok"] };
  const r = opomnikiZa(o, "Nakupko", zdaj);
  assert.deepEqual(r.map((x) => new Date(x.kdaj).toString()), [
    new Date(2026, 9, 14, 9).toString(), new Date(2026, 9, 15, 9).toString(), new Date(2026, 9, 16, 18).toString()
  ]);
  assert.equal(r[1].naslov, "Jutri objava");
  assert.match(r[0].besedilo, /^Nakupko na Instagram \+ TikTok, pojutrišnjem ob 18:00/);
  assert.deepEqual(opomnikiZa({ ...o, objavljeno: true }, "N", zdaj), []);
  // pretekli opomniki se ne nastavijo
  assert.equal(opomnikiZa(o, "N", new Date(2026, 9, 15, 12).getTime()).length, 1);
});

test("lastne nastavitve opomnikov", () => {
  const zdaj = new Date(2026, 9, 12, 10).getTime();
  const o = { id: "x", kdaj: new Date(2026, 9, 16, 18, 0).getTime(), platforme: ["ig"] };
  const r = opomnikiZa(o, "Nakupko", zdaj, { dni: [3, 0], ura: "20:30", uroPrej: true, obUri: false });
  assert.deepEqual(r.map((x) => new Date(x.kdaj).toString()), [
    new Date(2026, 9, 13, 20, 30).toString(), new Date(2026, 9, 16, 17).toString()
  ]); // na dan ob 20:30 je po objavi, zato ga ni
  assert.equal(opisOpomnikov({ dni: [1, 3], ura: "08:00", uroPrej: true, obUri: true }), "3 dni prej, 1 dan prej ob 08:00, 1 uro prej, ob uri objave");
  assert.deepEqual(opomnikiZa(o, "N", zdaj, { dni: [], uroPrej: false, obUri: false }), []);
});

test("pomožne", () => {
  assert.equal(platformeIme(["tiktok"]), "TikTok");
  assert.equal(vrstaDatoteke("video/quicktime", "a.mov"), "video");
  assert.equal(vrstaDatoteke("", "IMG_1.HEIC"), "slika");
  assert.equal(velikost(25 * 1024 * 1024), "25 MB");
});

test("nujnost: 2 dni prej oranžno, 1 dan prej in zamuda rdeče, objavljeno nič", async () => {
  const { nujnost } = await import("../src/data.js");
  const zdaj = new Date(2026, 9, 12, 10, 0).getTime();
  const ob = (d, h = 18) => new Date(2026, 9, 12 + d, h, 0).getTime();
  assert.equal(nujnost({ kdaj: ob(3) }, zdaj), "");
  assert.equal(nujnost({ kdaj: ob(2, 23) }, zdaj), "oranzna");
  assert.equal(nujnost({ kdaj: ob(1, 0) }, zdaj), "rdeca");
  assert.equal(nujnost({ kdaj: ob(0) }, zdaj), "rdeca");
  assert.equal(nujnost({ kdaj: ob(-1) }, zdaj), "rdeca");
  assert.equal(nujnost({ kdaj: ob(1), objavljeno: true }, zdaj), "");
});

test("znesek in evri", async () => {
  const { znesek, evri } = await import("../src/data.js");
  assert.equal(znesek("12,50"), 12.5);
  assert.equal(znesek("12.5 €"), 12.5);
  assert.equal(znesek("1.200,00"), 1200);
  assert.equal(znesek("1.200"), 1200);
  assert.equal(znesek(""), 0);
  assert.equal(znesek("abc"), 0);
  assert.equal(evri(1200.5), "1.200,50 €");
  assert.equal(evri(3), "3,00 €");
});

test("kratkoIme in stevilo", async () => {
  const { kratkoIme, stevilo } = await import("../src/data.js");
  assert.deepEqual(kratkoIme("Spiritualitybyurska.com"), { ime: "Spirituality", pod: "byurska.com" });
  assert.equal(kratkoIme("Poetryburska.com").ime, "Poetry");
  assert.deepEqual(kratkoIme("Nakupko"), { ime: "Nakupko", pod: "" });
  assert.deepEqual(kratkoIme("Byurska.com"), { ime: "Byurska.com", pod: "" });
  const N = ["naloga", "nalogi", "naloge", "nalog"];
  assert.equal(stevilo(1, N), "1 naloga"); assert.equal(stevilo(2, N), "2 nalogi");
  assert.equal(stevilo(4, N), "4 naloge"); assert.equal(stevilo(5, N), "5 nalog"); assert.equal(stevilo(101, N), "101 naloga");
});

test("ics za koledar na računalniku", async () => {
  const { ics } = await import("../src/data.js");
  const t = ics({ uid: "a1", naslov: "Objava: Nakupko, IG", opis: "vrstica 1\nvrstica 2", zacetek: Date.UTC(2026, 9, 14, 16, 30), alarmi: [2880, 0, 0] });
  assert.match(t, /DTSTART:20261014T163000Z\r\n/);
  assert.match(t, /SUMMARY:Objava: Nakupko\\, IG\r\n/);
  assert.match(t, /DESCRIPTION:vrstica 1\\nvrstica 2\r\n/);
  assert.equal((t.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.match(t, /TRIGGER:-PT2880M/);
});

test("barve članov in komu je naloga", async () => {
  const { barvaClana, nalogaZa } = await import("../src/data.js");
  assert.equal(barvaClana("teo.simonic7@gmail.com"), "#39ff14");
  assert.equal(barvaClana("Nives.Ploj@gmail.com"), "#2e7cf6");
  assert.equal(barvaClana("nekdo@x.si"), "#98a2b3");
  assert.equal(nalogaZa({ za: "nives.ploj@gmail.com" }, "teo.simonic7@gmail.com"), false);
  assert.equal(nalogaZa({ za: "nives.ploj@gmail.com" }, "nives.ploj@gmail.com"), true);
  assert.equal(nalogaZa({ za: "" }, "teo.simonic7@gmail.com"), true);
  assert.equal(nalogaZa({}, "teo.simonic7@gmail.com"), true);
});
