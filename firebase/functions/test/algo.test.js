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
