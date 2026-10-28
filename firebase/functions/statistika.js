// Statistika vseh spletnih strani (stats.remako.si, samo Teo in Tim z Google prijavo in kodo 2FA).
//   stevec               POST iz skripte na straneh (sendBeacon): ogled strani ali čas na strani. Brez piškotkov.
//   statistikaZberi      vsakih 15 minut: promet iz števca, Search Console, Stripe, baza myedgeofficial.com, Nakupko /nadzor
//   statistikaOsvezi     gumb »Osveži« na plošči (isto kot zgoraj, takoj)
// Rezultat je v stat-povzetek/{stran} in stat-povzetek/skupno; brskalnik bere samo to (pravila: bankir()).
// Ključi (Stripe) so samo v okolju funkcije, v brskalnik ne pride nič od tega.
import crypto from "node:crypto";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, FieldPath } from "firebase-admin/firestore";
import { STRANI, IMENA, BOT, vir, naprava, drzava, pot, zgosti, danLj, dodajDni, narocnine, dnevniZapis } from "./stat-jedro.js";

const REGIJA = "europe-west1";
// Statistiko vidijo samo Teo, Tim, Urška in Anđela (Google prijava); Teo in Tim še s kodo 2FA.
const Z_2FA = ["teo.simonic7@gmail.com", "tim.petrovic@gmail.com"];
const BRALCI = [...Z_2FA, "urska.repusic@gmail.com", "repusicurska@gmail.com", "andjela.collab@gmail.com"];
const MYEDGE_API = "https://www.myedgeofficial.com/api/internal/stats";
const NAKUPKO_DB = "https://nakupko-8ad19-default-rtdb.europe-west1.firebasedatabase.app";
const db = () => getFirestore();
const inc = (n = 1) => FieldValue.increment(n);

let sol = {};
async function dnevnaSol(dan) {
  if (sol.dan === dan) return sol.sol;
  const ref = db().doc("stat-sol/sol");
  const nova = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (s.exists && s.data().dan === dan) return s.data().sol;
    const x = crypto.randomBytes(24).toString("base64url");
    tx.set(ref, { dan, sol: x });
    return x;
  });
  sol = { dan, sol: nova };
  return nova;
}

export const stevec = onRequest({ region: REGIJA, maxInstances: 5, memory: "256MiB", concurrency: 40, invoker: "public" }, async (req, res) => {
  const izvor = req.get("origin") || "";
  let gostitelj = "";
  try { gostitelj = new URL(izvor).hostname.toLowerCase(); } catch { gostitelj = ""; }
  const stran = STRANI[gostitelj];
  res.set("Vary", "Origin");
  if (stran) res.set("Access-Control-Allow-Origin", izvor);
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "content-type");
    return res.status(204).end();
  }
  const ua = req.get("user-agent") || "";
  if (req.method !== "POST" || !stran || BOT.test(ua)) return res.status(204).end();
  let x;
  try { x = JSON.parse(String(req.rawBody || "").slice(0, 4000)); } catch { return res.status(204).end(); }
  try {
    const dan = danLj(), p = pot(x.p), dref = db().doc(`stat-dan/${stran}_${dan}`);
    if (x.t === "k") {
      const d = Math.round(+x.d);
      if (d >= 1 && d <= 7200) await dref.set({ site: stran, dan, casSum: inc(Math.min(d, 1800)), casN: inc() }, { merge: true });
      return res.status(204).end();
    }
    if (x.t !== "v") return res.status(204).end();
    const ip = String(req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim();
    const vid = zgosti(await dnevnaSol(dan), ip, ua, stran);
    const v = vir(x.r, x.us, gostitelj), n = naprava(ua, +x.w), drz = drzava(x.tz, x.l || req.get("accept-language"));
    const vref = db().doc(`stat-obisk/${dan}_${vid}`);
    await db().runTransaction(async (tx) => {
      const s = await tx.get(vref);
      const k = (s.exists ? s.data().n : 0) + 1;
      tx.set(vref, { n: k, dan });
      const u = { site: stran, dan, ogledi: inc(), poti: { [p]: inc() } };
      if (k === 1) Object.assign(u, { obiskovalci: inc(), odboji: inc(), drzave: { [drz]: inc() }, naprave: { [n.tip]: inc() }, os: { [n.os]: inc() }, brskalniki: { [n.brskalnik]: inc() } });
      if (k === 2) u.odboji = inc(-1);
      if (v) Object.assign(u, { viri: { [v[0]]: inc() }, vir2: { [`${v[0]} · ${v[1]}`]: inc() }, vstopi: { [p]: inc() } });
      tx.set(dref, u, { merge: true });
    });
  } catch (e) { console.error("stevec", e.message); }
  res.status(204).end();
});

