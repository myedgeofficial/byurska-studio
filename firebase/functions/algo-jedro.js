// REMAKO Algo Lab (banka.remako.si): preverjanje dogodkov iz MT5 in izračun povzetkov.
// Čista logika brez Firebasea, da jo testi preverijo neposredno (test/algo.test.js).
// Pogodba je ista kot v kitu remako-mt5 (bridge/api.py, docs/API.md): shema v1, ključi po vlogah,
// idempotentni paketi, konflikt ob spremenjenem poslu, ločeni povzetki po valuti in okolju.
import crypto from "node:crypto";

export const NAJVEC_TELO = 512 * 1024;
export const NAJVEC_PAKET = 50;
export const ID = /^[A-Za-z0-9_-]{1,40}$/;
const EVENT_ID = /^[A-Za-z0-9_:.-]{1,192}$/;
const VRSTE = new Set(["started", "stopped", "heartbeat", "signal", "decision", "order_request", "order_result",
  "close_request", "close_result", "deal", "daily_stop", "operator_pause"]);
const POLJA = ["schema_version", "event_id", "event_type", "event_time_utc", "bot_id", "account_alias", "account_fingerprint",
  "environment", "mode", "strategy_id", "strategy_version", "symbol", "timeframe", "data"];
const PREPOVEDANO = new Set(["password", "token", "api_key", "authorization", "secret", "otp", "login"]);
const ENTRY = new Set(["DEAL_ENTRY_IN", "DEAL_ENTRY_OUT", "DEAL_ENTRY_INOUT", "DEAL_ENTRY_OUT_BY"]);

export class Neveljavno extends Error {}
export class Prepovedano extends Error {}
export class Konflikt extends Error {}

