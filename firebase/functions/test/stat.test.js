// Statistika strani: viri obiska, naprave, države, poti in naročnine (brez baze). Zaženi: node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { vir, naprava, drzava, pot, mesecno, narocnine, dnevniZapis, BOT } from "../stat-jedro.js";

test("viri obiska", () => {
  assert.deepEqual(vir("https://www.google.si/", "", "remako.si"), ["Iskalniki", "Google"]);
  assert.deepEqual(vir("https://gemini.google.com/app", "", "remako.si"), ["AI", "Gemini"]);
  assert.deepEqual(vir("", "chatgpt.com", "www.myedgeofficial.com"), ["AI", "ChatGPT"]);
  assert.deepEqual(vir("https://www.perplexity.ai/search", "", "nakupko.com"), ["AI", "Perplexity"]);
  assert.deepEqual(vir("https://t.co/abc", "", "remako.si"), ["Družbena omrežja", "X"]);
  assert.deepEqual(vir("https://l.instagram.com/", "", "remako.si"), ["Družbena omrežja", "Instagram"]);
  assert.deepEqual(vir("https://www.microsoft.com/", "", "remako.si"), ["Drugo", "microsoft.com"]);
  assert.deepEqual(vir("", "", "remako.si"), ["Neposredno", "Neposredno"]);
  assert.equal(vir("https://www.remako.si/pogoji", "", "remako.si"), null);
});

test("naprave in roboti", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  assert.deepEqual(naprava(iphone, 390), { tip: "Telefon", os: "iOS", brskalnik: "Safari" });
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0";
  assert.deepEqual(naprava(win, 5120), { tip: "Računalnik", os: "Windows", brskalnik: "Edge" });
  assert.ok(BOT.test("Mozilla/5.0 (compatible; Googlebot/2.1)"));
  assert.ok(!BOT.test(iphone));
});

test("države in poti", () => {
  assert.equal(drzava("Europe/Ljubljana", "en-US"), "SI");
  assert.equal(drzava("America/Indiana/Indianapolis", ""), "US");
  assert.equal(drzava("", "de-AT"), "AT");
  assert.equal(drzava("", "sl"), "?");
  assert.equal(pot("/Sentinel/?x=1#a"), "/sentinel");
  assert.equal(pot(""), "/");
});

test("MRR in naročnine", () => {
  assert.equal(mesecno({ unit_amount: 1200, recurring: { interval: "year", interval_count: 1 } }), 100);
  assert.equal(mesecno({ unit_amount: 4900, recurring: { interval: "month", interval_count: 1 } }, 2), 9800);
  const cena = { currency: "eur", product: "prod_1", unit_amount: 4900, recurring: { interval: "month", interval_count: 1 } };
  const s = narocnine([
    { status: "active", created: 1790000000, items: { data: [{ price: cena, quantity: 1 }] } },
    { status: "trialing", created: 1790000000, items: { data: [{ price: cena, quantity: 1 }] } },
    { status: "canceled", created: 1780000000, canceled_at: 1790000000, items: { data: [{ price: cena, quantity: 1 }] } },
  ], () => "Sentinel");
  assert.equal(s.aktivne, 1);
  assert.equal(s.preizkus, 1);
  assert.deepEqual(s.mrr, { EUR: 4900 });
  assert.equal(s.poIzdelku.Sentinel.aktivne, 2);
  assert.equal(Object.values(s.preklicaneNaDan).reduce((a, b) => a + b, 0), 1);
});

test("dnevni zapis obdrži samo vrh", () => {
  const poti = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ["/p" + i, i]));
  const z = dnevniZapis({ ogledi: 5, obiskovalci: 3, odboji: 1, poti });
  assert.equal(Object.keys(z.poti).length, 20);
  assert.equal(z.poti["/p49"], 49);
  assert.equal(dnevniZapis({ ogledi: 5, poti }, false).poti, undefined);
});
