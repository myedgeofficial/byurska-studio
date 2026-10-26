// REMAKO Algo Lab (banka.remako.si): sprejem dogodkov iz MT5 (relay na Teovem računalniku) in branje za strežnike.
// Samo nadzor: ni končne točke za naročila, vklop LIVE ali spremembo strategije. Brskalnik bere neposredno iz baze
// (pravila: samo Teo in Tim z Google prijavo in kodo 2FA); ključi za MT5 so samo prstni odtisi v ALGO_KLJUCI.
//   POST /v1/events        ključ »ingest« za izbrane bote; atomičen paket 1–50 dogodkov, idempotenten, 409 ob spremenjenem poslu
//   GET  /v1/events        ključ »read«; ?after=seq&limit=1..1000&bot_id=
//   GET  /v1/summary       ključ »read«; skupine po botu, računu, okolju, načinu in valuti
//   GET  /v1/deals.csv     ključ »read«; posli (fills), zaščiteno pred formulami
//   GET  /health
// Hosting remako-trezor preusmeri /v1/** in /health na to funkcijo (firebase.json v repozitoriju remako-trezor).
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { NAJVEC_TELO, Neveljavno, Prepovedano, Konflikt, sha256, preberiPaket, odtis, preberiKljuce, avtoriziraj,
  csvPoslov, povzetek, casUtc, sinteticniPaket, kanonicno } from "./algo-jedro.js";

const REGIJA = "europe-west1";
const BANKIRJA = ["teo.simonic7@gmail.com", "tim.petrovic@gmail.com"];
export const zbirke = (P) => ({ dogodki: `${P}-dogodki`, stevec: `${P}-stevec`, boti: `${P}-boti`, verzije: `${P}-verzije`, povzetek: `${P}-povzetek` });

