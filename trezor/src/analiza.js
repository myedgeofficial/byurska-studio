// Napredna analiza trejdov: seje in killzone (po newyorškem času), izvedba, konsistenca,
// overtrading, trejdi po izgubi, simulator pravil in »coach« ugotovitve.
// Brez odvisnosti od brskalnika, da se da preizkusiti v Node.

import { statistika } from "./trejdi.js";

const nyFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" });
// Ura po New Yorku kot decimalno število (npr. 9.5 = 9:30).
export function nyUra(iso) {
  const deli = Object.fromEntries(nyFmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return (+deli.hour % 24) + +deli.minute / 60;
}

// Seje pokrijejo cel dan; killzone so ožja okna (ICT), čas New York.
export const SEJE = [
  ["Azija", 18, 3],
  ["London", 3, 8],
  ["New York", 8, 17],
  ["Zaprto", 17, 18],
];
export const KILLZONE = [
  ["Asia KZ", 20, 24],
  ["London KZ", 2, 5],
  ["NY AM KZ", 8.5, 11],
  ["NY kosilo", 12, 13.5],
  ["NY PM KZ", 13.5, 16],
];
const v = (u, od, doo) => (od < doo ? u >= od && u < doo : u >= od || u < doo);
const vstop = (t) => t.o || t.t;
const krog = (x) => Math.round(x * 100) / 100;
const dan = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function povzetek(trejdi) {
  const n = trejdi.length, p = trejdi.reduce((s, t) => s + t.p, 0), w = trejdi.filter((t) => t.p > 0).length;
  const bruto = trejdi.filter((t) => t.p > 0).reduce((s, t) => s + t.p, 0), izg = -trejdi.filter((t) => t.p < 0).reduce((s, t) => s + t.p, 0);
  return { n, p: krog(p), wr: n ? w / n : 0, pf: izg ? bruto / izg : bruto ? Infinity : 0, povp: n ? p / n : 0 };
}

const minute = (t) => (t.o ? (new Date(t.t) - new Date(t.o)) / 60000 : null);
const povprecje = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

export function napredno(vsi) {
  const trejdi = [...vsi].sort((a, b) => vstop(a).localeCompare(vstop(b)));
  const ure = trejdi.map((t) => nyUra(vstop(t)));
  const seje = SEJE.map(([ime, od, doo]) => ({ ime, od, doo, ...povzetek(trejdi.filter((_, i) => v(ure[i], od, doo))) })).filter((s) => s.n);
  const killzone = KILLZONE.map(([ime, od, doo]) => ({ ime, od, doo, ...povzetek(trejdi.filter((_, i) => v(ure[i], od, doo))) }));
  const izvenKz = povzetek(trejdi.filter((_, i) => !KILLZONE.some(([, od, doo]) => v(ure[i], od, doo))));

  // Toplotna karta: dan v tednu × ura (lokalni čas naprave), po vstopu.
  const toplota = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, p: 0 })));
  for (const t of trejdi) {
    const d = new Date(vstop(t));
    const c = toplota[(d.getDay() + 6) % 7][d.getHours()];
    c.n++;
    c.p = krog(c.p + t.p);
  }

  // Izvedba: koliko časa so odprti dobitki in izgube.
  const zT = trejdi.filter((t) => t.p > 0).map(minute).filter((m) => m != null && m >= 0);
  const pT = trejdi.filter((t) => t.p < 0).map(minute).filter((m) => m != null && m >= 0);
  const izvedba = { dobitki: mediana(zT), izgube: mediana(pT), povpDobitki: povprecje(zT), povpIzgube: povprecje(pT) };
  const trajanja = trejdi.map(minute).filter((m) => m != null && m >= 0);
  const KOSI = [[0, 1, "< 1 min"], [1, 5, "1–5 min"], [5, 15, "5–15 min"], [15, 60, "15–60 min"], [60, 240, "1–4 h"], [240, Infinity, "> 4 h"]];
  const poTrajanju = trajanja.length ? KOSI.map(([od, doo, ime]) => ({ ime, ...povzetek(trejdi.filter((t) => { const m = minute(t); return m != null && m >= od && m < doo; })) })).filter((x) => x.n) : [];

  // Po dnevih: zaporedna številka trejda v dnevu, trejdi po izgubi.
  const poDnevih = new Map();
  for (const t of trejdi) { const k = dan(vstop(t)); if (!poDnevih.has(k)) poDnevih.set(k, []); poDnevih.get(k).push(t); }
  const zapStevilka = [[1, 1, "1."], [2, 3, "2.–3."], [4, 5, "4.–5."], [6, 10, "6.–10."], [11, Infinity, "11.+"]].map(([od, doo, ime]) => ({ ime, od, ...povzetek([...poDnevih.values()].flatMap((a) => a.filter((_, i) => i + 1 >= od && i + 1 <= doo))) })).filter((x) => x.n);
  const poIzgubi = [], poDobitku = [];
  for (const a of poDnevih.values()) for (let i = 1; i < a.length; i++) {
    const prej = a[i - 1], zdaj = a[i];
    const razmik = (new Date(vstop(zdaj)) - new Date(prej.t)) / 60000;
    if (razmik < 0) continue;
    if (prej.p < 0 && razmik <= 15) poIzgubi.push(zdaj);
    else if (prej.p > 0 && razmik <= 15) poDobitku.push(zdaj);
  }
  const stDnevno = [...poDnevih.values()].map((a) => a.length);
  const dnevni = [...poDnevih.entries()].map(([k, a]) => ({ k, n: a.length, p: krog(a.reduce((s, t) => s + t.p, 0)) }));
  const pozitivni = dnevni.filter((d) => d.p > 0), dobicekDni = pozitivni.reduce((s, d) => s + d.p, 0);
  const najDan = pozitivni.reduce((m, d) => (d.p > (m?.p ?? -Infinity) ? d : m), null);
  const povpD = povprecje(dnevni.map((d) => d.p)) || 0;
  const std = dnevni.length > 1 ? Math.sqrt(dnevni.reduce((s, d) => s + (d.p - povpD) ** 2, 0) / (dnevni.length - 1)) : 0;
  const top3 = [...pozitivni].sort((a, b) => b.p - a.p).slice(0, 3).reduce((s, d) => s + d.p, 0);
  const povpN = povprecje(stDnevno) || 0;
  const veliko = dnevni.filter((d) => d.n > povpN * 1.5 && d.n >= 4);
  const konsistenca = {
    najDanDelez: dobicekDni ? najDan.p / dobicekDni : 0, najDan,
    top3Delez: dobicekDni ? top3 / dobicekDni : 0,
    std, povpDan: povpD, sharpeDan: std ? povpD / std : 0,
    povpTrejdov: povpN, maxTrejdov: Math.max(0, ...stDnevno),
    velikoDni: povzetek(veliko.flatMap((d) => poDnevih.get(d.k))), velikoSt: veliko.length,
    normalniDni: povzetek(dnevni.filter((d) => !veliko.includes(d)).flatMap((d) => poDnevih.get(d.k))),
  };

  return { seje, killzone, izvenKz, toplota, izvedba, poTrajanju, zapStevilka, poIzgubi: povzetek(poIzgubi), poDobitku: povzetek(poDobitku), konsistenca, vsi: povzetek(trejdi) };
}

