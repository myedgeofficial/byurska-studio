#!/usr/bin/env node
// Teove naloge iz Byurska Studia za samodejno delo v oblaku.
// Prijava kot Teo (BYURSKA_EMAIL, BYURSKA_GESLO), brez dodatnih knjižnic.
//   node orodja/teo-naloge.mjs seznam                       odprte naloge za Teota in za Vse (JSON)
//   node orodja/teo-naloge.mjs opravljeno <mapa> <id> "kaj je narejeno"
//   node orodja/teo-naloge.mjs preskoci <mapa> <id>         naloga ni za avtomatsko delo, ne ponujaj je več
import { readFileSync } from "node:fs";

const PROJEKT = process.env.BYURSKA_PROJEKT || "byurska-studio";
const EMU = process.env.BYURSKA_EMULATOR === "1";
const KLJUC = process.env.BYURSKA_API_KEY || (EMU ? "x" : JSON.parse(readFileSync(new URL("./firebase-kljuc.json", import.meta.url), "utf8")).apiKey);
const AUTH = EMU ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com" : "https://identitytoolkit.googleapis.com";
const FS = (EMU ? "http://127.0.0.1:8080" : "https://firestore.googleapis.com") + `/v1/projects/${PROJEKT}/databases/(default)/documents`;

const napaka = (s) => { console.error(s); process.exit(1); };
const { BYURSKA_EMAIL: email, BYURSKA_GESLO: geslo } = process.env;
if (!email || !geslo) napaka("Manjkata BYURSKA_EMAIL in BYURSKA_GESLO.");

async function prijava() {
  const r = await fetch(`${AUTH}/v1/accounts:signInWithPassword?key=${KLJUC}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: geslo, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) napaka("Prijava ni uspela: " + (j.error?.message || r.status));
  return j.idToken;
}
const zeton = await prijava();
async function api(pot, opt = {}) {
  const r = await fetch(FS + pot, { ...opt, headers: { authorization: `Bearer ${zeton}`, "content-type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) napaka(`Napaka ${r.status}: ${j.error?.message || ""}`);
  return j;
}
const vrednost = (v) => {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(vrednost);
  if ("mapValue" in v) return polja(v.mapValue.fields);
  return undefined;
};
const polja = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, vrednost(v)]));
const delPoti = (ime) => ime.split("/documents/")[1].split("/");

const [ukaz, mapa, id, ...ostalo] = process.argv.slice(2);
const jaz = email.toLowerCase();

if (ukaz === "seznam") {
  const mape = {};
  let tok = "";
  do {
    const j = await api(`/mape?pageSize=300${tok ? `&pageToken=${tok}` : ""}`);
    for (const d of j.documents || []) { const p = polja(d.fields); mape[delPoti(d.name)[1]] = p.ime; }
    tok = j.nextPageToken || "";
  } while (tok);
  const vrstice = await api(":runQuery", { method: "POST", body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "naloge", allDescendants: true }] } }) });
  const naloge = vrstice.filter((v) => v.document).map(({ document: d }) => {
    const p = polja(d.fields), pot = delPoti(d.name);
    return { mapa: pot[1], imeMape: mape[pot[1]] || pot[1], id: pot[3], besedilo: p.besedilo, za: p.za ? p.za : "vsi", strosek: p.strosek || 0, dodal: p.dodal, ob: p.ob ? new Date(p.ob).toISOString() : null, _p: p };
  }).filter((n) => !n._p.narejeno && !n._p.teoPreskoci && (n.za === "vsi" || String(n.za).toLowerCase() === jaz))
    .map(({ _p, ...n }) => n).sort((a, b) => String(a.ob).localeCompare(String(b.ob)));
  console.log(JSON.stringify(naloge, null, 2));
} else if (ukaz === "opravljeno" || ukaz === "preskoci") {
  if (!mapa || !id) napaka("Uporaba: opravljeno|preskoci <mapa> <id> [opis]");
  const f = ukaz === "preskoci" ? { teoPreskoci: { booleanValue: true } } : {
    narejeno: { booleanValue: true }, narejenoKdo: { stringValue: jaz }, narejenoOb: { integerValue: String(Date.now()) },
    uredil: { stringValue: jaz }, pregledal: { arrayValue: {} },
    ...(ostalo.length ? { porocilo: { stringValue: ostalo.join(" ").trim() } } : {}),
  };
  const maska = Object.keys(f).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  await api(`/mape/${encodeURIComponent(mapa)}/naloge/${encodeURIComponent(id)}?${maska}&currentDocument.exists=true`, { method: "PATCH", body: JSON.stringify({ fields: f }) });
  console.log(ukaz === "preskoci" ? "Preskočeno." : "Označeno kot opravljeno.");
} else napaka("Ukazi: seznam | opravljeno <mapa> <id> [opis] | preskoci <mapa> <id>");