/* ---------- Zbiranje ---------- */

// Metadatni strežnik hoče več obsegov ločenih z vejico (s presledkom vrne 400).
async function gZeton(obseg) {
  const r = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${encodeURIComponent(obseg)}`,
    { headers: { "Metadata-Flavor": "Google" } });
  if (!r.ok) throw new Error("Google žeton " + r.status);
  return (await r.json()).access_token;
}
async function gIdentiteta(publika) {
  const r = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(publika)}&format=full`,
    { headers: { "Metadata-Flavor": "Google" } });
  if (!r.ok) throw new Error("Google identiteta " + r.status);
  return r.text();
}
async function racun() {
  try {
    const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email", { headers: { "Metadata-Flavor": "Google" } });
    return r.ok ? (await r.text()).trim() : null;
  } catch { return null; }
}

// Promet iz števca: zadnja 2 dneva (ob prvem zagonu vse) → stat-povzetek/{stran}.dnevi
async function promet(stran, prej) {
  const danes = danLj(), od = prej?.dnevi ? dodajDni(danes, -2) : "2026-01-01";
  const q = await db().collection("stat-dan").orderBy(FieldPath.documentId())
    .startAt(`${stran}_${od}`).endAt(`${stran}_9999`).get();
  const dnevi = { ...(prej?.dnevi || {}) }, meja = dodajDni(danes, -90), konec = dodajDni(danes, -730);
  for (const d of q.docs) { const x = d.data(); if (x.dan) dnevi[x.dan] = dnevniZapis(x, x.dan >= meja); }
  for (const d of Object.keys(dnevi)) {
    if (d < konec) delete dnevi[d];
    else if (d < meja) dnevi[d] = dnevniZapis({ ogledi: dnevi[d].o, obiskovalci: dnevi[d].v, odboji: dnevi[d].b, casSum: dnevi[d].cs, casN: dnevi[d].cn }, false);
  }
  return dnevi;
}

