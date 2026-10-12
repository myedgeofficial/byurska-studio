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
export const kdajBesedilo = (ms, zdaj) => `${dan(ms, zdaj)} ob ${ura(new Date(ms))}`;

// Opomniki za eno objavo: ob 9:00 toliko dni prej, kot je izbrano (privzeto 2 in 1), in ob sami uri objave.
export function opomnikiZa(o, imeMape, zdaj = Date.now()) {
  if (!o || o.objavljeno || !o.kdaj) return [];
  const kaj = `${imeMape} na ${platformeIme(o.platforme)}`;
  const d = new Date(o.kdaj);
  const out = [];
  for (const n of [...new Set(o.opomni ?? [2, 1])].sort((a, b) => b - a)) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 9, 0).getTime();
    if (t > zdaj && t < o.kdaj) {
      out.push({ id: `${o.id}-${n}`, kdaj: t, naslov: n === 1 ? "Jutri objava" : `Čez ${n} dni objava`,
        besedilo: `${kaj}, ${kdajBesedilo(o.kdaj, t)}${o.opis ? ` · ${o.opis}` : ""}` });
    }
  }
  if (o.kdaj > zdaj) out.push({ id: `${o.id}-0`, kdaj: o.kdaj, naslov: "Čas za objavo", besedilo: `${kaj}${o.opis ? ` · ${o.opis}` : ""}` });
  return out;
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

export const veljavenEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
