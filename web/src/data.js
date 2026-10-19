// Podatki in pomožne funkcije brez odvisnosti (preizkušene z node --test).

// Kdo ima dostop od začetka. Ostale (npr. Nives) dodaš v aplikaciji pod Nastavitve › Ekipa.
export const ZACETNI_CLANI = { "teo.simonic7@gmail.com": "Teo", "urska.repusic@gmail.com": "Urška", "nives.ploj@gmail.com": "Nives" };

// Mape kot na skici: Byurska.com s podstranmi in Apps z aplikacijami.
export const ZACETNE_MAPE = [
  { id: "byurska", ime: "Byurska.com", oce: null, red: 0, url: "https://byurska.com" },
  { id: "spirituality", ime: "Spiritualitybyurska.com", oce: "byurska", red: 1, url: "https://spiritualitybyurska.com" },
  { id: "art", ime: "Artbyurska.com", oce: "byurska", red: 2, url: "https://artbyurska.com" },
  { id: "climb", ime: "Climbbyurska.com", oce: "byurska", red: 3, url: "https://climbbyurska.com" },
  { id: "finance", ime: "Financebyurska.com", oce: "byurska", red: 4, url: "https://financebyurska.com" },
  { id: "poetry", ime: "Poetrybyurska.com", oce: "byurska", red: 5, url: "https://poetrybyurska.com" },
  { id: "apps", ime: "Apps", oce: null, red: 10 },
  { id: "nakupko", ime: "Nakupko", oce: "apps", red: 11 },
  { id: "manifest", ime: "Manifest", oce: "apps", red: 12 },
  { id: "sentinel", ime: "Sentinel", oce: "apps", red: 13 }
];

// Barve članov za naloge: Teo neon zelena, Nives modra, Urška roza; ostali sivi.
export const BARVE_CLANOV = { "teo.simonic7@gmail.com": "#39ff14", "nives.ploj@gmail.com": "#2e7cf6", "urska.repusic@gmail.com": "#e2459b" };
export const barvaClana = (e) => BARVE_CLANOV[String(e || "").toLowerCase()] || "#98a2b3";
// Komu je naloga: polje »za« (e-pošta) ali prazno = vsem. Stare naloge brez polja so za vse.
export const nalogaZa = (n, email) => !n.za || n.za === String(email || "").toLowerCase();

export const PLATFORME = [["ig", "Instagram"], ["tiktok", "TikTok"]];
export const platformeIme = (p = []) => PLATFORME.filter(([k]) => p.includes(k)).map(([, n]) => n).join(" + ") || "Objava";

// Drevo map: korenske mape po vrstnem redu, vsaka s svojimi podmapami.
export function drevo(mape) {
  const po = (a, b) => (a.red ?? 0) - (b.red ?? 0) || String(a.ime).localeCompare(String(b.ime), "sl");
  return mape.filter((m) => !m.oce).sort(po).map((k) => ({ ...k, otroci: mape.filter((m) => m.oce === k.id).sort(po) }));
}

