// Statistika spletnih strani (stats.remako.si): čista logika brez baze, da jo lahko preizkusimo (test/stat.test.js).
// Števec ne uporablja piškotkov ne shrambe v brskalniku: obiskovalca prepoznamo samo znotraj dneva
// po zgoščeni vrednosti (dnevna sol + IP + brskalnik + stran), surovega IP-ja ne shranimo.
import crypto from "node:crypto";

// Domena → kratko ime strani. Kar ni na seznamu, števec zavrne.
export const STRANI = {
  "myedgeofficial.com": "myedge", "www.myedgeofficial.com": "myedge",
  "remako.si": "remako", "www.remako.si": "remako",
  "nakupko.com": "nakupko", "www.nakupko.com": "nakupko",
  "byurska.com": "byurska", "www.byurska.com": "byurska",
};
export const IMENA = { myedge: "myedgeofficial.com", remako: "remako.si", nakupko: "nakupko.com", byurska: "byurska.com" };

export const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|python|curl|wget|httpclient|axios|node-fetch|go-http|java\/|phantom|selenium|puppeteer|playwright/i;

// Vir obiska iz referrerja in utm_source. Vrne [skupina, podrobno] ali null za notranji klik (ista stran).
const AI = [["chatgpt", "ChatGPT"], ["chat.openai", "ChatGPT"], ["openai", "ChatGPT"], ["perplexity", "Perplexity"], ["claude", "Claude"],
  ["anthropic", "Claude"], ["gemini", "Gemini"], ["bard.google", "Gemini"], ["copilot", "Copilot"], ["deepseek", "DeepSeek"], ["grok", "Grok"],
  ["you.com", "You.com"], ["phind", "Phind"], ["meta.ai", "Meta AI"], ["chat.mistral", "Le Chat"], ["poe.com", "Poe"]];
const ISKALNIKI = [["google", "Google"], ["bing", "Bing"], ["duckduckgo", "DuckDuckGo"], ["yahoo", "Yahoo"], ["ecosia", "Ecosia"],
  ["yandex", "Yandex"], ["seznam", "Seznam"], ["search.brave", "Brave"], ["startpage", "Startpage"], ["qwant", "Qwant"], ["baidu", "Baidu"],
  ["najdi.si", "Najdi.si"]];
const DRUZBENA = [["facebook", "Facebook"], ["fb.com", "Facebook"], ["fb.me", "Facebook"], ["instagram", "Instagram"], ["t.co", "X"], ["twitter", "X"], ["x.com", "X"],
  ["linkedin", "LinkedIn"], ["lnkd", "LinkedIn"], ["tiktok", "TikTok"], ["reddit", "Reddit"], ["youtube", "YouTube"], ["youtu.be", "YouTube"],
  ["pinterest", "Pinterest"], ["threads", "Threads"], ["telegram", "Telegram"], ["t.me", "Telegram"], ["whatsapp", "WhatsApp"],
  ["discord", "Discord"], ["snapchat", "Snapchat"], ["tradingview", "TradingView"]];

// Ključ se ujema s celim delom domene (google → www.google.si), nikoli s koščkom besede (t.co ≠ microsoft.com).
const ujema = (h, k) => h === k || h.endsWith("." + k) || h.startsWith(k + ".") || h.split(".").includes(k);
const najdi = (seznam, besedilo) => (seznam.find(([k]) => ujema(besedilo, k)) || [])[1];
const osnova = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

export function vir(referrer, utm, gostitelj) {
  let host = "";
  try { host = referrer ? new URL(referrer).hostname.toLowerCase() : ""; } catch { host = ""; }
  if (host && osnova(host) === osnova(gostitelj)) return null;
  const u = String(utm || "").toLowerCase().slice(0, 60);
  for (const x of [u, host]) {
    if (!x) continue;
    const ai = najdi(AI, x);
    if (ai) return ["AI", ai];
  }
  for (const x of [host, u]) {
    if (!x) continue;
    const s = najdi(ISKALNIKI, x);
    if (s) return ["Iskalniki", s];
    const d = najdi(DRUZBENA, x);
    if (d) return ["Družbena omrežja", d];
  }
  if (!host && !u) return ["Neposredno", "Neposredno"];
  return ["Drugo", osnova(host) || u];
}