// Zapiše paket v eni transakciji: vse ali nič. Isti ID z isto vsebino = dvojnik; z drugačno = Konflikt (nič se ne zapiše).
export async function zapisi(db, dogodki, P = "algo") {
  const Z = zbirke(P);
  const prejeto = Timestamp.now();
  const botKljuc = (e) => `${e.bot_id}__${e.environment}`;
  const verKljuc = (e) => `${e.bot_id}__${e.environment}__${e.strategy_id}__${e.strategy_version}`;
  const izid = await db.runTransaction(async (tx) => {
    const idji = [...new Set(dogodki.map((e) => e.event_id))];
    const boti = [...new Set(dogodki.map(botKljuc))];
    const verzije = [...new Set(dogodki.filter((e) => e.event_type !== "deal").map(verKljuc))];
    const ref = {
      dog: idji.map((id) => db.collection(Z.dogodki).doc(sha256(id))),
      stevec: db.collection(Z.stevec).doc("seq"),
      boti: boti.map((b) => db.collection(Z.boti).doc(b)),
      ver: verzije.map((v) => db.collection(Z.verzije).doc(v)),
    };
    const vse = await tx.getAll(...ref.dog, ref.stevec, ...ref.boti, ...ref.ver);
    const obstojeci = new Map(idji.map((id, i) => [id, vse[i].exists ? vse[i].get("digest") : null]));
    let seq = vse[idji.length].exists ? vse[idji.length].get("n") : 0;
    const botStanje = new Map(boti.map((b, i) => [b, vse[idji.length + 1 + i].exists ? vse[idji.length + 1 + i].data() : {}]));
    const verStanje = new Map(verzije.map((v, i) => [v, vse[idji.length + 1 + boti.length + i].exists ? vse[idji.length + 1 + boti.length + i].data() : null]));
    let vstavljeni = 0, dvojniki = 0, posli = 0;
    const zapisati = [];
    for (const e of dogodki) {
      const d = odtis(e);
      const prej = obstojeci.get(e.event_id);
      if (prej) {
        if (prej !== d) throw new Konflikt("Event ID already exists with different content");
        dvojniki++;
        continue;
      }
      obstojeci.set(e.event_id, d);
      seq++;
      vstavljeni++;
      if (e.event_type === "deal") posli++;
      const cas = casUtc(e.event_time_utc);
      zapisati.push([db.collection(Z.dogodki).doc(sha256(e.event_id)), {
        seq, event_id: e.event_id, bot_id: e.bot_id, kind: e.event_type, digest: d, json: kanonicno(e),
        environment: e.environment, mode: e.mode, symbol: e.symbol, account_fingerprint: e.account_fingerprint,
        strategy_id: e.strategy_id, strategy_version: e.strategy_version, event_time: Timestamp.fromMillis(cas), received_at: prejeto,
      }]);
      // Stanje bota: zadnji utrip, zagon, odločitev ... po času opazovanja (ponovno poslan star dogodek ne prepiše novejšega).
      const b = botStanje.get(botKljuc(e));
      const polje = { heartbeat: "utrip", started: "zagon", stopped: "ustavitev", decision: "odlocitev", signal: "signal", daily_stop: "dnevni_stop", operator_pause: "premor" }[e.event_type];
      if (polje && cas >= (b[polje + "_ms"] || 0)) { b[polje] = kanonicno(e); b[polje + "_ms"] = cas; }
      if (e.event_type !== "deal" && cas >= (b.zadnji_ms || 0)) {
        Object.assign(b, { zadnji_ms: cas, bot_id: e.bot_id, environment: e.environment, mode: e.mode, symbol: e.symbol, timeframe: e.timeframe,
          account_alias: e.account_alias, account_fingerprint: e.account_fingerprint, strategy_id: e.strategy_id, strategy_version: e.strategy_version });
      }
      if (e.event_type === "deal") b.zadnji_posel_ms = Math.max(b.zadnji_posel_ms || 0, cas);
      b.prejeto = prejeto;
      if (e.event_type !== "deal") {
        const k = verKljuc(e);
        const v = verStanje.get(k) || { bot_id: e.bot_id, environment: e.environment, strategy_id: e.strategy_id, strategy_version: e.strategy_version, prvic_ms: cas, zadnjic_ms: cas, dogodkov: 0 };
        v.prvic_ms = Math.min(v.prvic_ms, cas);
        v.zadnjic_ms = Math.max(v.zadnjic_ms, cas);
        v.dogodkov++;
        // Posnetek nastavitev ob zagonu (kar EA pošlje v »started«) in zadnji simbol/časovni okvir/način.
        if (e.event_type === "started") { v.nastavitve = kanonicno(e.data); v.nastavitve_ms = cas; }
        Object.assign(v, { symbol: e.symbol, timeframe: e.timeframe, mode: e.mode, account_alias: e.account_alias });
        verStanje.set(k, v);
      }
    }
    for (const [r, d] of zapisati) tx.create(r, d);
    if (vstavljeni) {
      tx.set(ref.stevec, { n: seq });
      for (const [k, b] of botStanje) if (Object.keys(b).length) tx.set(db.collection(Z.boti).doc(k), b);
      for (const [k, v] of verStanje) if (v) tx.set(db.collection(Z.verzije).doc(k), v);
    }
    return { accepted: dogodki.length, inserted: vstavljeni, duplicates: dvojniki, posli };
  });
  if (izid.posli) await preracunaj(db, P);
  return { accepted: izid.accepted, inserted: izid.inserted, duplicates: izid.duplicates };
}

const preberi = (s) => ({ seq: s.get("seq"), received_at: s.get("received_at").toDate().toISOString(), event: JSON.parse(s.get("json")) });

// Povzetek za stran (algo-povzetek/vse). Zapiše se samo, če ni starejši od že shranjenega (vzporedni paketi).
export async function preracunaj(db, P = "algo") {
  const Z = zbirke(P);
  await db.runTransaction(async (tx) => {
    const [stevec, prej] = await tx.getAll(db.collection(Z.stevec).doc("seq"), db.collection(Z.povzetek).doc("vse"));
    const doSeq = stevec.exists ? stevec.get("n") : 0;
    if (prej.exists && prej.get("do_seq") > doSeq) return;
    const posli = (await tx.get(db.collection(Z.dogodki).where("kind", "==", "deal"))).docs.map((s) => preberi(s).event);
    tx.set(db.collection(Z.povzetek).doc("vse"), { json: JSON.stringify(povzetek(posli)), do_seq: doSeq, t: Timestamp.now() });
  });
}

