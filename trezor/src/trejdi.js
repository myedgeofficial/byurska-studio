// Zgodovina trejdov: branje izvozov (MetaTrader 5, AMP/CQG/Rithmic, borze kriptovalut) in statistika.
// Brez odvisnosti od brskalnika, da se da preizkusiti v Node.

const NAPIS = {
  cas: /(close|exit|closed|zaprt).*(time|date|čas)|^(close|exit)$|^(time|date|datum|čas)$|date.?time|(time|date)$/,
  sym: /symbol|instrument|contract|pair|market|simbol|ticker/,
  smer: /^type$|side|direction|b\/s|buy.?sell|smer|^action$/,
  kol: /volume|qty|quantity|size|lots?$|količina|^amount$|filled/,
  pnl: /p&l|pnl|p\/l|profit|dobiček|realized|^net$/,
  prov: /commission|fee|provizija/,
  swap: /swap|funding/,
  algo: /magic|expert|strategy|strategija|^comment$|komentar|algo/,
};

const malo = (s) => String(s ?? "").trim().toLowerCase();

export function stevilo(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[()\s '€$£usdtUSDTEUR]/g, "").replace(/^[-+]|-$/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  const zadnjaPika = s.lastIndexOf("."), zadnjaVejica = s.lastIndexOf(",");
  if (zadnjaPika >= 0 && zadnjaVejica >= 0) {
    s = zadnjaVejica > zadnjaPika ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (zadnjaVejica >= 0) {
    // 1,234 (tisočice) ali 12,5 (decimalke)
    s = /,\d{3}$/.test(s) && s.split(",").length > 1 && !/^0,/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function cas(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000)); // Excel
  if (typeof v === "number" && v > 1e9) return new Date(v > 1e12 ? v : v * 1000); // unix
  let s = String(v ?? "").trim();
  if (!s || !/\d/.test(s)) return null;
  // Zamik časovnega pasu na koncu (npr. "+02:00", Topstep): čas pretvorimo v pravi trenutek.
  const z = s.match(/\d:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[ap]m\s*)?(Z|[+-]\d{2}:?\d{2})$/i);
  if (z) {
    const brez = cas(s.slice(0, s.length - z[1].length).trim());
    if (!brez) return null;
    const zamik = /z/i.test(z[1]) ? 0 : (z[1][0] === "-" ? -1 : 1) * (+z[1].slice(1, 3) * 60 + +z[1].slice(-2));
    const utc = Date.UTC(brez.getFullYear(), brez.getMonth(), brez.getDate(), brez.getHours(), brez.getMinutes(), brez.getSeconds());
    return new Date(utc - zamik * 60000);
  }
  let m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (m) {
    let ura = +(m[4] || 0);
    if (m[7]) ura = (ura % 12) + (/pm/i.test(m[7]) ? 12 : 0);
    return new Date(+m[3], +m[1] - 1, +m[2], ura, +(m[5] || 0), +(m[6] || 0));
  }
  const d = new Date(s);
  return isNaN(d) || d.getFullYear() < 1990 ? null : d;
}

// Iz glave tabele ugane stolpce. Vrne { cas, odprto, sym, smer, kol, pnl, prov, swap } (indeksi ali -1).
export function ugani(glava) {
  const g = glava.map(malo);
  const najdi = (re, izloci) => g.map((h, i) => (re.test(h) && !(izloci && izloci.test(h)) ? i : -1)).filter((i) => i >= 0);
  const casi = najdi(/time|date|datum|čas|(entered|exited|opened|closed|filled)_?at$/, /zone|frame|duration/);
  const zapiranje = najdi(/(close|exit|closed|zaprt)/).filter((i) => casi.includes(i));
  const pnl = najdi(NAPIS.pnl, /%|percent|price|cena|gross|rate/);
  const neto = pnl.filter((i) => /net/.test(g[i]));
  const m = {
    cas: zapiranje[0] ?? casi[casi.length - 1] ?? -1,
    odprto: casi.length > 1 ? casi[0] : -1,
    sym: najdi(NAPIS.sym)[0] ?? -1,
    smer: najdi(NAPIS.smer)[0] ?? -1,
    kol: najdi(NAPIS.kol, /price|pnl|profit/)[0] ?? -1,
    pnl: neto[0] ?? pnl[pnl.length - 1] ?? -1,
    prov: najdi(NAPIS.prov)[0] ?? -1,
    provVse: najdi(NAPIS.prov),
    swap: najdi(NAPIS.swap)[0] ?? -1,
    algo: najdi(NAPIS.algo)[0] ?? -1,
  };
  if (m.odprto === m.cas) m.odprto = -1;
  m.neto = neto.length > 0;
  return m;
}

// Iz vrstic (seznam seznamov) poišče tabelo s trejdi. Vrne { glava, vrstice, stolpci }.
export function najdiTabelo(vrstice) {
  let najboljse = null;
  for (let i = 0; i < Math.min(vrstice.length, 400); i++) {
    const g = (vrstice[i] || []).map((c) => String(c ?? ""));
    if (g.filter(Boolean).length < 3) continue;
    const st = ugani(g);
    if (st.cas < 0 || st.pnl < 0) continue;
    const telo = [];
    for (let j = i + 1; j < vrstice.length; j++) {
      const r = vrstice[j] || [];
      if (cas(r[st.cas]) && stevilo(r[st.pnl]) != null) telo.push(r);
      else if (telo.length && r.filter((c) => String(c ?? "").trim()).length >= 3 && !cas(r[st.cas])) break; // konec sekcije
    }
    if (!najboljse || telo.length > najboljse.vrstice.length) najboljse = { glava: g, vrstice: telo, stolpci: st };
  }
  return najboljse;
}

const NI_TREJD = /balance|deposit|withdraw|credit|transfer|bonus|polog|dvig|interest/;

export function vTrejde(vrstice, st) {
  const out = [];
  for (const r of vrstice) {
    const zaprto = cas(r[st.cas]);
    const pnl = stevilo(r[st.pnl]);
    if (!zaprto || pnl == null) continue;
    const smer = malo(r[st.smer]);
    if (NI_TREJD.test(smer) || (st.sym >= 0 && !String(r[st.sym] ?? "").trim() && NI_TREJD.test(malo(r.join(" "))))) continue;
    // Topstep/ProjectX ima ločena stolpca Fees in Commissions, zato seštejemo vse stolpce s stroški.
    const prov = (st.provVse || (st.prov >= 0 ? [st.prov] : [])).reduce((v, i) => { const x = stevilo(r[i]) || 0; return v + (x <= 0 ? x : -x); }, 0);
    const swap = st.swap >= 0 ? stevilo(r[st.swap]) || 0 : 0;
    const odprto = st.odprto >= 0 ? cas(r[st.odprto]) : null;
    out.push({
      t: zaprto.toISOString(),
      o: odprto ? odprto.toISOString() : undefined,
      s: st.sym >= 0 ? String(r[st.sym] ?? "").trim() : "",
      d: /sell|short|prodaj|^s$/.test(smer) ? "sell" : /buy|long|kupi|^b$/.test(smer) ? "buy" : "",
      q: st.kol >= 0 ? Math.abs(stevilo(r[st.kol]) || 0) : undefined,
      a: st.algo >= 0 && String(r[st.algo] ?? "").trim() ? String(r[st.algo]).trim() : undefined,
      p: Math.round((st.neto ? pnl : pnl + prov + swap) * 100) / 100,
    });
  }
  return out;
}

const dan = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const DNEVI = ["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"];
export const MESECI = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"];

function skupina(trejdi, kljuc) {
  const m = new Map();
  for (const t of trejdi) {
    const k = kljuc(t);
    const g = m.get(k) || { k, n: 0, w: 0, p: 0 };
    g.n++;
    g.p += t.p;
    if (t.p > 0) g.w++;
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, p: Math.round(g.p * 100) / 100, wr: g.n ? g.w / g.n : 0 }));
}