export function naprava(ua, sirina) {
  const s = String(ua || "");
  const tip = /iPad|Tablet|PlayBook|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s)) ? "Tablica"
    : /Mobi|iPhone|iPod|Android/i.test(s) || (sirina && sirina < 700) ? "Telefon" : "Računalnik";
  const os = /iPhone|iPad|iPod/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "macOS" : /CrOS/.test(s) ? "ChromeOS" : /Linux/.test(s) ? "Linux" : "Drugo";
  const brskalnik = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung" : /Firefox|FxiOS/.test(s) ? "Firefox"
    : /CriOS|Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Drugo";
  return { tip, os, brskalnik };
}

// Država iz časovnega pasu brskalnika (brez IP baze), sicer iz regije jezika (sl-SI → SI).
const PASOVI = {
  Ljubljana: "SI", Zagreb: "HR", Belgrade: "RS", Sarajevo: "BA", Skopje: "MK", Podgorica: "ME", Vienna: "AT", Budapest: "HU", Rome: "IT",
  Berlin: "DE", Busingen: "DE", Zurich: "CH", Paris: "FR", Madrid: "ES", Lisbon: "PT", London: "GB", Dublin: "IE", Amsterdam: "NL",
  Brussels: "BE", Luxembourg: "LU", Copenhagen: "DK", Stockholm: "SE", Oslo: "NO", Helsinki: "FI", Warsaw: "PL", Prague: "CZ",
  Bratislava: "SK", Bucharest: "RO", Sofia: "BG", Athens: "GR", Istanbul: "TR", Kiev: "UA", Kyiv: "UA", Moscow: "RU", Minsk: "BY",
  Vilnius: "LT", Riga: "LV", Tallinn: "EE", Malta: "MT", Nicosia: "CY", Tirane: "AL", Chisinau: "MD", Monaco: "MC", Andorra: "AD",
  Reykjavik: "IS", Gibraltar: "GI", Vaduz: "LI", San_Marino: "SM", Vatican: "VA",
  New_York: "US", Chicago: "US", Denver: "US", Los_Angeles: "US", Phoenix: "US", Anchorage: "US", Honolulu: "US", Detroit: "US",
  Indiana: "US", Boise: "US", Toronto: "CA", Vancouver: "CA", Edmonton: "CA", Winnipeg: "CA", Halifax: "CA", Montreal: "CA", Regina: "CA",
  St_Johns: "CA", Mexico_City: "MX", Cancun: "MX", Tijuana: "MX", Monterrey: "MX", Sao_Paulo: "BR", Bahia: "BR", Fortaleza: "BR",
  Buenos_Aires: "AR", Santiago: "CL", Bogota: "CO", Lima: "PE", Caracas: "VE", Montevideo: "UY", Panama: "PA", Costa_Rica: "CR",
  Puerto_Rico: "PR", Santo_Domingo: "DO", Havana: "CU", Guatemala: "GT",
  Dubai: "AE", Riyadh: "SA", Qatar: "QA", Kuwait: "KW", Bahrain: "BH", Tehran: "IR", Baghdad: "IQ", Jerusalem: "IL", Tel_Aviv: "IL",
  Amman: "JO", Beirut: "LB", Karachi: "PK", Kolkata: "IN", Calcutta: "IN", Dhaka: "BD", Kathmandu: "NP", Colombo: "LK", Bangkok: "TH",
  Ho_Chi_Minh: "VN", Saigon: "VN", Jakarta: "ID", Kuala_Lumpur: "MY", Singapore: "SG", Manila: "PH", Hong_Kong: "HK", Shanghai: "CN",
  Taipei: "TW", Seoul: "KR", Tokyo: "JP", Tbilisi: "GE", Yerevan: "AM", Baku: "AZ", Almaty: "KZ", Tashkent: "UZ",
  Sydney: "AU", Melbourne: "AU", Brisbane: "AU", Perth: "AU", Adelaide: "AU", Auckland: "NZ",
  Cairo: "EG", Johannesburg: "ZA", Lagos: "NG", Nairobi: "KE", Casablanca: "MA", Algiers: "DZ", Tunis: "TN", Accra: "GH", Addis_Ababa: "ET",
};
export function drzava(tz, jezik) {
  const t = String(tz || "");
  const mesto = t.split("/").slice(1).join("/").split("/")[0];
  if (PASOVI[mesto]) return PASOVI[mesto];
  const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})$/.exec(String(jezik || "").trim());
  return m ? m[1].toUpperCase() : "?";
}