// Preprosta omejitev hitrosti na primerek: največ 120 zahtev na minuto na ključ.
const okna = new Map();
function prehitro(kljuc) {
  const zdaj = Date.now(), o = okna.get(kljuc) || { od: zdaj, n: 0 };
  if (zdaj - o.od > 60000) { o.od = zdaj; o.n = 0; }
  o.n++;
  okna.set(kljuc, o);
  return o.n > 120;
}

export async function obravnavaj(req, res, { db = getFirestore(), kljuci = null } = {}) {
  const odgovori = (status, vrednost, tip = "application/json; charset=utf-8") => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" });
    res.status(status).type(tip).send(tip.startsWith("application/json") ? kanonicno(vrednost) : vrednost);
  };
  const pot = req.path, metoda = req.method;
  if (pot === "/health" && metoda === "GET") return odgovori(200, { ok: true, service: "remako-telemetry", schema_version: 1 });
  const pisanje = pot === "/v1/events" && metoda === "POST";
  const branje = metoda === "GET" && ["/v1/events", "/v1/summary", "/v1/deals.csv"].includes(pot);
  if (!pisanje && !branje) return odgovori(404, { error: "not_found" });
  try { kljuci = kljuci || preberiKljuce(process.env.ALGO_KLJUCI); } catch { return odgovori(503, { error: "not_configured" }); }
  if (!kljuci.length) return odgovori(503, { error: "not_configured" });
  const k = avtoriziraj(req.get("authorization"), pisanje ? "ingest" : "read", kljuci);
  if (!k) return odgovori(401, { error: "unauthorized" });
  if (prehitro(k.sha256)) return odgovori(429, { error: "rate_limited" });
  try {
    if (pisanje) {
      if ((req.get("content-type") || "").split(";")[0].trim() !== "application/json") return odgovori(415, { error: "json_required" });
      const surovo = req.rawBody;
      if (!surovo) return odgovori(411, { error: "content_length_required" });
      if (surovo.length > NAJVEC_TELO) return odgovori(413, { error: "body_limit" });
      return odgovori(200, await zapisi(db, preberiPaket(surovo, k.boti)));
    }
    const q = req.query || {};
    const imena = Object.keys(q);
    if (imena.some((x) => !["bot_id", "after", "limit"].includes(x)) || imena.some((x) => typeof q[x] !== "string")) throw new Neveljavno("Invalid query parameters");
    let boti = k.boti;
    if (q.bot_id !== undefined) {
      if (!boti.includes(q.bot_id)) throw new Prepovedano("Bot not authorized");
      boti = [q.bot_id];
    }
    const Z = zbirke("algo");
    if (pot === "/v1/summary") {
      const posli = (await db.collection(Z.dogodki).where("kind", "==", "deal").where("bot_id", "in", boti).get()).docs.map((s) => preberi(s).event);
      const utripi = (await db.collection(Z.boti).where("bot_id", "in", boti).get()).docs.map((s) => s.get("utrip")).filter(Boolean).map((j) => JSON.parse(j));
      const { pozicije, ...ostalo } = povzetek(posli, utripi);
      return odgovori(200, { ...ostalo, pozicije });
    }
    const after = /^\d{1,15}$/.test(q.after ?? "0") ? Number(q.after ?? "0") : NaN;
    const limit = /^\d{1,4}$/.test(q.limit ?? "100") ? Number(q.limit ?? "100") : NaN;
    if (!Number.isFinite(after) || !(limit >= 1 && limit <= 1000)) throw new Neveljavno("after must be nonnegative and limit between 1 and 1000");
    let poizvedba = db.collection(Z.dogodki).where("bot_id", "in", boti);
    if (pot.endsWith(".csv")) poizvedba = poizvedba.where("kind", "==", "deal");
    const vrstice = (await poizvedba.where("seq", ">", after).orderBy("seq").limit(limit).get()).docs.map(preberi);
    if (pot.endsWith(".csv")) return odgovori(200, csvPoslov(vrstice), "text/csv; charset=utf-8");
    return odgovori(200, { items: vrstice, next_after: vrstice.length ? vrstice[vrstice.length - 1].seq : after, page_full: vrstice.length === limit });
  } catch (e) {
    if (e instanceof Prepovedano) return odgovori(403, { error: "forbidden" });
    if (e instanceof Konflikt) return odgovori(409, { error: "event_id_conflict", action: "quarantine_and_investigate" });
    if (e instanceof Neveljavno) return odgovori(400, { error: "invalid_payload" });
    // Brez telesa zahteve in glave Authorization v dnevniku.
    console.error(`Algo: ${e?.code || e?.name || "napaka"}`);
    return odgovori(503, { error: "storage_unavailable" });
  }
}

