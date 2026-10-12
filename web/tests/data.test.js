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