// Simulator: kaj bi bilo, če bi upoštevala pravila. pravila = { maxNaDan, stopPoIzgubah, brezSeje, samoKz }
export function simuliraj(vsi, pravila = {}) {
  const trejdi = [...vsi].sort((a, b) => vstop(a).localeCompare(vstop(b)));
  const ostali = [];
  const dnevi = new Map();
  for (const t of trejdi) {
    const k = dan(vstop(t));
    const d = dnevi.get(k) || { n: 0, izgub: 0 };
    dnevi.set(k, d);
    const u = nyUra(vstop(t));
    if (pravila.brezSeje && SEJE.some(([ime, od, doo]) => ime === pravila.brezSeje && v(u, od, doo))) continue;
    if (pravila.samoKz && !KILLZONE.some(([ime, od, doo]) => ime !== "NY kosilo" && v(u, od, doo))) continue;
    if (pravila.maxNaDan && d.n >= pravila.maxNaDan) continue;
    if (pravila.stopPoIzgubah && d.izgub >= pravila.stopPoIzgubah) continue;
    d.n++;
    if (t.p < 0) d.izgub++;
    ostali.push(t);
  }
  return statistika(ostali);
}

// Ugotovitve, kaj škodi in kaj pomaga (pravila nad številkami, brez zunanje storitve).
export function coach(st, a, evri, odst, dva = false) {
  const skodi = [], pomaga = [];
  const g = (ti, vama) => (dva ? vama : ti);
  const vsiPovp = a.vsi.povp;
  if (a.poIzgubi.n >= 5) {
    (a.poIzgubi.povp < vsiPovp && a.poIzgubi.p < 0 ? skodi : pomaga).push(`Trejdi v 15 min po izgubi (revenge): ${a.poIzgubi.n}×, skupaj ${evri(a.poIzgubi.p)}, uspešnost ${odst(a.poIzgubi.wr)}.`);
  }
  const { izvedba: iz } = a;
  if (iz.izgube != null && iz.dobitki != null && iz.izgube > iz.dobitki * 1.5) skodi.push(`Izgube ${g("držiš", "držita")} dlje kot dobitke (mediana ${trajanje(iz.izgube)} proti ${trajanje(iz.dobitki)}). ${g("Hitreje zapri izgube ali pusti", "Hitreje zaprita izgube ali pustita")} dobitke teči.`);
  else if (iz.izgube != null && iz.dobitki != null && iz.dobitki > iz.izgube * 1.2) pomaga.push(`Dobitke ${g("držiš", "držita")} dlje kot izgube (${trajanje(iz.dobitki)} proti ${trajanje(iz.izgube)}).`);
  const k = a.konsistenca;
  if (k.velikoSt >= 2 && k.velikoDni.povp < k.normalniDni.povp) skodi.push(`Overtrading: na ${k.velikoSt} dneh z veliko trejdi je povprečje ${evri(k.velikoDni.povp)}/trejd, na ostalih ${evri(k.normalniDni.povp)}.`);
  const pozni = a.zapStevilka.filter((z) => z.od >= 4 && z.n >= 5);
  for (const z of pozni) if (z.p < 0) skodi.push(`${z.ime} trejd v dnevu je skupaj ${evri(z.p)} (${z.n}×). ${g("Razmisli", "Razmislita")} o omejitvi trejdov na dan.`);
  const prvi = a.zapStevilka.find((z) => z.od === 1);
  if (prvi && prvi.n >= 5 && prvi.p > 0) pomaga.push(`Prvi trejd v dnevu: ${evri(prvi.p)}, uspešnost ${odst(prvi.wr)}.`);
  const kz = [...a.killzone].filter((x) => x.n >= 5).sort((x, y) => y.p - x.p);
  if (kz.length) pomaga.push(`Najboljša killzona: ${kz[0].ime} (${evri(kz[0].p)}, ${kz[0].n} trejdov).`);
  if (kz.length > 1 && kz[kz.length - 1].p < 0) skodi.push(`Najslabša killzona: ${kz[kz.length - 1].ime} (${evri(kz[kz.length - 1].p)}).`);
  if (a.izvenKz.n >= 5 && a.izvenKz.p < 0) skodi.push(`Trejdi izven killzon: ${evri(a.izvenKz.p)} (${a.izvenKz.n}×).`);
  const seje = [...a.seje].filter((x) => x.n >= 5).sort((x, y) => y.p - x.p);
  if (seje.length > 1 && seje[seje.length - 1].p < 0) skodi.push(`Seja ${seje[seje.length - 1].ime}: ${evri(seje[seje.length - 1].p)}.`);
  const kratki = a.poTrajanju.find((x) => x.ime === "< 1 min");
  if (kratki && kratki.n >= 5 && kratki.p < 0) skodi.push(`Trejdi krajši od 1 minute: ${evri(kratki.p)} (${kratki.n}×). Prehitri vstopi ali izhodi.`);
  if (k.najDanDelez > 0.5) skodi.push(`Najboljši dan je ${odst(k.najDanDelez)} vsega dobička (pravilo konsistence pri prop firmah je pogosto največ 50 %).`);
  else if (k.najDanDelez > 0) pomaga.push(`Konsistenca: najboljši dan je ${odst(k.najDanDelez)} dobička.`);
  return { skodi, pomaga };
}

export function trajanje(m) {
  if (m == null) return "—";
  if (m < 1) return Math.round(m * 60) + " s";
  if (m < 60) return Math.round(m) + " min";
  return (m / 60).toFixed(1).replace(".", ",") + " h";
}

// Tedenski pregled: zadnjih 7 dni proti prejšnjim 7.
export function tedenski(vsi, zdaj = Date.now()) {
  const v7 = vsi.filter((t) => zdaj - new Date(t.t) < 7 * 864e5);
  const p7 = vsi.filter((t) => { const r = zdaj - new Date(t.t); return r >= 7 * 864e5 && r < 14 * 864e5; });
  return { ta: povzetek(v7), prej: povzetek(p7) };
}