export function statistika(vsi) {
  const trejdi = [...vsi].sort((a, b) => a.t.localeCompare(b.t));
  const n = trejdi.length;
  const zmage = trejdi.filter((t) => t.p > 0), porazi = trejdi.filter((t) => t.p < 0);
  const vsota = (a) => a.reduce((s, t) => s + t.p, 0);
  const bruto = vsota(zmage), izguba = -vsota(porazi), neto = bruto - izguba;
  let vrh = 0, kapital = 0, maxDD = 0, ddOd = null, ddDo = null, vrhCas = null;
  const krivulja = [];
  for (const t of trejdi) {
    kapital += t.p;
    if (kapital > vrh) (vrh = kapital), (vrhCas = t.t);
    if (vrh - kapital > maxDD) (maxDD = vrh - kapital), (ddOd = vrhCas), (ddDo = t.t);
    krivulja.push({ t: t.t, v: Math.round(kapital * 100) / 100 });
  }
  let niz = 0, najZ = 0, najP = 0;
  for (const t of trejdi) {
    if (t.p > 0) niz = niz > 0 ? niz + 1 : 1;
    else if (t.p < 0) niz = niz < 0 ? niz - 1 : -1;
    najZ = Math.max(najZ, niz);
    najP = Math.min(najP, niz);
  }
  const lokalno = (t) => new Date(t.t);
  const dnevi = skupina(trejdi, (t) => dan(lokalno(t))).sort((a, b) => a.k.localeCompare(b.k));
  const tedni = skupina(trejdi, (t) => (lokalno(t).getDay() + 6) % 7);
  const ure = skupina(trejdi, (t) => lokalno(t).getHours());
  const meseci = skupina(trejdi, (t) => dan(lokalno(t)).slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k));
  const simboli = skupina(trejdi.filter((t) => t.s), (t) => t.s).sort((a, b) => b.p - a.p);
  const smeri = skupina(trejdi.filter((t) => t.d), (t) => t.d);
  const algoritmi = skupina(trejdi.filter((t) => t.a), (t) => t.a).sort((a, b) => b.p - a.p);
  const trajanja = trejdi.filter((t) => t.o).map((t) => (new Date(t.t) - new Date(t.o)) / 60000).filter((m) => m >= 0);
  const najb = (a, f) => (a.length ? a.reduce((x, y) => (f(y) > f(x) ? y : x)) : null);
  const zelenih = dnevi.filter((d) => d.p > 0).length;
  return {
    n, neto, bruto, izguba,
    zmag: zmage.length, porazov: porazi.length,
    wr: n ? zmage.length / n : 0,
    pf: izguba ? bruto / izguba : bruto ? Infinity : 0,
    povpZ: zmage.length ? bruto / zmage.length : 0,
    povpP: porazi.length ? -izguba / porazi.length : 0,
    pricakovano: n ? neto / n : 0,
    najboljsi: najb(trejdi, (t) => t.p),
    najslabsi: najb(trejdi, (t) => -t.p),
    maxDD, ddOd, ddDo,
    nizZ: najZ, nizP: -najP,
    krivulja, dnevi, tedni, ure, meseci, simboli, smeri, algoritmi,
    najDan: najb(dnevi, (d) => d.p), najslDan: najb(dnevi, (d) => -d.p),
    zelenihDni: dnevi.length ? zelenih / dnevi.length : 0,
    povpDan: dnevi.length ? neto / dnevi.length : 0,
    trajanje: trajanja.length ? trajanja.reduce((a, b) => a + b, 0) / trajanja.length : null,
    od: trejdi[0]?.t, do: trejdi[n - 1]?.t,
  };
}

export const kljucTrejda = (r, t) => `${r}|${t.t}|${t.s}|${t.p}|${t.q ?? ""}`;