const DNEVI = ["ned", "pon", "tor", "sre", "čet", "pet", "sob"];
const dvo = (n) => String(n).padStart(2, "0");
export const ura = (d) => `${dvo(d.getHours())}:${dvo(d.getMinutes())}`;
// Pozdrav glede na uro: 5–10 jutro, 10–18 dan, sicer večer.
export const pozdrav = (d = new Date()) => {
  const h = d.getHours();
  return h >= 5 && h < 10 ? "Dobro jutro" : h >= 10 && h < 18 ? "Dober dan" : "Dober večer";
};
const polnoc = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// »danes«, »jutri«, »pojutrišnjem«, »včeraj« ali »pet 17. 10.«
export function dan(ms, zdaj = Date.now()) {
  const d = new Date(ms);
  const razlika = Math.round((polnoc(d) - polnoc(new Date(zdaj))) / 864e5);
  if (razlika === 0) return "danes";
  if (razlika === 1) return "jutri";
  if (razlika === 2) return "pojutrišnjem";
  if (razlika === -1) return "včeraj";
  return `${DNEVI[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}
// Kako nujna je objava: 1 dan prej, na dan in z zamudo »rdeca«, 2 dni prej »oranzna«, dokler ni označena kot objavljena.
export function nujnost(o, zdaj = Date.now()) {
  if (!o || o.objavljeno || !o.kdaj) return "";
  const razlika = Math.round((polnoc(new Date(o.kdaj)) - polnoc(new Date(zdaj))) / 864e5);
  return razlika <= 1 ? "rdeca" : razlika === 2 ? "oranzna" : "";
}
export const kdajBesedilo = (ms, zdaj) => `${dan(ms, zdaj)} ob ${ura(new Date(ms))}`;

// Vsak si sam nastavi, kdaj ga telefon opomni (Nastavitve › Opomniki). Privzeto 2 in 1 dan prej ob 9:00 ter ob uri objave.
export const PRIVZETI_OPOMNIKI = { dni: [2, 1], ura: "09:00", uroPrej: false, obUri: true };

// Opomniki za eno objavo glede na nastavitve tega telefona. Dan 0 = na dan objave (ob izbrani uri, če je pred objavo).
export function opomnikiZa(o, imeMape, zdaj = Date.now(), nast = PRIVZETI_OPOMNIKI) {
  if (!o || o.objavljeno || !o.kdaj) return [];
  const n0 = { ...PRIVZETI_OPOMNIKI, ...nast };
  const kaj = `${imeMape} na ${platformeIme(o.platforme)}`;
  const d = new Date(o.kdaj);
  const [h, m] = String(n0.ura || "09:00").split(":").map(Number);
  const out = [];
  for (const n of [...new Set(n0.dni || [])].sort((a, b) => b - a)) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, h || 0, m || 0).getTime();
    if (t > zdaj && t < o.kdaj) {
      out.push({ id: `${o.id}-${n}`, kdaj: t, naslov: n === 0 ? "Danes objava" : n === 1 ? "Jutri objava" : `Čez ${n} dni objava`,
        besedilo: `${kaj}, ${kdajBesedilo(o.kdaj, t)}${o.opis ? ` · ${o.opis}` : ""}` });
    }
  }
  const uro = o.kdaj - 3600e3;
  if (n0.uroPrej && uro > zdaj) out.push({ id: `${o.id}-h`, kdaj: uro, naslov: "Čez 1 uro objava", besedilo: `${kaj}${o.opis ? ` · ${o.opis}` : ""}` });
  if (n0.obUri && o.kdaj > zdaj) out.push({ id: `${o.id}-0`, kdaj: o.kdaj, naslov: "Čas za objavo", besedilo: `${kaj}${o.opis ? ` · ${o.opis}` : ""}` });
  return out;
}

// Kratek opis nastavitev, npr. »2 dni in 1 dan prej ob 9:00, ob uri objave«.
export function opisOpomnikov(nast = PRIVZETI_OPOMNIKI) {
  const n0 = { ...PRIVZETI_OPOMNIKI, ...nast };
  const dni = [...new Set(n0.dni || [])].sort((a, b) => b - a).map((n) => n === 0 ? "na dan" : n === 1 ? "1 dan prej" : `${n} dni prej`);
  const deli = [];
  if (dni.length) deli.push(`${dni.join(", ")} ob ${n0.ura}`);
  if (n0.uroPrej) deli.push("1 uro prej");
  if (n0.obUri) deli.push("ob uri objave");
  return deli.length ? deli.join(", ") : "brez opomnikov";
}

// Vrsta datoteke za predogled.
export function vrstaDatoteke(tip = "", ime = "") {
  if (tip.startsWith("image/") || /\.(jpe?g|png|heic|gif|webp)$/i.test(ime)) return "slika";
  if (tip.startsWith("video/") || /\.(mov|mp4|m4v)$/i.test(ime)) return "video";
  return "datoteka";
}

export function velikost(b = 0) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} MB`;
  return `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

// Stroški: »12,50«, »12.5 €« ali »1.200,00« → 12.5 / 1200; prazno ali nesmiselno → 0.
export function znesek(v) {
  let t = String(v ?? "").replace(/[€\s]/g, "");
  if (/,/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}
export function evri(n = 0) {
  const [cel, dec] = (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).split(".");
  return `${cel.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
}

// »Spiritualitybyurska.com« → { ime: "Spirituality", pod: "byurska.com" }; ostala imena ostanejo.
export function kratkoIme(ime = "") {
  const m = /^(.+?)(by?urska\.com)$/i.exec(String(ime).trim());
  if (!m) return { ime: String(ime), pod: "" };
  return { ime: m[1].charAt(0).toUpperCase() + m[1].slice(1), pod: m[2].toLowerCase() };
}

// 1 naloga, 2 nalogi, 3 naloge, 5 nalog (slovenska dvojina).
export function stevilo(n, [ena, dve, tri, pet]) {
  const d = n % 100;
  return `${n} ${d === 1 ? ena : d === 2 ? dve : d === 3 || d === 4 ? tri : pet}`;
}

// Datoteka .ics za koledar na računalniku (Apple Koledar, Outlook, Google). Alarmi v minutah pred začetkom.
export function ics({ uid, naslov, opis = "", zacetek, alarmi = [] }) {
  const t = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const besedilo = (x) => String(x).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const v = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Byurska Studio//SL", "BEGIN:VEVENT", `UID:${uid}@byurska-studio`, `DTSTAMP:${t(Date.now())}`,
    `DTSTART:${t(zacetek)}`, `DTEND:${t(zacetek + 30 * 60e3)}`, `SUMMARY:${besedilo(naslov)}`];
  if (opis) v.push(`DESCRIPTION:${besedilo(opis)}`);
  for (const m of [...new Set(alarmi)].filter((m) => m >= 0)) v.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${besedilo(naslov)}`, `TRIGGER:-PT${m}M`, "END:VALARM");
  v.push("END:VEVENT", "END:VCALENDAR");
  return v.join("\r\n") + "\r\n";
}

export const veljavenEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
