// Potisna obvestila za objave, ki utripajo: osebi, ki mora objavo narediti, dvakrat na dan (od 9:00 in od 18:00),
// dokler objava ni označena kot objavljena. Zažene ga .github/workflows/opomniki.yml.
// Repozitorij je javen: v dnevnik ne izpisujemo imen map, opisov ali e-pošte.
import crypto from "node:crypto";
import http2 from "node:http2";
import { nujnost, odgovoren, terminOpomnika, platformeIme, dan, ura } from "../../web/src/data.js";

const { P, TOKEN, APNS_KEY_P8, APNS_KEY_ID, APPLE_TEAM_ID } = process.env;
const TOPIC = process.env.BUNDLE_ID || "com.byurska.studio";
const BAZA = `${process.env.FIRESTORE_URL || "https://firestore.googleapis.com/v1"}/projects/${P}/databases/(default)/documents`;

async function api(pot, opts = {}) {
  const r = await fetch(pot.startsWith("http") ? pot : `${BAZA}${pot}`, {
    ...opts, headers: { Authorization: `Bearer ${TOKEN}`, "x-goog-user-project": P, "Content-Type": "application/json" }
  });
  if (!r.ok && r.status !== 404) throw new Error(`Firestore ${r.status}`);
  return r.status === 404 ? null : r.json();
}

// Firestore REST vrednosti v navadne JS vrednosti.
function vrednost(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(vrednost);
  if ("mapValue" in v) return polja(v.mapValue.fields);
  return null;
}
const polja = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, vrednost(v)]));
const dokument = (d) => ({ id: d.name.split("/").pop(), ...polja(d.fields) });

async function poizvedba(zbirka, polje, op, v) {
  const r = await api(`:runQuery`, {
    method: "POST",
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: zbirka }], where: { fieldFilter: { field: { fieldPath: polje }, op, value: v } } } })
  });
  return (r || []).filter((x) => x.document).map((x) => dokument(x.document));
}

function apnsJwt() {
  const glava = Buffer.from(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })).toString("base64url");
  const telo = Buffer.from(JSON.stringify({ iss: APPLE_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const surov = APNS_KEY_P8.replace(/\\n/g, "\n").replace(/-----(BEGIN|END)[A-Z ]*-----/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  const kljuc = `-----BEGIN PRIVATE KEY-----\n${surov.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
  const podpis = crypto.sign("sha256", Buffer.from(`${glava}.${telo}`), { key: kljuc, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${glava}.${telo}.${podpis}`;
}

// Pošlje obvestilo na vse žetone; vrne žetone, ki jih Apple ne pozna več.
async function poslji(zetoni, naslov, besedilo, objava) {
  const client = http2.connect(process.env.APNS_URL || "https://api.push.apple.com"), jwt = apnsJwt(), mrtvi = [];
  let ok = 0;
  await Promise.all(zetoni.map((t) => new Promise((resolve) => {
    const req = client.request({
      ":method": "POST", ":path": `/3/device/${t}`, authorization: `bearer ${jwt}`,
      "apns-topic": TOPIC, "apns-push-type": "alert", "apns-priority": "10"
    });
    let status = 0, odgovor = "";
    req.on("response", (h) => (status = h[":status"]));
    req.on("data", (c) => (odgovor += c));
    req.on("end", () => {
      if (status === 200) ok++;
      else {
        if (status === 410 || /BadDeviceToken|Unregistered/.test(odgovor)) mrtvi.push(t);
        console.log(`APNs ${status} ${odgovor.slice(0, 80)}`);
      }
      resolve();
    });
    req.on("error", () => resolve());
    req.end(JSON.stringify({ aps: { alert: { title: naslov, body: besedilo }, sound: "default" }, objava }));
  })));
  client.close();
  return { ok, mrtvi };
}

const termin = terminOpomnika();
if (!termin) { console.log("Še ni 9:00, nič za poslati."); process.exit(0); }

const objave = (await poizvedba("objave", "objavljeno", "EQUAL", { booleanValue: false }))
  .filter((o) => nujnost(o) && o.kdaj > Date.now() - 30 * 864e5);
let poslanih = 0;
for (const o of objave) {
  const kdo = odgovoren(o);
  if (!kdo) continue;
  const stanje = await api(`/push/${o.id}`);
  if (stanje?.fields?.zadnji?.stringValue === termin) continue;
  const naprave = await poizvedba("naprave", "email", "EQUAL", { stringValue: kdo });
  if (!naprave.length) { console.log("Odgovorna oseba še nima telefona za obvestila."); continue; }
  const m = o.mapa ? await api(`/mape/${encodeURIComponent(o.mapa)}`) : null;
  const mapa = m ? polja(m.fields) : {};
  const zamuda = o.kdaj < Date.now();
  const naslov = `${zamuda ? "Objava zamuja" : "Ne pozabi objave"}: ${mapa.ime || "Objava"}`;
  const kdaj = `${zamuda ? "Bila je" : "Na vrsti je"} ${dan(o.kdaj)} ob ${ura(new Date(o.kdaj))}`;
  const opis = mapa.zaklep ? "" : (o.opis || "").slice(0, 120);
  const besedilo = `${platformeIme(o.platforme)}, ${kdaj.toLowerCase()}${opis ? ` · ${opis}` : ""}. Ko objaviš, jo označi kot objavljeno.`;
  const { ok, mrtvi } = await poslji(naprave.map((n) => n.id), naslov, besedilo, o.id);
  for (const t of mrtvi) await api(`/naprave/${t}`, { method: "DELETE" });
  if (ok) {
    poslanih += ok;
    await api(`/push/${o.id}?updateMask.fieldPaths=zadnji&updateMask.fieldPaths=ob`, {
      method: "PATCH", body: JSON.stringify({ fields: { zadnji: { stringValue: termin }, ob: { integerValue: String(Date.now()) } } })
    });
  }
}
console.log(`Termin ${termin}: utripajočih objav ${objave.length}, poslanih obvestil ${poslanih}.`);
