// REMAKO banka (remako-trezor): spletna push obvestila za naloge med Teom in Timom.
// Naloge so šifrirane v brskalniku; stran zapiše v »trezor-obvestila« samo kdo, komu, vrsto in čas.
// Ob zapisu pošljemo takoj (nova naloga, opravljeno, preizkus), opomnike pa urnik vsako minuto. Poslano izbrišemo.
import webpush from "web-push";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const IME = { "teo.simonic7@gmail.com": "Teo", "tim.petrovic@gmail.com": "Tim" };
const BESEDILO = {
  nova: (od) => [`Nova naloga od ${od}`, "Odpri REMAKO banko in poglej Naloge."],
  opomnik: () => ["Opomnik: naloga čaka", "Odpri REMAKO banko in poglej Naloge."],
  opravljeno: (od) => [`${od} je opravil nalogo`, "Odpri REMAKO banko in poglej Naloge."],
  test: () => ["Obvestila delujejo", "Tako boš dobil nove naloge in opomnike."],
};

let vapid = false;
function pripravi() {
  if (!process.env.TREZOR_VAPID_PRIVATE) return false;
  if (!vapid) webpush.setVapidDetails("mailto:support@remako.si", process.env.TREZOR_VAPID_PUBLIC, process.env.TREZOR_VAPID_PRIVATE);
  return (vapid = true);
}

async function poslji(snap) {
  const db = getFirestore();
  const o = snap.data();
  const [naslov, besedilo] = (BESEDILO[o.vrsta] || BESEDILO.opomnik)(IME[o.od] || "Ekipa");
  const naprave = await db.collection("trezor-naprave").where("email", "==", o.komu).get();
  let ok = 0;
  await Promise.all(naprave.docs.map(async (n) => {
    try {
      await webpush.sendNotification(n.data().sub, JSON.stringify({ naslov, besedilo, url: "./#naloge", tag: snap.id }), { TTL: 86400, urgency: "high" });
      ok++;
    } catch (e) {
      // Naprava se je odjavila ali naročnina ne velja več.
      if (e.statusCode === 404 || e.statusCode === 410) await n.ref.delete();
      else console.error(`Push ${n.id}: ${e.statusCode} ${e.body || e.message}`);
    }
  }));
  await snap.ref.delete();
  console.log(`Trezor ${snap.id}: ${o.vrsta} za ${IME[o.komu] || "?"}, poslano na ${ok}/${naprave.size} naprav.`);
}

export const trezorObvestilo = onDocumentWritten({ document: "trezor-obvestila/{id}", region: "europe-west1" }, async (e) => {
  const s = e.data?.after;
  if (!s?.exists || !pripravi()) return;
  if (s.data().kdaj.toMillis() <= Date.now() + 30000) await poslji(s);
});

export const trezorOpomniki = onSchedule({ schedule: "every 1 minutes", timeZone: "Europe/Ljubljana", region: "europe-west1" }, async () => {
  if (!pripravi()) return;
  const zapadli = await getFirestore().collection("trezor-obvestila").where("kdaj", "<=", Timestamp.now()).get();
  for (const s of zapadli.docs) await poslji(s);
});
