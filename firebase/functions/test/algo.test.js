// Algo Lab: preverjanje dogodkov, ključev, CSV in povzetkov (brez baze). Zaženi: node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { preberiPaket, preveriDogodek, odtis, preberiKljuce, avtoriziraj, csvPoslov, csvVarno, povzetek, pozicije, stanjeBota, sha256,
  sinteticniPaket, Neveljavno, Prepovedano } from "../algo-jedro.js";

const BOTI = ["sinteticni-test"];
const [vstop, izstop] = sinteticniPaket();
const kopija = (e, sprememba = {}, data = {}) => ({ ...structuredClone(e), ...sprememba, data: { ...structuredClone(e.data), ...data } });
const paket = (...ev) => JSON.stringify({ events: ev });

test("veljaven sintetični paket gre skozi", () => {
  assert.equal(preberiPaket(paket(vstop, izstop), BOTI).length, 2);
});

test("meje paketa: 1 do 50 dogodkov, nič dodatnih polj", () => {
  assert.throws(() => preberiPaket(paket(), BOTI), Neveljavno);
  assert.throws(() => preberiPaket(paket(...Array(51).fill(vstop)), BOTI), Neveljavno);
  assert.throws(() => preberiPaket(JSON.stringify({ events: [vstop], extra: 1 }), BOTI), Neveljavno);
  assert.throws(() => preberiPaket("{not json", BOTI), Neveljavno);
  assert.throws(() => preberiPaket(paket({ ...vstop, extra: 1 }), BOTI), Neveljavno);
});

test("ključ za enega bota ne more pisati za drugega", () => {
  assert.throws(() => preberiPaket(paket(kopija(vstop, { bot_id: "drug-bot" })), BOTI), Prepovedano);
});

test("gesla in žetoni v podatkih so prepovedani", () => {
  for (const k of ["password", "Token", "api_key", "secret", "otp", "login"]) assert.throws(() => preveriDogodek(kopija(vstop, {}, { [k]: "x" }), BOTI), Neveljavno);
});

test("posel: neto se mora ujemati s komponentami, ID-ji so decimalni nizi, čas UTC", () => {
  assert.throws(() => preveriDogodek(kopija(izstop, {}, { net: 20 }), BOTI), Neveljavno);
  assert.throws(() => preveriDogodek(kopija(izstop, {}, { deal_ticket: 2 }), BOTI), Neveljavno);
  assert.throws(() => preveriDogodek(kopija(izstop, {}, { volume: 0 }), BOTI), Neveljavno);
  assert.throws(() => preveriDogodek(kopija(izstop, { event_time_utc: "2026-10-26T02:00:00+02:00" }), BOTI), Neveljavno);
  assert.throws(() => preveriDogodek(kopija(izstop, { mode: "REAL" }), BOTI), Neveljavno);
  assert.throws(() => preveriDogodek(kopija(izstop, {}, { currency: "usd" }), BOTI), Neveljavno);
});

test("ponovni uvoz iz zgodovine ima isti odtis, spremenjen znesek pa drugačnega", () => {
  const ponovno = kopija(izstop, { event_time_utc: "2026-10-27T10:00:00Z", strategy_version: "v2" }, { history_replay: false });
  assert.equal(odtis(ponovno), odtis(izstop));
  assert.notEqual(odtis(kopija(izstop, {}, { profit: 25, net: 24.25 })), odtis(izstop));
  const utrip = kopija(vstop, { event_type: "heartbeat", event_id: "x:1" });
  assert.notEqual(odtis(utrip), odtis(kopija(utrip, { event_time_utc: "2026-10-26T00:00:01Z" })));
});

test("ključi: samo prstni odtisi, ločeni po vlogi", () => {
  const ingest = "i".repeat(64), read = "r".repeat(64);
  const kljuci = preberiKljuce(`relay:ingest:sinteticni-test:${sha256(ingest)};splet:read:sinteticni-test+drug:${sha256(read)}`);
  assert.equal(avtoriziraj("Bearer " + ingest, "ingest", kljuci).ime, "relay");
  assert.equal(avtoriziraj("Bearer " + ingest, "read", kljuci), null);
  assert.deepEqual(avtoriziraj("Bearer " + read, "read", kljuci).boti, ["sinteticni-test", "drug"]);
  assert.equal(avtoriziraj("Bearer kratek", "ingest", kljuci), null);
  assert.equal(avtoriziraj(undefined, "ingest", kljuci), null);
  assert.throws(() => preberiKljuce("a:admin:b:" + sha256("x")));
  assert.throws(() => preberiKljuce(`a:ingest:b:${sha256("x")};c:read:b:${sha256("x")}`));
});

