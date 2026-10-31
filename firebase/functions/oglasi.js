// Zaslužek od reklam za stats.remako.si: AdMob (aplikacije) in AdSense (spletne strani).
// Oba API-ja sprejmeta samo prijavo uporabnika (ne službenega računa), zato se lastnik računa enkrat poveže:
//   1. stats.remako.si → »Poveži reklame« pokliče statistikaOglasiZacni (samo bralci statistike) in dobi enkratno povezavo,
//   2. https://byurska-studio.firebaseapp.com/oglasi.html (izvor firebaseapp.com Googlov odjemalec Firebase že dovoli, web.app pa ne) odpre Googlovo okno,
//   3. koda gre v statistikaOglasi, ki jo zamenja za trajni žeton in ga shrani v stat-skrito/oglasi (brskalnik do tega nima dostopa).
// Odjemalca (client id in secret) preberemo iz nastavitev Google prijave v Firebase, ki ga je ustvaril sam.
import crypto from "node:crypto";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { STRANI, danLj, dodajDni } from "./stat-jedro.js";

const REGIJA = "europe-west1";
const PROJEKT = process.env.GCLOUD_PROJECT || "byurska-studio";
const OBSEG = "openid email https://www.googleapis.com/auth/admob.readonly https://www.googleapis.com/auth/adsense.readonly";
const STRAN = `https://${PROJEKT}.firebaseapp.com/oglasi.html`;
const db = () => getFirestore();
const skrito = () => db().doc("stat-skrito/oglasi");

async function sZeton() {
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https://www.googleapis.com/auth/cloud-platform",
    { headers: { "Metadata-Flavor": "Google" } });
  if (!r.ok) throw new Error("Google žeton " + r.status);
  return (await r.json()).access_token;
}

let odjemalec;
async function odjemalecGoogle() {
  if (odjemalec) return odjemalec;
  const r = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJEKT}/defaultSupportedIdpConfigs/google.com`,
    { headers: { authorization: "Bearer " + await sZeton(), "x-goog-user-project": PROJEKT } });
  if (!r.ok) throw new Error("Nastavitve Google prijave " + r.status);
  const x = await r.json();
  if (!x.clientId || !x.clientSecret) throw new Error("Google prijava v Firebase nima odjemalca");
  return (odjemalec = { id: x.clientId, skrivnost: x.clientSecret });
}

// Korak 1: bralec statistike dobi enkratno povezavo (velja 15 minut).
export function oglasiZacni(dovoli) {
  return onCall({ region: REGIJA }, async (req) => {
    if (!dovoli(req.auth?.token || {})) throw new HttpsError("permission-denied", "Samo Teo, Tim, Urška in Anđela.");
    const s = crypto.randomBytes(24).toString("base64url");
    await skrito().set({ zacetki: { [s]: Date.now() + 15 * 60_000 } }, { merge: true });
    return { url: `${STRAN}?s=${s}` };
  });
}

const veljaven = async (s) => {
  const z = (await skrito().get()).data()?.zacetki || {};
  return typeof s === "string" && /^[\w-]{20,64}$/.test(s) && z[s] > Date.now();
};

// Koraka 2 in 3: GET vrne client id za Googlovo okno, POST shrani žeton.
export const statistikaOglasi = onRequest({ region: REGIJA, invoker: "public", cors: [`https://${PROJEKT}.web.app`, `https://${PROJEKT}.firebaseapp.com`] }, async (req, res) => {
  try {
    if (req.method === "GET") {
      if (!(await veljaven(req.query.s))) return res.status(403).json({ napaka: "Povezava je potekla. Na stats.remako.si znova klikni »Poveži reklame«." });
      return res.json({ clientId: (await odjemalecGoogle()).id, obseg: OBSEG });
    }
    if (req.method !== "POST") return res.status(405).end();
    const { s, koda } = req.body || {};
    if (!(await veljaven(s)) || typeof koda !== "string") return res.status(403).json({ napaka: "Povezava je potekla. Na stats.remako.si znova klikni »Poveži reklame«." });
    const o = await odjemalecGoogle();
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: koda, client_id: o.id, client_secret: o.skrivnost, redirect_uri: "postmessage", grant_type: "authorization_code" }) });
    const t = await r.json();
    if (!r.ok || !t.refresh_token) return res.status(400).json({ napaka: (t.refresh_token || !r.ok ? "Google ni vrnil dostopa (" + (t.error_description || t.error) + "). Poskusi znova."
      : "Google je ta račun že povezal prej. Odpri myaccount.google.com/permissions, odstrani dostop za to aplikacijo in poskusi znova.") });
    const email = JSON.parse(Buffer.from(String(t.id_token || "").split(".")[1] || "", "base64url").toString() || "{}").email || "neznan račun";
    await skrito().set({ racuni: { [email.replace(/\./g, "·")]: { email, zeton: t.refresh_token, obseg: t.scope || "", dodano: Date.now() } },
      zacetki: { [s]: FieldValue.delete() } }, { merge: true });
    await db().doc("stat-povzetek/skupno").set({ oglasi: { osvezeno: 0 } }, { merge: true });
    res.json({ ok: true, email, admob: /admob/.test(t.scope || ""), adsense: /adsense/.test(t.scope || "") });
  } catch (e) {
    console.error("statistikaOglasi", e.message);
    res.status(500).json({ napaka: e.message });
  }
});

async function dostop(o, zeton) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: zeton, client_id: o.id, client_secret: o.skrivnost, grant_type: "refresh_token" }) });
  const t = await r.json();
  if (!r.ok) throw new Error("dostop preklican ali potekel (" + (t.error || r.status) + "), znova klikni »Poveži reklame«");
  return t.access_token;
}

