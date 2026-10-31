// Neodvisna primerjava: kar kaže stats.remako.si (stat-povzetek/skupno) proti surovim številkam iz Applea, AdMob in AdSense.
// Zažene ga .github/workflows/preveri-statistiko.yml v mapi firebase/functions (od tam firebase-admin). Izpiše samo vsote, nobenih ključev.
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/");
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const P = process.env.P || "byurska-studio";
initializeApp({ credential: applicationDefault(), projectId: P });
const db = getFirestore();
const dan = (d) => d.toISOString().slice(0, 10);
const danes = new Date(), DNI = 30;
const dnevi = [...Array(DNI)].map((_, i) => dan(new Date(danes - (i + 2) * 864e5))); // brez danes in včeraj (Apple zamuja)
const od = dnevi.at(-1), do_ = dnevi[0];
const eur = (x) => (Math.round(x * 100) / 100).toFixed(2) + " €";
const vrstica = (...a) => console.log(a.join(" | "));

const s = (await db.doc("stat-povzetek/skupno").get()).data() || {};
console.log(`\n== Obdobje ${od} … ${do_} (${DNI} dni) ==`);

// 1) Prenosi: statistika (Apple + Play skupaj, dnevi.p) proti Apple poročilu
console.log("\n== Prenosi po aplikacijah ==");
const stat = {};
for (const [a, x] of Object.entries(s.nakupko?.app || {})) stat[a] = dnevi.reduce((v, d) => v + (x.dnevi?.[d]?.p || 0), 0);
for (const [a, x] of Object.entries(s.nakupko?.app || {})) vrstica("statistika", a, stat[a], "(Play skupaj vseh časov: " + (x.play ?? "–") + ")");
for (const [a, x] of Object.entries(s.nakupko?.app || {})) {
  const dd = Object.entries(x.dnevi || {}).filter(([, v]) => v.p || v.e || v.n);
  vrstica("statistika vsi dnevi", a, "dni z vrednostmi " + dd.length, dd.slice(-3).map(([d, v]) => d + JSON.stringify(v)).join(" "));
}
console.log("aktivni (oblika):", JSON.stringify(s.nakupko?.aktivni ?? null).slice(0, 300));