export function pot(p) {
  let s = String(p || "/").split("?")[0].split("#")[0].slice(0, 120).toLowerCase();
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
}

export const zgosti = (...deli) => crypto.createHash("sha256").update(deli.join("|")).digest("base64url").slice(0, 22);

// Dan po slovenskem času (YYYY-MM-DD).
export const danLj = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });
export const dodajDni = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Stripe: mesečni znesek naročnine (MRR) v centih, ne glede na obdobje cene.
export function mesecno(cena, kolicina = 1) {
  const r = cena?.recurring;
  if (!r || cena.unit_amount == null) return 0;
  const n = r.interval_count || 1, z = cena.unit_amount * (kolicina || 1);
  return r.interval === "year" ? z / (12 * n) : r.interval === "week" ? z * 52 / (12 * n) : r.interval === "day" ? z * 365 / (12 * n) : z / n;
}

// Povzetek naročnin iz seznama Stripe naročnin (status=all).
export function narocnine(subs, imeIzdelka = (id) => id) {
  const izid = { aktivne: 0, preizkus: 0, mrr: {}, poIzdelku: {}, noveNaDan: {}, preklicaneNaDan: {} };
  for (const s of subs) {
    const dan = danLj(new Date(s.created * 1000));
    izid.noveNaDan[dan] = (izid.noveNaDan[dan] || 0) + 1;
    if (s.canceled_at) { const d = danLj(new Date(s.canceled_at * 1000)); izid.preklicaneNaDan[d] = (izid.preklicaneNaDan[d] || 0) + 1; }
    if (!["active", "trialing", "past_due"].includes(s.status)) continue;
    if (s.status === "trialing") izid.preizkus++; else izid.aktivne++;
    for (const it of s.items?.data || []) {
      const c = it.price || {}, val = (c.currency || "eur").toUpperCase();
      const ime = imeIzdelka(typeof c.product === "string" ? c.product : c.product?.id);
      const p = izid.poIzdelku[ime] = izid.poIzdelku[ime] || { aktivne: 0, mrr: {} };
      p.aktivne++;
      if (s.status !== "trialing") {
        const m = mesecno(c, it.quantity);
        izid.mrr[val] = (izid.mrr[val] || 0) + m;
        p.mrr[val] = (p.mrr[val] || 0) + m;
      }
    }
  }
  for (const o of [izid.mrr, ...Object.values(izid.poIzdelku).map((p) => p.mrr)]) for (const k in o) o[k] = Math.round(o[k]);
  return izid;
}

// Obdrži samo največjih n ključev zemljevida (npr. 30 najbolj obiskanih strani).
export function vrh(obj, n = 30) {
  return Object.fromEntries(Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n));
}

// Dnevni dokument števca → zapis v povzetku (kratka imena polj, da je povzetek majhen).
export function dnevniZapis(d, polno = true) {
  const z = { o: d.ogledi || 0, v: d.obiskovalci || 0, b: d.odboji || 0, cs: d.casSum || 0, cn: d.casN || 0 };
  if (polno) for (const k of ["poti", "viri", "vir2", "drzave", "naprave", "os", "brskalniki", "vstopi"]) if (d[k]) z[k] = vrh(d[k], 20);
  return z;
}