// Kanonični JSON (urejeni ključi), kot canonical() v api.py.
export function kanonicno(v) {
  if (Array.isArray(v)) return "[" + v.map(kanonicno).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + kanonicno(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
export const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const koncno = (v) => typeof v === "number" && Number.isFinite(v);
const nIzpolnjen = (cond, sporocilo) => { if (!cond) throw new Neveljavno(sporocilo); };

export function casUtc(v) {
  nIzpolnjen(typeof v === "string" && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|\+00:00)$/.test(v), "event_time_utc must be UTC");
  const t = Date.parse(v.replace("+00:00", "Z"));
  nIzpolnjen(Number.isFinite(t), "Invalid event timestamp");
  return t;
}

function drevo(v, globina = 0) {
  nIzpolnjen(globina <= 5, "Payload is too deeply nested");
  if (Array.isArray(v)) {
    nIzpolnjen(v.length <= 64, "Too many values");
    for (const x of v) drevo(x, globina + 1);
  } else if (v && typeof v === "object") {
    const k = Object.keys(v);
    nIzpolnjen(k.length <= 64, "Too many fields");
    for (const ime of k) {
      nIzpolnjen(ime.length <= 64, "Invalid payload key");
      nIzpolnjen(!PREPOVEDANO.has(ime.toLowerCase()), "Credential fields are forbidden");
      drevo(v[ime], globina + 1);
    }
  } else if (typeof v === "string") {
    nIzpolnjen(v.length <= 4096 && ![...v].some((c) => c.charCodeAt(0) < 32 && !"\r\n\t".includes(c)), "Invalid payload text");
  } else nIzpolnjen(v === null || typeof v === "boolean" || koncno(v), "Invalid payload value");
}

export function preveriDogodek(e, dovoljeniBoti) {
  nIzpolnjen(e && typeof e === "object" && !Array.isArray(e), "Event fields do not match schema v1");
  const k = Object.keys(e);
  nIzpolnjen(k.length === POLJA.length && POLJA.every((p) => k.includes(p)), "Event fields do not match schema v1");
  nIzpolnjen(e.schema_version === 1, "Unsupported schema version");
  for (const p of ["bot_id", "account_alias", "strategy_id", "strategy_version"]) nIzpolnjen(typeof e[p] === "string" && ID.test(e[p]), `Invalid ${p}`);
  if (!dovoljeniBoti.includes(e.bot_id)) throw new Prepovedano("Bot not authorized for this key");
  nIzpolnjen(typeof e.event_id === "string" && EVENT_ID.test(e.event_id), "Invalid event id");
  nIzpolnjen(typeof e.account_fingerprint === "string" && /^[0-9A-F]{8}$/.test(e.account_fingerprint), "Invalid account fingerprint");
  nIzpolnjen(VRSTE.has(e.event_type) && ["SHADOW", "DEMO", "LIVE"].includes(e.mode) && ["tester", "terminal"].includes(e.environment), "Invalid event kind, mode or environment");
  casUtc(e.event_time_utc);
  for (const p of ["symbol", "timeframe"]) nIzpolnjen(typeof e[p] === "string" && e[p].length > 0 && e[p].length <= 64, `Invalid ${p}`);
  nIzpolnjen(e.data && typeof e.data === "object" && !Array.isArray(e.data), "data must be an object");
  drevo(e.data);
  nIzpolnjen(Buffer.byteLength(kanonicno(e)) <= 16384, "Event exceeds 16 KiB");
  if (e.event_type !== "deal") return;
  const d = e.data;
  for (const p of ["deal_ticket", "order_ticket", "position_id"]) nIzpolnjen(typeof d[p] === "string" && /^[0-9]{1,20}$/.test(d[p]), "Deal identifiers must be decimal strings");
  for (const p of ["price", "volume", "profit", "commission", "swap", "fee", "net"]) nIzpolnjen(koncno(d[p]), "Deal financial fields must be finite numbers");
  nIzpolnjen(d.price > 0 && d.volume > 0, "Invalid execution size or price");
  nIzpolnjen(Math.abs(d.net - (d.profit + d.commission + d.swap + d.fee)) <= 0.000001, "Net does not reconcile with broker components");
  nIzpolnjen(ENTRY.has(d.entry) && ["BUY", "SELL"].includes(d.side), "Invalid execution side or entry type");
  nIzpolnjen(typeof d.currency === "string" && /^[A-Z0-9]{3,10}$/.test(d.currency), "Invalid account currency");
  nIzpolnjen(Number.isSafeInteger(d.deal_time_server_msc) && d.deal_time_server_msc >= 0, "Invalid broker execution time");
}

// Telo zahteve POST /v1/events → seznam dogodkov (ali napaka Neveljavno / Prepovedano).
export function preberiPaket(surovo, dovoljeniBoti) {
  let p;
  try { p = JSON.parse(Buffer.isBuffer(surovo) ? surovo.toString("utf8") : surovo); } catch { throw new Neveljavno("Invalid JSON"); }
  nIzpolnjen(p && typeof p === "object" && !Array.isArray(p) && Object.keys(p).length === 1 && Array.isArray(p.events)
    && p.events.length >= 1 && p.events.length <= NAJVEC_PAKET, "Use an events array containing 1 to 50 events");
  for (const e of p.events) preveriDogodek(e, dovoljeniBoti);
  return p.events;
}

// Prstni odtis za idempotenco. Pri poslu šteje samo borzno dejstvo: ponovni uvoz iz zgodovine ima nov čas opazovanja
// in morda drugačne oznake, a isti posel. Spremenjen znesek pod istim ID-jem je konflikt, nikoli tiho prepisan.
export function odtis(e) {
  if (e.event_type !== "deal") return sha256(kanonicno(e));
  const m = Object.fromEntries(["bot_id", "account_fingerprint", "symbol", "environment", "event_type"].map((k) => [k, e[k]]));
  m.data = Object.fromEntries(Object.entries(e.data).filter(([k]) => k !== "history_replay" && k !== "strategy_attribution"));
  return sha256(kanonicno(m));
}

// Ključi iz okolja (ALGO_KLJUCI): "ime:vloga:bot1+bot2:sha256;...". Samo prstni odtisi, žetonov strežnik ne pozna.
export function preberiKljuce(niz) {
  const kljuci = String(niz || "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [ime, vloga, boti, sha] = x.split(":");
    return { ime, vloga, boti: (boti || "").split("+").filter(Boolean), sha256: (sha || "").toLowerCase() };
  });
  const videni = new Set();
  for (const k of kljuci) {
    if (!["ingest", "read"].includes(k.vloga) || !/^[a-f0-9]{64}$/.test(k.sha256) || !k.boti.length || k.boti.some((b) => !ID.test(b)) || videni.has(k.sha256))
      throw new Error("Neveljavna nastavitev ključev ALGO_KLJUCI");
    videni.add(k.sha256);
  }
  return kljuci;
}