const { KEY_ID, ISSUER_ID, KEY_P8 } = process.env;
let vendor = process.env.VENDOR || "";
if (!vendor) {
  try {
    const { GoogleAuth } = require("google-auth-library");
    const t = await (await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/firebase.database", "https://www.googleapis.com/auth/userinfo.email"] }).getClient()).getAccessToken();
    const r = await fetch("https://nakupko-8ad19-default-rtdb.europe-west1.firebasedatabase.app/nadzor/rocno.json", { headers: { authorization: "Bearer " + t.token } });
    const x = r.ok ? await r.json() : null;
    vendor = Object.values(x || {}).map(String).find((v) => /^\d{8,9}$/.test(v)) || "";
    if (!r.ok) console.log("Nakupko /nadzor/rocno:", r.status);
  } catch (e) { console.log("vendor:", e.message); }
}
if (KEY_ID && ISSUER_ID && KEY_P8 && vendor) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const glava = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const tel = b64({ iss: ISSUER_ID, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 1200, aud: "appstoreconnect-v1" });
  // Ključ je lahko prilepljen z \n, brez glave ali v eni vrstici (kot v ios.yml): sestavimo čist PEM.
  const telo = KEY_P8.replace(/\uFEFF/g, "").replace(/\\n/g, "\n").replace(/-----(BEGIN|END)[A-Z ]*-----/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const pem = "-----BEGIN PRIVATE KEY-----\n" + telo.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n";
  const pod = crypto.sign("sha256", Buffer.from(glava + "." + tel), { key: pem, dsaEncoding: "ieee-p1363" }).toString("base64url");
  const jwt = `${glava}.${tel}.${pod}`;
  const apple = {}, vsiTipi = {};
  let manjka = 0;
  for (const d of dnevi) {
    const q = new URLSearchParams({ "filter[frequency]": "DAILY", "filter[reportType]": "SALES", "filter[reportSubType]": "SUMMARY", "filter[vendorNumber]": vendor, "filter[reportDate]": d });
    const r = await fetch("https://api.appstoreconnect.apple.com/v1/salesReports?" + q, { headers: { authorization: "Bearer " + jwt } });
    if (r.status === 404) continue; // ta dan ni bilo prodaje/prenosov
    if (!r.ok) { manjka++; if (manjka < 3) console.log("Apple", d, r.status, (await r.text()).slice(0, 160)); continue; }
    const tsv = zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString().trim().split("\n");
    const h = tsv[0].split("\t"), i = (n) => h.indexOf(n);
    for (const l of tsv.slice(1)) {
      const c = l.split("\t"), tip = c[i("Product Type Identifier")], ime = c[i("Title")], u = +c[i("Units")] || 0;
      (vsiTipi[ime] = vsiTipi[ime] || {})[tip] = (vsiTipi[ime][tip] || 0) + u;
      if (["1", "1F", "1T", "F1"].includes(tip)) apple[ime] = (apple[ime] || 0) + u;
      if (u && !/nakupko/i.test(ime)) console.log("Apple vrstica", d, ime, "tip", tip, "enot", u, "SKU", c[i("SKU")], "Apple ID", c[i("Apple Identifier")], "Parent", c[i("Parent Identifier")]);
    }
  }
  for (const [a, v] of Object.entries(apple)) vrstica("Apple prvi prenosi", a, v);
  for (const [a, v] of Object.entries(vsiTipi)) vrstica("Apple vse vrste", a, JSON.stringify(v));
  if (manjka) console.log("Apple: manjka dni:", manjka);
} else console.log("Apple: ni ključa ali vendor številke (" + (vendor ? "ključ" : "vendor") + ")");

// 2) Reklame: statistika proti neposrednemu poročilu po MESECIH (drugačen način seštevanja kot funkcija, ki bere po dnevih)
console.log("\n== Reklame po mesecih ==");
const og = s.oglasi || {};
const poMes = (z) => { const o = {}; for (const [k, dd] of Object.entries(z || {})) for (const [d, v] of Object.entries(dd)) { const m = d.slice(0, 7); (o[k] = o[k] || {})[m] = (o[k][m] || 0) + v; } return o; };
for (const [vir, z] of [["AdMob", og.admob], ["AdSense", og.adsense]]) for (const [k, mm] of Object.entries(poMes(z))) for (const [m, v] of Object.entries(mm)) vrstica("statistika", vir, k, m, eur(v));
console.log("statistika osveženo:", og.osvezeno ? new Date(og.osvezeno).toISOString() : "–", "napake:", JSON.stringify(og.napake || {}));

const { GoogleAuth } = require("google-auth-library");
const sat = (await (await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient()).getAccessToken()).token;
const idp = await (await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/defaultSupportedIdpConfigs/google.com`, { headers: { authorization: "Bearer " + sat, "x-goog-user-project": P } })).json();
const racuni = Object.values((await db.doc("stat-skrito/oglasi").get()).data()?.racuni || {});
const zacetek = new Date(Date.UTC(danes.getUTCFullYear(), danes.getUTCMonth() - 12, 1));
for (const r of racuni) {
  const t = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: r.zeton, client_id: idp.clientId, client_secret: idp.clientSecret, grant_type: "refresh_token" }) })).json();
  if (!t.access_token) { console.log(r.email, "žeton:", t.error); continue; }
  const H = { authorization: "Bearer " + t.access_token };
  const am = await fetch("https://admob.googleapis.com/v1/accounts", { headers: H });
  if (am.ok) for (const a of (await am.json()).account || []) {
    const p = await (await fetch(`https://admob.googleapis.com/v1/${a.name}/networkReport:generate`, { method: "POST", headers: { ...H, "content-type": "application/json" },
      body: JSON.stringify({ reportSpec: { dateRange: { startDate: { year: zacetek.getUTCFullYear(), month: zacetek.getUTCMonth() + 1, day: 1 }, endDate: { year: danes.getUTCFullYear(), month: danes.getUTCMonth() + 1, day: danes.getUTCDate() } },
        dimensions: ["MONTH", "APP"], metrics: ["ESTIMATED_EARNINGS", "IMPRESSIONS"], localizationSettings: { currencyCode: "EUR" } } }) })).json();
    for (const x of p) if (x.row) vrstica("AdMob direktno", r.email, a.publisherId, x.row.dimensionValues.APP.displayLabel, x.row.dimensionValues.MONTH.value,
      eur((+x.row.metricValues.ESTIMATED_EARNINGS?.microsValue || 0) / 1e6), "prikazov " + (x.row.metricValues.IMPRESSIONS?.integerValue || 0));
  } else vrstica("AdMob direktno", r.email, "ni računa (" + am.status + ")");
  const as = await fetch("https://adsense.googleapis.com/v2/accounts", { headers: H });
  if (as.ok) for (const a of (await as.json()).accounts || []) {
    const q = new URLSearchParams({ dateRange: "LAST_30_DAYS", currencyCode: "EUR" });
    ["MONTH", "DOMAIN_NAME"].forEach((d) => q.append("dimensions", d)); ["ESTIMATED_EARNINGS", "PAGE_VIEWS"].forEach((m) => q.append("metrics", m));
    const p = await (await fetch(`https://adsense.googleapis.com/v2/${a.name}/reports:generate?${q}`, { headers: H })).json();
    vrstica("AdSense direktno", r.email, a.name, a.state || "", "vrstic " + (p.rows || []).length, p.error ? JSON.stringify(p.error).slice(0, 160) : "");
    for (const v of p.rows || []) vrstica("AdSense direktno", r.email, ...v.cells.map((c) => c.value));
  } else vrstica("AdSense direktno", r.email, "ni računa (" + as.status + ")");
}

// 3) Promet: lasten števec proti Search Console (kliki iz Googla so podmnožica obiskov)
console.log("\n== Ogledi strani (zadnjih 30 dni) ==");
for (const d of (await db.collection("stat-povzetek").get()).docs) {
  if (d.id === "skupno") continue;
  const x = d.data(), sum = (k) => dnevi.reduce((v, dd) => v + (+x.dnevi?.[dd]?.[k] || 0), 0);
  const kljuci = new Set(dnevi.flatMap((dd) => Object.keys(x.dnevi?.[dd] || {})));
  vrstica(d.id, [...kljuci].filter((k) => !Array.isArray(x.dnevi?.[do_]?.[k])).map((k) => k + "=" + sum(k)).join(" "), "GSC:", JSON.stringify(x.gsc || {}).slice(0, 200));
}