const datum = (d) => ({ year: +d.slice(0, 4), month: +d.slice(5, 7), day: +d.slice(8, 10) });
// Ime aplikacije v AdMob → kratko ime kot v statistiki (»Nakupko (iOS)« → nakupko).
export const kljucAplikacije = (ime) => String(ime || "drugo").toLowerCase().split(/[^a-z0-9čšž]+/).filter(Boolean)[0] || "drugo";
export const kljucDomene = (d) => STRANI[String(d || "").toLowerCase()] || String(d || "drugo").toLowerCase().replace(/^www\./, "");

async function admob(az, od, do_) {
  const r = await fetch("https://admob.googleapis.com/v1/accounts", { headers: { authorization: "Bearer " + az } });
  if (r.status === 401 || r.status === 403) return {}; // ta Google račun nima AdMob (npr. samo AdSense)
  if (!r.ok) throw new Error("AdMob " + r.status + " " + (await r.text()).slice(0, 140));
  const out = {};
  for (const a of (await r.json()).account || []) {
    const p = await fetch(`https://admob.googleapis.com/v1/${a.name}/networkReport:generate`, { method: "POST",
      headers: { authorization: "Bearer " + az, "content-type": "application/json" },
      body: JSON.stringify({ reportSpec: { dateRange: { startDate: datum(od), endDate: datum(do_) }, dimensions: ["DATE", "APP"], metrics: ["ESTIMATED_EARNINGS"],
        localizationSettings: { currencyCode: "EUR" } } }) });
    if (!p.ok) throw new Error("AdMob poročilo " + p.status + " " + (await p.text()).slice(0, 140));
    for (const x of await p.json()) {
      const v = x.row;
      if (!v) continue;
      const d = v.dimensionValues.DATE.value, dan = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      const k = kljucAplikacije(v.dimensionValues.APP.displayLabel);
      const e = (+v.metricValues.ESTIMATED_EARNINGS?.microsValue || 0) / 1e6;
      if (e) (out[k] = out[k] || {})[dan] = Math.round(((out[k][dan] || 0) + e) * 100) / 100;
    }
  }
  return out;
}

async function adsense(az, od, do_) {
  const r = await fetch("https://adsense.googleapis.com/v2/accounts", { headers: { authorization: "Bearer " + az } });
  if (r.status === 401 || r.status === 403) return {}; // ta Google račun nima AdSense (npr. samo AdMob)
  if (!r.ok) throw new Error("AdSense " + r.status + " " + (await r.text()).slice(0, 140));
  const out = {};
  for (const a of (await r.json()).accounts || []) {
    const q = new URLSearchParams({ dateRange: "CUSTOM", "startDate.year": od.slice(0, 4), "startDate.month": +od.slice(5, 7), "startDate.day": +od.slice(8, 10),
      "endDate.year": do_.slice(0, 4), "endDate.month": +do_.slice(5, 7), "endDate.day": +do_.slice(8, 10), currencyCode: "EUR", metrics: "ESTIMATED_EARNINGS" });
    q.append("dimensions", "DATE"); q.append("dimensions", "DOMAIN_NAME");
    const p = await fetch(`https://adsense.googleapis.com/v2/${a.name}/reports:generate?${q}`, { headers: { authorization: "Bearer " + az } });
    if (!p.ok) throw new Error("AdSense poročilo " + p.status + " " + (await p.text()).slice(0, 140));
    for (const v of (await p.json()).rows || []) {
      const [dan, dom, e] = v.cells.map((c) => c.value);
      if (+e) { const k = kljucDomene(dom); (out[k] = out[k] || {})[dan] = Math.round(((out[k][dan] || 0) + +e) * 100) / 100; }
    }
  }
  return out;
}

const zdruzi = (a, b) => { for (const [k, dnevi] of Object.entries(b)) for (const [d, v] of Object.entries(dnevi)) (a[k] = a[k] || {})[d] = (a[k][d] || 0) + v; return a; };

// Za statistikaZberi: enkrat na uro prebere vse povezane račune (zadnjih 400 dni). Vrne null, če je prejšnje še sveže.
export async function oglasi(prej) {
  const s = (await skrito().get()).data() || {};
  const racuni = Object.values(s.racuni || {});
  if (!racuni.length) return { povezano: false, osvezeno: Date.now() };
  // Nov povezan račun ali prejšnja napaka takoj sproži branje (ne čaka ure).
  const isti = (prej?.racuni || []).length === racuni.length && !Object.keys(prej?.napake || {}).length;
  if (prej?.povezano && isti && Date.now() - (prej.osvezeno || 0) < 55 * 60_000) return null;
  const o = await odjemalecGoogle(), danes = danLj(), od = dodajDni(danes, -400);
  const out = { povezano: true, osvezeno: Date.now(), racuni: [], admob: {}, adsense: {}, napake: {} };
  for (const r of racuni) {
    out.racuni.push(r.email);
    let az;
    try { az = await dostop(o, r.zeton); } catch (e) { out.napake[r.email] = e.message; continue; }
    if (/admob/.test(r.obseg)) try { zdruzi(out.admob, await admob(az, od, danes)); } catch (e) { out.napake[r.email + " AdMob"] = e.message; }
    if (/adsense/.test(r.obseg)) try { zdruzi(out.adsense, await adsense(az, od, danes)); } catch (e) { out.napake[r.email + " AdSense"] = e.message; }
  }
  return out;
}