export function avtoriziraj(glava, vloga, kljuci) {
  if (typeof glava !== "string" || !glava.startsWith("Bearer ")) return null;
  const zeton = glava.slice(7);
  if (zeton.length < 32 || zeton.length > 256) return null;
  const odt = Buffer.from(sha256(zeton), "hex");
  let najden = null;
  for (const k of kljuci) if (crypto.timingSafeEqual(odt, Buffer.from(k.sha256, "hex")) && k.vloga === vloga) najden = k;
  return najden;
}

// Besedilo, ki bi ga Excel izvedel kot formulo, dobi spredaj apostrof.
export const csvVarno = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v.trimStart()) ? "'" + v : v);
const csvCelica = (v) => { const s = v == null ? "" : String(csvVarno(v)); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const CSV_STOLPCI = ["seq", "bot_id", "account_fingerprint", "mode", "environment", "symbol", "strategy_id", "strategy_version",
  "deal_ticket", "order_ticket", "position_id", "deal_time_server_msc", "entry", "side", "volume", "price",
  "profit", "commission", "swap", "fee", "net", "currency"];
export function csvPoslov(vrstice) {
  const izhod = [CSV_STOLPCI.join(",")];
  for (const { seq, event: e } of vrstice) {
    const v = { ...e, ...e.data, seq };
    izhod.push(CSV_STOLPCI.map((k) => csvCelica(v[k])).join(","));
  }
  return izhod.join("\r\n") + "\r\n";
}

// Svežina srčnega utripa: največ 120 s star in ne več kot 5 s v prihodnosti. Star utrip, ki pride pozno, ostane »offline«.
export function stanjeBota(utrip, zdaj = Date.now()) {
  if (!utrip) return { stanje: "ni_povezave", svez: false };
  const starost = (zdaj - casUtc(utrip.event_time_utc)) / 1000;
  const svez = starost >= -5 && starost <= 120;
  const d = utrip.data || {};
  const povezan = svez && d.connected === true;
  const trguje = povezan && d.trading_authorized === true && !d.paused && !d.halted && !d.daily_stop;
  return { stanje: !svez ? "offline" : !povezan ? "brez_povezave_z_borzo" : utrip.mode, svez, povezan, trguje, starost_s: Math.round(starost) };
}

const r6 = (x) => Math.round(x * 1e6) / 1e6;

// Pozicije iz dejanskih poslov (position_id, vstop/izstop, prave količine). Posel ni trejd; zaključen trejd je šele
// pozicija, ki se je odprla in v celoti zaprla. Delni izstopi so del iste pozicije; obrat (INOUT/OUT_BY), manjkajoč
// vstop (zgodovina se začne sredi pozicije) in mešano lastništvo so označeni in izključeni iz uspešnosti.
export function pozicije(posli) {
  const skupine = new Map();
  for (const e of posli) {
    const d = e.data;
    const k = [e.bot_id, e.account_fingerprint, e.environment, e.mode, d.currency, e.symbol, d.position_id].join("|");
    if (!skupine.has(k)) skupine.set(k, []);
    skupine.get(k).push(e);
  }
  const izid = [];
  for (const seznam of skupine.values()) {
    seznam.sort((a, b) => a.data.deal_time_server_msc - b.data.deal_time_server_msc || (BigInt(a.data.deal_ticket) < BigInt(b.data.deal_ticket) ? -1 : 1));
    const prvi = seznam[0], d0 = prvi.data;
    const vstopi = seznam.filter((e) => e.data.entry === "DEAL_ENTRY_IN");
    const p = {
      bot_id: prvi.bot_id, account_fingerprint: prvi.account_fingerprint, environment: prvi.environment, mode: prvi.mode, currency: d0.currency,
      symbol: prvi.symbol, position_id: d0.position_id,
      // Pripis strategiji je vedno z vstopa; brez vstopa ostane neznan, nikoli trenutna verzija.
      strategy_id: vstopi[0]?.strategy_id || "unattributed", strategy_version: vstopi[0]?.strategy_version || "unknown",
      smer: vstopi[0]?.data.side || null, posli: seznam.length, volumen_vstop: 0, volumen_izstop: 0,
      odprto_msc: vstopi[0]?.data.deal_time_server_msc ?? null, zaprto_msc: null, trajanje_s: null,
      profit: 0, commission: 0, swap: 0, fee: 0, net: 0, status: "odprta",
    };
    let odprto = 0, obrat = false, mesano = false;
    for (const e of seznam) {
      const d = e.data;
      for (const x of ["profit", "commission", "swap", "fee", "net"]) p[x] = r6(p[x] + d[x]);
      if (d.ownership === "mixed") mesano = true;
      if (d.entry === "DEAL_ENTRY_IN") { odprto = r6(odprto + d.volume); p.volumen_vstop = r6(p.volumen_vstop + d.volume); }
      else if (d.entry === "DEAL_ENTRY_OUT") { odprto = r6(odprto - d.volume); p.volumen_izstop = r6(p.volumen_izstop + d.volume); if (odprto <= 1e-9) p.zaprto_msc = d.deal_time_server_msc; }
      else obrat = true;
    }
    if (mesano) p.status = "mesano";
    else if (obrat) p.status = "preveri_obrat";
    else if (!vstopi.length || odprto < -1e-9) p.status = "brez_vstopa";
    else if (Math.abs(odprto) <= 1e-9 && p.volumen_izstop > 0) {
      p.status = "zaprta";
      p.trajanje_s = Math.round((p.zaprto_msc - p.odprto_msc) / 1000);
    } else if (p.volumen_izstop > 0) p.status = "delno_zaprta";
    p.odprt_volumen = r6(Math.max(odprto, 0));
    // Za analizo: razlog zadnjega izstopa (SL/TP/EA) in ura/dan vstopa po strežniškem času borze.
    const izstopi = seznam.filter((e) => e.data.entry === "DEAL_ENTRY_OUT");
    p.izhod_razlog = izstopi.length ? String(izstopi[izstopi.length - 1].data.reason || "").replace("DEAL_REASON_", "") || null : null;
    if (p.odprto_msc != null) { const t = new Date(p.odprto_msc); p.ura = t.getUTCHours(); p.dan = (t.getUTCDay() + 6) % 7; }
    izid.push(p);
  }
  return izid.sort((a, b) => (b.zaprto_msc ?? b.odprto_msc ?? 0) - (a.zaprto_msc ?? a.odprto_msc ?? 0));
}

// Povzetek: skupine se nikoli ne seštevajo čez valuto, račun, način ali okolje (tester ≠ terminal).
export function povzetek(posli, utripi = [], zdaj = Date.now()) {
  const skupine = new Map(), poVerzijah = new Map();
  let mesanih = 0;
  for (const e of posli) {
    const d = e.data;
    if (d.ownership === "mixed") { mesanih++; continue; }
    const k = [e.bot_id, e.account_fingerprint, e.environment, e.mode, d.currency].join("|");
    if (!skupine.has(k)) skupine.set(k, { bot_id: e.bot_id, account_fingerprint: e.account_fingerprint, environment: e.environment, mode: e.mode, currency: d.currency,
      execution_count: 0, profit: 0, commission: 0, swap: 0, fee: 0, realized_deal_net: 0 });
    const g = skupine.get(k);
    g.execution_count++;
    for (const x of ["profit", "commission", "swap", "fee"]) g[x] = r6(g[x] + d[x]);
    g.realized_deal_net = r6(g.realized_deal_net + d.net);
  }
  const poz = pozicije(posli);
  for (const g of skupine.values()) Object.assign(g, { zaprte: 0, dobicki: 0, izgube: 0, odprte: 0, izkljucene: 0 });
  for (const p of poz) {
    const g = skupine.get([p.bot_id, p.account_fingerprint, p.environment, p.mode, p.currency].join("|"));
    if (!g) continue; // samo mešane pozicije
    if (p.status === "zaprta") { g.zaprte++; if (p.net > 0) g.dobicki++; else if (p.net < 0) g.izgube++; }
    else if (p.status === "odprta" || p.status === "delno_zaprta") g.odprte++;
    else g.izkljucene++;
    if (p.status !== "zaprta") continue;
    const kv = [p.bot_id, p.environment, p.mode, p.currency, p.strategy_id, p.strategy_version].join("|");
    if (!poVerzijah.has(kv)) poVerzijah.set(kv, { bot_id: p.bot_id, environment: p.environment, mode: p.mode, currency: p.currency, strategy_id: p.strategy_id, strategy_version: p.strategy_version, zaprte: 0, dobicki: 0, net: 0 });
    const v = poVerzijah.get(kv);
    v.zaprte++; if (p.net > 0) v.dobicki++; v.net = r6(v.net + p.net);
  }
  return {
    as_of_utc: new Date(zdaj).toISOString().replace(/\.\d{3}Z$/, "Z"),
    groups: [...skupine.values()], po_verzijah: [...poVerzijah.values()],
    bots: utripi.map((e) => ({ bot_id: e.bot_id, account_fingerprint: e.account_fingerprint, environment: e.environment, mode: e.mode, data: e.data,
      event_time_utc: e.event_time_utc, fresh: stanjeBota(e, zdaj).svez, age_seconds: stanjeBota(e, zdaj).starost_s })),
    excluded_mixed_execution_count: mesanih,
    pozicije: poz.slice(0, 300), pozicij_skupaj: poz.length,
    metric_note: "Execution counts are fills, not closed trades. P&L excludes unallocated account-level charges. Groups are never combined across currency, account, mode or tester/live environment.",
  };
}

// Označene sintetične preizkusne vrednosti (kopija examples/events.json iz kita, z ločenim botom).
// Uporablja jih samo »Preizkus povezave« in vedno v ločeni zbirki algo-test-*.
export function sinteticniPaket() {
  const osnova = { schema_version: 1, event_time_utc: "2026-10-26T00:00:00Z", bot_id: "sinteticni-test", account_alias: "synthetic-only",
    account_fingerprint: "00000001", environment: "tester", mode: "DEMO", strategy_id: "ema-example", strategy_version: "v1", symbol: "SYNTHETIC-MNQ", timeframe: "PERIOD_M5" };
  const posel = (n, entry, side, price, profit, msc) => ({ ...osnova, event_id: `sinteticni-test:00000001:deal:${n}`, event_type: "deal",
    data: { deal_ticket: String(n), order_ticket: String(10 + n), position_id: "99", deal_time_server_msc: msc, entry, side, volume: 1, price,
      profit, commission: -0.5, swap: 0, fee: -0.25, net: profit - 0.75, currency: "USD", history_replay: true, ownership: "bot", sl: 21990, tp: 22010, reason: "DEAL_REASON_EXPERT" } });
  return [posel(1, "DEAL_ENTRY_IN", "BUY", 22000, 0, 1792972860000), posel(2, "DEAL_ENTRY_OUT", "SELL", 22010, 20, 1792972920000)];
}