test("CSV je zaščiten pred formulami", () => {
  for (const v of ["=1+1", "+x", "-x", "@x", " =x"]) assert.ok(String(csvVarno(v)).startsWith("'"));
  assert.equal(csvVarno(-0.5), -0.5);
  const csv = csvPoslov([{ seq: 1, event: kopija(izstop, { symbol: "=HYPERLINK(\"x\")" }) }]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});

test("star utrip ostane offline; svež brez povezave ali s premorom ne trguje", () => {
  const zdaj = Date.parse("2026-10-26T12:00:00Z");
  const u = (cas, data) => ({ ...vstop, event_type: "heartbeat", event_time_utc: cas, data });
  assert.equal(stanjeBota(null).stanje, "ni_povezave");
  assert.equal(stanjeBota(u("2026-10-26T11:57:00Z", { connected: true }), zdaj).stanje, "offline");
  assert.equal(stanjeBota(u("2026-10-26T12:00:30Z", { connected: true }), zdaj).svez, false);
  assert.equal(stanjeBota(u("2026-10-26T11:59:30Z", { connected: false }), zdaj).stanje, "brez_povezave_z_borzo");
  const s = stanjeBota(u("2026-10-26T11:59:30Z", { connected: true, trading_authorized: true, paused: true }), zdaj);
  assert.equal(s.stanje, "DEMO"); assert.equal(s.trguje, false);
  assert.equal(stanjeBota(u("2026-10-26T11:59:30Z", { connected: true, trading_authorized: true }), zdaj).trguje, true);
});

test("povzetek: 2 sintetična posla = 18,50 USD, ena zaključena pozicija", () => {
  const p = povzetek([vstop, izstop]);
  assert.equal(p.groups.length, 1);
  assert.equal(p.groups[0].realized_deal_net, 18.5);
  assert.equal(p.groups[0].execution_count, 2);
  assert.equal(p.groups[0].zaprte, 1);
  assert.equal(p.pozicije[0].status, "zaprta");
  assert.equal(p.pozicije[0].trajanje_s, 60);
});

test("valute, okolja in načini se nikoli ne seštejejo; mešano lastništvo je izključeno", () => {
  const eur = kopija(izstop, { event_id: "e:1" }, { currency: "EUR", deal_ticket: "3" });
  const zivo = kopija(izstop, { event_id: "e:2", environment: "terminal" }, { deal_ticket: "4" });
  const mesano = kopija(izstop, { event_id: "e:3" }, { ownership: "mixed", deal_ticket: "5" });
  const p = povzetek([vstop, izstop, eur, zivo, mesano]);
  assert.equal(p.groups.length, 3);
  assert.equal(p.excluded_mixed_execution_count, 1);
  assert.deepEqual(p.groups.map((g) => `${g.environment}/${g.currency}`).sort(), ["terminal/USD", "tester/EUR", "tester/USD"]);
});

test("pozicije: delni izstop, obrat, manjkajoč vstop in neznana strategija", () => {
  const del = (n, entry, vol, pos = "7") => kopija(n === 1 ? vstop : izstop, { event_id: `p:${pos}:${n}` },
    { entry, volume: vol, position_id: pos, deal_ticket: String(100 * Number(pos) + n), deal_time_server_msc: 1e12 + n * 1000, profit: 0, net: -0.75 });
  const delna = pozicije([del(1, "DEAL_ENTRY_IN", 2), del(2, "DEAL_ENTRY_OUT", 1)]);
  assert.equal(delna[0].status, "delno_zaprta"); assert.equal(delna[0].odprt_volumen, 1);
  const cela = pozicije([del(1, "DEAL_ENTRY_IN", 2), del(2, "DEAL_ENTRY_OUT", 1), del(3, "DEAL_ENTRY_OUT", 1)]);
  assert.equal(cela[0].status, "zaprta"); assert.equal(cela[0].posli, 3);
  assert.equal(pozicije([del(1, "DEAL_ENTRY_IN", 1), del(2, "DEAL_ENTRY_INOUT", 2)])[0].status, "preveri_obrat");
  const brez = pozicije([kopija(del(2, "DEAL_ENTRY_OUT", 1), { strategy_id: "unattributed", strategy_version: "unknown" })]);
  assert.equal(brez[0].status, "brez_vstopa"); assert.equal(brez[0].strategy_id, "unattributed");
  // Uspešnost šteje samo zaključene pozicije, ne poslov.
  const p = povzetek([del(1, "DEAL_ENTRY_IN", 2), del(2, "DEAL_ENTRY_OUT", 1)]);
  assert.equal(p.groups[0].execution_count, 2); assert.equal(p.groups[0].zaprte, 0); assert.equal(p.groups[0].odprte, 1);
});

// ---------- Samodejna analiza ----------
import { analiza, wilson, dnevniPovzetek, MIN_SKUPAJ } from "../algo-analiza.js";
const trejd = (i, { ura = 10, smer = "BUY", profit = 10, razlog = "TP", trajanje = 600 } = {}) => {
  const t0 = Date.UTC(2026, 9, 5 + Math.floor(i / 5), ura, 0, 0) + (i % 5) * 1000; // pon–pet
  const nasprotno = smer === "BUY" ? "SELL" : "BUY";
  const osnova = { ...vstop, event_id: `t:${i}:a` };
  return [kopija(osnova, {}, { position_id: String(1000 + i), deal_ticket: String(2 * i + 5000), side: smer, entry: "DEAL_ENTRY_IN", deal_time_server_msc: t0, profit: 0, commission: -0.5, fee: 0, net: -0.5, reason: "DEAL_REASON_EXPERT" }),
    kopija(osnova, { event_id: `t:${i}:b` }, { position_id: String(1000 + i), deal_ticket: String(2 * i + 5001), side: nasprotno, entry: "DEAL_ENTRY_OUT", deal_time_server_msc: t0 + trajanje * 1000, profit, commission: -0.5, fee: 0, net: profit - 0.5, reason: "DEAL_REASON_" + razlog })];
};

test("analiza: pod mejo vzorca samo opozorilo »premalo podatkov« z intervalom", () => {
  const a = analiza([...trejd(0), ...trejd(1, { profit: -8, razlog: "SL" })]);
  assert.equal(a.skupine[0].n, 2);
  assert.equal(a.skupine[0].predlogi.length, 1);
  assert.equal(a.skupine[0].predlogi[0].naslov, "Premalo podatkov");
  assert.deepEqual(wilson(1, 2), [0.09, 0.91]);
});

test("analiza: najde izgubljajočo stran, slabo uro, stroške in izgubo po stroških", () => {
  const posli = [];
  for (let i = 0; i < 40; i++) posli.push(...trejd(i, { smer: i % 2 ? "SELL" : "BUY", ura: i % 4 === 0 ? 15 : 10, profit: i % 2 ? -6 : 9, razlog: i % 2 ? "SL" : "TP" }));
  const g = analiza(posli).skupine[0];
  assert.equal(g.n, 40); assert.ok(g.n >= MIN_SKUPAJ);
  assert.equal(g.uspesnost, 0.5);
  const naslovi = g.predlogi.map((p) => p.naslov);
  assert.ok(naslovi.includes("SELL stran izgublja"), naslovi.join(" | "));
  assert.equal(g.po_smeri.find((x) => x.k === "BUY").n, 20);
  // vsi trejdi izgubljajo → opozorilo
  const slabo = []; for (let i = 0; i < 35; i++) slabo.push(...trejd(i, { profit: -3, razlog: "SL" }));
  const gs = analiza(slabo).skupine[0];
  assert.ok(gs.predlogi.some((p) => p.naslov === "Strategija po stroških izgublja"));
  assert.ok(gs.predlogi.some((p) => p.naslov === "Večina trejdov konča na stopu"));
  assert.ok(gs.predlogi.some((p) => p.naslov === "Dolg niz izgub"));
  // stroški pojedo dobiček
  const drago = []; for (let i = 0; i < 35; i++) drago.push(...trejd(i, { profit: 2 }));
  assert.ok(analiza(drago).skupine[0].predlogi.some((p) => p.naslov === "Stroški pojedo velik del dobička"));
});

test("analiza: zavrnitve EA in SHADOW signali brez poslov", () => {
  const dan = new Date().toISOString().slice(0, 10);
  const a = analiza([], [{ bot_id: "b", environment: "terminal", dan, signali: 20, kode: { spread_or_tick_size: 8, shadow_would_send: 12 } }]);
  assert.equal(a.skupine.length, 0);
  assert.equal(a.odlocitve[0].shadow_bi_poslal, 12);
  assert.equal(a.odlocitve[0].zavrnjenih, 8);
  assert.equal(a.odlocitve[0].predlogi[0].raven, "opozorilo");
  assert.match(a.odlocitve[0].predlogi[0].naslov, /40 % signalov/);
  // starejše od 30 dni ne šteje
  assert.equal(analiza([], [{ bot_id: "b", environment: "terminal", dan: "2020-01-01", signali: 5, kode: {} }]).odlocitve.length, 0);
});

test("dnevni povzetek šteje samo pozicije, zaprte tisti dan", () => {
  const posli = [...trejd(0), ...trejd(7)];
  const dan = new Date(Date.UTC(2026, 9, 5, 10, 10)).toISOString().slice(0, 10);
  assert.equal(dnevniPovzetek(posli, dan)[0].n, 1);
});