// Google Search Console: lastnost poiščemo med tistimi, do katerih ima dostop račun funkcije.
async function gsc(zeton, lastnosti, stran) {
  const dom = IMENA[stran];
  const lastnost = [`sc-domain:${dom}`, `https://www.${dom}/`, `https://${dom}/`].find((x) => lastnosti.includes(x));
  if (!lastnost) return { napaka: `Račun nima dostopa do ${dom} v Search Console.` };
  const danes = danLj();
  const vprasaj = async (dimenzije, dni, vrstic) => {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(lastnost)}/searchAnalytics/query`, {
      method: "POST", headers: { authorization: "Bearer " + zeton, "content-type": "application/json" },
      body: JSON.stringify({ startDate: dodajDni(danes, -dni), endDate: danes, dimensions: dimenzije, rowLimit: vrstic, dataState: "all" })
    });
    if (!r.ok) throw new Error("Search Console " + r.status + " " + (await r.text()).slice(0, 160));
    return (await r.json()).rows || [];
  };
  // Firestore ne dovoli seznama v seznamu, zato je vrstica predmet { k: ključ, v: [kliki, prikazi, pozicija] }.
  const vrstica = (x) => ({ k: x.keys[0], v: [x.clicks, x.impressions, Math.round(x.position * 10) / 10] });
  const [dnevi, poizvedbe, strani, drzave, naprave] = await Promise.all([
    vprasaj(["date"], 480, 1000), vprasaj(["query"], 28, 30), vprasaj(["page"], 28, 25), vprasaj(["country"], 28, 20), vprasaj(["device"], 28, 5)]);
  return {
    lastnost,
    dnevi: Object.fromEntries(dnevi.map((x) => [x.keys[0], [x.clicks, x.impressions, Math.round(x.position * 10) / 10]])),
    poizvedbe: poizvedbe.map(vrstica), strani: strani.map(vrstica), drzave: drzave.map(vrstica), naprave: naprave.map(vrstica),
  };
}

async function stripe(kljuc) {
  const seznam = async (pot, params, strani = 60) => {
    const vse = [];
    let po;
    for (let i = 0; i < strani; i++) {
      const q = new URLSearchParams({ limit: "100", ...params, ...(po ? { starting_after: po } : {}) });
      const r = await fetch(`https://api.stripe.com${pot}?${q}`, { headers: { authorization: "Bearer " + kljuc } });
      if (!r.ok) throw new Error(`Stripe ${pot} ${r.status}: ` + ((await r.json().catch(() => ({}))).error?.message || "").slice(0, 160));
      const j = await r.json();
      vse.push(...j.data);
      if (!j.has_more || !j.data.length) break;
      po = j.data[j.data.length - 1].id;
    }
    return vse;
  };
  const od = Math.floor(Date.now() / 1000) - 400 * 86400;
  const [izdelki, subs, bt] = await Promise.all([
    seznam("/v1/products", {}), seznam("/v1/subscriptions", { status: "all" }),
    seznam("/v1/balance_transactions", { "created[gte]": String(od) })]);
  const imena = Object.fromEntries(izdelki.map((p) => [p.id, p.name]));
  const izid = narocnine(subs, (id) => imena[id] || id || "?");
  const prihodki = {};
  for (const t of bt) {
    if (!["charge", "payment", "refund", "payment_refund"].includes(t.type)) continue;
    const d = danLj(new Date(t.created * 1000)), val = t.currency.toUpperCase();
    const o = (prihodki[d] = prihodki[d] || {})[val] = prihodki[d]?.[val] || { b: 0, n: 0, s: 0 };
    if (t.amount > 0) { o.b += t.amount; o.s++; }
    o.n += t.net;
  }
  izid.prihodki = prihodki;
  return izid;
}

async function myedge() {
  const r = await fetch(MYEDGE_API, { headers: { authorization: "Bearer " + await gIdentiteta(MYEDGE_API) } });
  if (!r.ok) throw new Error("myedgeofficial.com " + r.status + " " + (await r.text()).slice(0, 120));
  return r.json();
}

// Nakupko in Popravko (aplikaciji): samo branje /nadzor, ki ga polni Nakupkova funkcija.
async function nakupko() {
  const z = await gZeton("https://www.googleapis.com/auth/firebase.database,https://www.googleapis.com/auth/userinfo.email");
  const r = await fetch(`${NAKUPKO_DB}/nadzor.json`, { headers: { authorization: "Bearer " + z } });
  if (!r.ok) throw new Error("Nakupko /nadzor " + r.status + (r.status === 401 || r.status === 403 ? ": račun funkcije še nima pravice branja v projektu nakupko-8ad19" : ""));
  const n = (await r.json()) || {}, tecaji = n.tecaji || { EUR: 1 };
  const eur = (o) => Object.entries(o || {}).reduce((a, [c, v]) => a + (c === "EUR" ? v : tecaji[c] ? v / tecaji[c] : 0), 0);
  const app = {}, meja = dodajDni(danLj(), -400);
  for (const [d, poApp] of Object.entries(n.apple?.poAplikacijah || {})) {
    if (d < meja) continue;
    for (const [a, x] of Object.entries(poApp || {})) {
      const t = ((app[a] = app[a] || { dnevi: {} }).dnevi[d] = app[a].dnevi[d] || { p: 0, n: 0, e: 0 });
      t.p += x.prenosi || 0; t.n += x.narocnine || 0; t.e += eur(x.izplacilo);
    }
  }
  for (const [a, x] of Object.entries(n.play || {})) {
    if (!x || typeof x !== "object" || !x.naDan) continue;
    app[a] = app[a] || { dnevi: {} };
    app[a].play = x.skupaj || 0;
    for (const [d, v] of Object.entries(x.naDan)) if (d >= meja) (app[a].dnevi[d] = app[a].dnevi[d] || { p: 0, n: 0, e: 0 }).p += v || 0;
  }
  const admob = {};
  for (const [m, x] of Object.entries(n.admob?.meseci || {})) for (const [a, y] of Object.entries(x || {})) (admob[a] = admob[a] || {})[m] = +y?.zasluzek || 0;
  for (const [m, v] of Object.entries(n.rocno?.admob || {})) if (!n.admob?.meseci?.[m]) (admob.nakupko = admob.nakupko || {})[m] = +v || 0;
  return { app, admob, aktivni: n.aktivni || null, narocnine: n.apple?.narocnine || null, apk: n.android?.prenosi || 0, osvezeno: n.povzetek?.osvezeno || null };
}

