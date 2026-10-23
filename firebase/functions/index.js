// Opomniki za objave, ki utripajo: osebi, ki mora objavo narediti, ob 9:00 in 18:00 po slovenskem času,
// dokler objava ni označena kot objavljena. Teče v Firebase (Cloud Scheduler), ker GitHubov urnik zamuja za ure.
// data.js je kopija web/src/data.js (workflow firebase.yml jo skopira pred objavo).
process.env.TZ = "Europe/Ljubljana";
import crypto from "node:crypto";
import http2 from "node:http2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { nujnost, odgovoren, terminOpomnika, platformeIme, dan, ura, vidiObjave } from "./data.js";

initializeApp();
const db = getFirestore();
const TOPIC = process.env.APNS_TOPIC || "com.byurska.studio";

function apnsJwt() {
  const glava = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID })).toString("base64url");
  const telo = Buffer.from(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const kljuc = Buffer.from(process.env.APNS_KEY_B64 || "", "base64").toString("utf8");
  const podpis = crypto.sign("sha256", Buffer.from(`${glava}.${telo}`), { key: kljuc, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${glava}.${telo}.${podpis}`;
}

// Pošlje obvestilo na vse žetone; vrne število poslanih in žetone, ki jih Apple ne pozna več.
async function poslji(zetoni, naslov, besedilo, objava) {
  const client = http2.connect("https://api.push.apple.com"), jwt = apnsJwt(), mrtvi = [];
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

export const opomnikiObjav = onSchedule({ schedule: "0 9,18 * * *", timeZone: "Europe/Ljubljana", region: "europe-west1" }, async () => {
  const termin = terminOpomnika();
  if (!termin || !process.env.APNS_KEY_B64) return;
  const objave = (await db.collection("objave").where("objavljeno", "==", false).get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => nujnost(o) && o.kdaj > Date.now() - 30 * 864e5);
  let poslanih = 0;
  for (const o of objave) {
    const kdo = odgovoren(o);
    if (!kdo || !vidiObjave(kdo)) continue;
    const stanje = db.doc(`push/${o.id}`);
    if ((await stanje.get()).data()?.zadnji === termin) continue;
    const naprave = (await db.collection("naprave").where("email", "==", kdo).get()).docs.map((d) => d.id);
    if (!naprave.length) continue;
    const mapa = o.mapa ? (await db.doc(`mape/${o.mapa}`).get()).data() || {} : {};
    const zamuda = o.kdaj < Date.now();
    const naslov = `${zamuda ? "Objava zamuja" : "Ne pozabi objave"}: ${mapa.ime || "Objava"}`;
    const kdaj = `${zamuda ? "bila je" : "na vrsti je"} ${dan(o.kdaj)} ob ${ura(new Date(o.kdaj))}`;
    const opis = mapa.zaklep ? "" : (o.opis || "").slice(0, 120);
    const besedilo = `${platformeIme(o.platforme)}, ${kdaj}${opis ? ` · ${opis}` : ""}. Ko objaviš, jo označi kot objavljeno.`;
    const { ok, mrtvi } = await poslji(naprave, naslov, besedilo, o.id);
    await Promise.all(mrtvi.map((t) => db.doc(`naprave/${t}`).delete()));
    if (ok) { poslanih += ok; await stanje.set({ zadnji: termin, ob: Date.now() }, { merge: true }); }
  }
  console.log(`Termin ${termin}: utripajočih objav ${objave.length}, poslanih obvestil ${poslanih}.`);
});