export const algo = onRequest({ region: REGIJA, maxInstances: 3, memory: "256MiB", timeoutSeconds: 30, invoker: "public" }, (req, res) => obravnavaj(req, res));

// Enako kot bankir() v firestore.rules: Teo ali Tim, potrjena e-pošta, prijava z drugim korakom (TOTP).
export const jeBankir = (auth) => !!auth?.token && auth.token.email_verified === true
  && BANKIRJA.includes(String(auth.token.email || "").toLowerCase()) && auth.token.firebase?.sign_in_second_factor === "totp";

// Preizkus povezave s stranjo: označeni sintetični posli gredo skozi isto pot zapisa v ločeno zbirko algo-test-*.
// Pokaže idempotenco (ponovni uvoz = dvojniki), zavrnitev spremenjenega posla in star utrip kot »offline«.
export async function preizkus(db) {
  const Z = zbirke("algo-test");
  for (const ime of Object.values(Z)) {
    const s = await db.collection(ime).limit(500).get();
    const b = db.batch();
    s.docs.forEach((d) => b.delete(d.ref));
    if (s.size) await b.commit();
  }
  const paket = sinteticniPaket();
  const utrip = { ...paket[0], event_id: "sinteticni-test:00000001:heartbeat:1", event_type: "heartbeat",
    data: { connected: true, trading_authorized: false, paused: false, halted: false, daily_stop: false, currency: "USD", status: "synthetic" } };
  const prvi = await zapisi(db, [...paket, utrip], "algo-test");
  const ponovno = await zapisi(db, paket.map((e) => ({ ...e, event_time_utc: "2026-10-26T00:05:00Z" })), "algo-test");
  let konflikt = false;
  try { await zapisi(db, [{ ...paket[1], data: { ...paket[1].data, profit: 25, net: 24.25 } }], "algo-test"); } catch (e) { konflikt = e instanceof Konflikt; }
  const pov = JSON.parse((await db.collection(Z.povzetek).doc("vse").get()).get("json"));
  const stevilo = (await db.collection(Z.dogodki).count().get()).data().count;
  return { prvi, ponovno, konflikt_zavrnjen: konflikt, shranjenih: stevilo, povzetek: pov.groups, pozicije: pov.pozicije };
}

export const algoPreizkus = onCall({ region: REGIJA, maxInstances: 1, memory: "256MiB" }, async (zahteva) => {
  if (!jeBankir(zahteva.auth)) throw new HttpsError("permission-denied", "Samo Teo in Tim s kodo 2FA.");
  const db = getFirestore();
  const izid = await preizkus(db);
  await db.collection("algo-test-povzetek").doc("preizkus").set({ json: JSON.stringify(izid), kdo: zahteva.auth.token.email, t: Timestamp.now() });
  return izid;
});