async function zberi() {
  const napake = {}, skupno = { osvezeno: Date.now(), racun: await racun() };
  let lastnosti = [], gz;
  try {
    gz = await gZeton("https://www.googleapis.com/auth/webmasters.readonly");
    const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { authorization: "Bearer " + gz } });
    if (!r.ok) throw new Error("Search Console " + r.status + " " + (await r.text()).slice(0, 160));
    lastnosti = ((await r.json()).siteEntry || []).map((x) => x.siteUrl);
  } catch (e) { napake.gsc = e.message; }
  await Promise.all(Object.keys(IMENA).map(async (stran) => {
    const ref = db().doc(`stat-povzetek/${stran}`);
    const prej = (await ref.get()).data();
    const novo = { osvezeno: Date.now() };
    try { novo.dnevi = await promet(stran, prej); } catch (e) { napake["promet-" + stran] = e.message; }
    if (gz) { try { novo.gsc = await gsc(gz, lastnosti, stran); } catch (e) { novo.gsc = { napaka: e.message }; } }
    await ref.set(novo, { mergeFields: Object.keys(novo) });
  }));
  const viri = [
    ["stripeSp", process.env.STRIPE_SP_KEY && (() => stripe(process.env.STRIPE_SP_KEY))],
    ["stripeRemako", process.env.STRIPE_REMAKO_KEY && (() => stripe(process.env.STRIPE_REMAKO_KEY))],
    ["myedge", myedge], ["nakupko", nakupko]];
  await Promise.all(viri.map(async ([k, f]) => {
    if (!f) { napake[k] = "ključ še ni nastavljen"; return; }
    try { skupno[k] = await f(); } catch (e) { napake[k] = e.message; }
  }));
  skupno.napake = napake;
  // Kar je že bilo prebrano, ostane, če vir tokrat ne odgovori (zamenjamo samo polja, ki smo jih prebrali).
  await db().doc("stat-povzetek/skupno").set(skupno, { mergeFields: Object.keys(skupno) });
  // Prepoznava obiskovalcev velja samo en dan: včerajšnje zgoščene vrednosti zbrišemo.
  const stari = await db().collection("stat-obisk").where("dan", "<", danLj()).limit(2000).get();
  for (let i = 0; i < stari.docs.length; i += 400) {
    const b = db().batch();
    stari.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  console.log("statistika zbrana", JSON.stringify(napake));
}

export const statistikaZberi = onSchedule({ schedule: "*/15 * * * *", timeZone: "Europe/Ljubljana", region: REGIJA, timeoutSeconds: 300, memory: "512MiB" }, zberi);

export const statistikaOsvezi = onCall({ region: REGIJA, timeoutSeconds: 300, memory: "512MiB" }, async (req) => {
  const t = req.auth?.token || {};
  if (!t.email_verified || !BRALCI.includes(String(t.email || "").toLowerCase())
    || (Z_2FA.includes(String(t.email).toLowerCase()) && t.firebase?.sign_in_second_factor !== "totp"))
    throw new HttpsError("permission-denied", "Samo Teo, Tim, Urška in Anđela.");
  const zadnje = (await db().doc("stat-povzetek/skupno").get()).data()?.osvezeno || 0;
  if (Date.now() - zadnje > 60_000) await zberi();
  return { ok: true };
});
