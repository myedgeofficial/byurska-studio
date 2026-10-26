// REMAKO Algo Lab: samodejna analiza strategije in predlogi izboljšav (čista logika, testi v test/algo.test.js).
// Vse številke so iz zaključenih pozicij po stroških (ne iz poslov). Predlogi so hipoteze za preizkus v Strategy Testerju
// in na demo, nikoli samodejna sprememba. Pod mejo vzorca predlogov ne damo: pri malo trejdih je vse lahko naključje.
import { pozicije } from "./algo-jedro.js";

export const MIN_SKUPAJ = 30, MIN_SKUPINA = 10;
const DNEVI = ["pon", "tor", "sre", "čet", "pet", "sob", "ned"];
const r2 = (x) => Math.round(x * 100) / 100;

// Wilsonov 95-% interval uspešnosti: pri malo trejdih je širok in pokaže, koliko številki lahko zaupamo.
export function wilson(k, n) {
  if (!n) return [0, 1];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, w = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, r2(c - w)), Math.min(1, r2(c + w))];
}

export function statistika(poz) {
  const n = poz.length, dob = poz.filter((p) => p.net > 0), izg = poz.filter((p) => p.net < 0);
  const vsota = (a, k = "net") => r2(a.reduce((x, p) => x + p[k], 0));
  const bruto = vsota(poz, "profit"), stroski = r2(vsota(poz, "commission") + vsota(poz, "swap") + vsota(poz, "fee"));
  let vrh = 0, kap = 0, dd = 0, niz = 0, najNiz = 0;
  for (const p of [...poz].sort((a, b) => a.zaprto_msc - b.zaprto_msc)) {
    kap += p.net; vrh = Math.max(vrh, kap); dd = Math.max(dd, vrh - kap);
    niz = p.net < 0 ? niz + 1 : 0; najNiz = Math.max(najNiz, niz);
  }
  const povpT = (a) => (a.length ? Math.round(a.reduce((x, p) => x + (p.trajanje_s || 0), 0) / a.length) : null);
  const sDob = vsota(dob), sIzg = -vsota(izg);
  return { n, dobicki: dob.length, izgube: izg.length, uspesnost: n ? r2(dob.length / n) : 0, interval: wilson(dob.length, n),
    neto: vsota(poz), bruto, stroski, pf: sIzg ? r2(sDob / sIzg) : null,
    povp_dobicek: dob.length ? r2(sDob / dob.length) : 0, povp_izguba: izg.length ? r2(sIzg / izg.length) : 0,
    pricakovano: n ? r2(vsota(poz) / n) : 0, max_padec: r2(dd), najdaljsi_niz_izgub: najNiz,
    trajanje_dobicki_s: povpT(dob), trajanje_izgube_s: povpT(izg) };
}
const razdeli = (poz, kljuc) => {
  const m = new Map();
  for (const p of poz) { const k = kljuc(p); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
  return m;
};
const kratko = (m) => [...m.entries()].map(([k, a]) => ({ k, n: a.length, neto: r2(a.reduce((x, p) => x + p.net, 0)), uspesnost: r2(a.filter((p) => p.net > 0).length / a.length) }));

// Zavrnitve EA (decision) z razlago, kaj preveriti.
export const ODLOCITVE = {
  spread_or_tick_size: "Spread je bil prevelik (MaxSpreadTicks) ali tik neveljaven. Preveri ure z velikim spreadom (odprtje, novice, noč) in okno EntryStart/EntryEnd.",
  invalid_or_stale_quote: "Cena je bila zastarela. Pogosto slaba povezava ali premalo likvidnosti ob tej uri. Preveri internet/VPS in MaxTickAgeSeconds.",
  expired_signal_bar: "Signal je prišel prepozno po odprtju sveče (MaxSignalDelaySeconds). Preveri, ali je bil računalnik/MT5 obremenjen ali brez povezave.",
  minimum_volume_exceeds_risk: "Najmanjša količina pri brokerju že preseže dovoljeno tveganje. Stop je predaleč za ta znesek: manjši instrument (mikro), bližji stop ali večji RiskMoney na demo.",
  outside_entry_session: "Signali izven okna trgovanja. Če jih je veliko, preveri, ali je okno (strežniški čas borze) pravilno nastavljeno.",
  insufficient_margin_reserve: "Premalo proste marže. Na demo povečaj virtualni kapital ali zmanjšaj MaxVolume.",
  daily_loss_limit: "Dosežen dnevni limit izgube. Poglej, kateri trejdi so ga sprožili (ura, smer).",
  daily_entry_limit: "Dosežen dnevni limit vstopov. Če so kasnejši signali dobri, je limit morda prenizek; če slabi, pomaga.",
  symbol_already_has_position_or_order: "Novi signali med odprto pozicijo so zavrnjeni (ni obračanja). Normalno; če je pogosto, strategija drži pozicije dolgo.",
  broker_precheck_rejected: "Broker je zavrnil predpreverjanje. Preveri sporočilo v časovnici (stopi, količina, način polnjenja).",
  invalid_stop_distance: "Stop je preblizu ali predaleč glede na pravila brokerja (stops level).",
  account_or_algo_trading_not_authorized: "Algo trgovanje ni dovoljeno (gumb Algo Trading v MT5 ali nastavitve EA).",
};

function predlogiSkupine(st, poz, oznaka) {
  const p = [];
  const dodaj = (raven, naslov, besedilo) => p.push({ raven, naslov, besedilo });
  if (st.n < MIN_SKUPAJ) {
    dodaj("info", "Premalo podatkov", `${oznaka}: ${st.n} zaključenih trejdov. Za zanesljive sklepe jih rabimo vsaj ${MIN_SKUPAJ}; uspešnost je zdaj nekje med ${Math.round(st.interval[0] * 100)} in ${Math.round(st.interval[1] * 100)} %. Nadaljuj na demo in strategije zaradi teh številk še ne spreminjaj.`);
    return p;
  }
  if (st.pricakovano < 0) dodaj("opozorilo", "Strategija po stroških izgublja", `${oznaka}: povprečno ${st.pricakovano} na trejd po stroških (${st.n} trejdov, PF ${st.pf ?? "∞"}). Najprej preveri pravila vstopa v Strategy Testerju, šele nato fino nastavljanje.`);
  if (st.bruto > 0 && -st.stroski / st.bruto > 0.3) dodaj("predlog", "Stroški pojedo velik del dobička", `Provizije, swap in fee so ${Math.round((-st.stroski / st.bruto) * 100)} % bruto dobička. Preizkusi manj trejdov (strožji filter), večji cilj (rr) ali cenejši instrument.`);
  const zlom = st.povp_dobicek + st.povp_izguba ? st.povp_izguba / (st.povp_dobicek + st.povp_izguba) : 0;
  if (st.povp_izguba > st.povp_dobicek && st.uspesnost < zlom + 0.05)
    dodaj("predlog", "Izgube so večje od dobičkov", `Povprečna izguba ${st.povp_izguba} je večja od povprečnega dobička ${st.povp_dobicek}, uspešnost ${Math.round(st.uspesnost * 100)} % pa razlike ne pokrije dovolj (preboj pri ~${Math.round(zlom * 100)} %). Preizkusi večji rr ali bližji stop (stop_atr).`);
  if (st.trajanje_izgube_s && st.trajanje_dobicki_s && st.trajanje_izgube_s > 2 * st.trajanje_dobicki_s && st.izgube >= MIN_SKUPINA)
    dodaj("predlog", "Izgubni trejdi trajajo predolgo", `Izgube v povprečju trajajo ${Math.round(st.trajanje_izgube_s / 60)} min, dobički ${Math.round(st.trajanje_dobicki_s / 60)} min. Preizkusi časovni izstop (zapri po X svečah brez napredka).`);
  const ure = kratko(razdeli(poz, (x) => x.ura)).filter((u) => u.n >= MIN_SKUPINA && u.neto < 0).sort((a, b) => a.neto - b.neto);
  if (ure.length && st.neto > 0) dodaj("predlog", "Slabe ure", `Ure (strežniški čas borze) z izgubo: ${ure.slice(0, 3).map((u) => `${u.k}:00 (${u.n} trejdov, ${u.neto})`).join(", ")}. Preizkusi okno EntryStart/EntryEnd brez teh ur.`);
  const dnevi = kratko(razdeli(poz, (x) => x.dan)).filter((d) => d.n >= MIN_SKUPINA && d.neto < 0).sort((a, b) => a.neto - b.neto);
  if (dnevi.length && st.neto > 0) dodaj("predlog", "Slabi dnevi", `Dnevi z izgubo: ${dnevi.slice(0, 2).map((d) => `${DNEVI[d.k]} (${d.n} trejdov, ${d.neto})`).join(", ")}. Preizkusi brez teh dni, če ostane dovolj trejdov.`);
  const smer = Object.fromEntries(kratko(razdeli(poz, (x) => x.smer)).map((x) => [x.k, x]));
  if (smer.BUY?.n >= 15 && smer.SELL?.n >= 15 && Math.sign(smer.BUY.neto) !== Math.sign(smer.SELL.neto)) {
    const slaba = smer.BUY.neto < 0 ? "BUY" : "SELL";
    dodaj("predlog", `${slaba} stran izgublja`, `BUY: ${smer.BUY.n} trejdov, ${smer.BUY.neto}; SELL: ${smer.SELL.n} trejdov, ${smer.SELL.neto}. Preizkusi filter trenda (npr. samo v smeri višjega časovnega okvira), preden izklopiš eno stran.`);
  }
  const sl = poz.filter((x) => x.izhod_razlog === "SL").length;
  if (sl / st.n > 0.6) dodaj("predlog", "Večina trejdov konča na stopu", `${Math.round((sl / st.n) * 100)} % izstopov je na SL. Vstop je morda prezgoden ali stop preblizu šuma (preizkusi večji stop_atr z enakim tveganjem v denarju).`);
  if (st.najdaljsi_niz_izgub >= 8) dodaj("opozorilo", "Dolg niz izgub", `Najdaljši niz izgub: ${st.najdaljsi_niz_izgub}. Preveri, ali dnevni limit in velikost tveganja preneseta tak niz.`);
  if (!p.length) dodaj("info", "Nič izrazitega", `${oznaka}: ${st.n} trejdov, brez očitne šibke točke po urah, dnevih, smeri ali stroških. Nadaljuj zbiranje podatkov.`);
  return p;
}

// odlocitve: dnevni števci [{ bot_id, environment, dan: "YYYY-MM-DD", kode: { koda: n }, signali }]
export function analiza(posli, odlocitve = [], zdaj = Date.now()) {
  const zaprte = pozicije(posli).filter((p) => p.status === "zaprta");
  const skupine = [];
  for (const [k, poz] of razdeli(zaprte, (p) => [p.bot_id, p.environment, p.mode, p.currency].join("|"))) {
    const [bot_id, environment, mode, currency] = k.split("|");
    const st = statistika(poz);
    skupine.push({ bot_id, environment, mode, currency, ...st,
      po_verzijah: [...razdeli(poz, (p) => `${p.strategy_id}·${p.strategy_version}`)].map(([verzija, a]) => ({ verzija, ...statistika(a) })),
      po_urah: kratko(razdeli(poz, (p) => p.ura)).sort((a, b) => a.k - b.k),
      po_dnevih: kratko(razdeli(poz, (p) => p.dan)).sort((a, b) => a.k - b.k).map((d) => ({ ...d, ime: DNEVI[d.k] })),
      po_smeri: kratko(razdeli(poz, (p) => p.smer)), po_izhodu: kratko(razdeli(poz, (p) => p.izhod_razlog)),
      predlogi: predlogiSkupine(st, poz, `${bot_id} (${environment === "tester" ? "Tester" : "MT5"} ${mode}, ${currency})`) });
  }
  // Signali in zavrnitve zadnjih 30 dni po botu in okolju (tudi v SHADOW, ko poslov še ni).
  const meja = new Date(zdaj - 30 * 86400000).toISOString().slice(0, 10);
  const zbir = new Map();
  for (const o of odlocitve.filter((x) => x.dan >= meja)) {
    const k = `${o.bot_id}|${o.environment}`;
    if (!zbir.has(k)) zbir.set(k, { bot_id: o.bot_id, environment: o.environment, signali: 0, kode: {} });
    const z = zbir.get(k);
    z.signali += o.signali || 0;
    for (const [koda, n] of Object.entries(o.kode || {})) z.kode[koda] = (z.kode[koda] || 0) + n;
  }
  const odl = [...zbir.values()].map((z) => {
    const predlogi = [];
    for (const [koda, n] of Object.entries(z.kode).sort((a, b) => b[1] - a[1])) {
      if (!ODLOCITVE[koda] || n < 3) continue;
      const delez = z.signali ? n / z.signali : null;
      predlogi.push({ raven: delez != null && delez > 0.25 ? "opozorilo" : "predlog", naslov: `${koda}: ${n}×${delez != null ? ` (${Math.round(delez * 100)} % signalov)` : ""}`, besedilo: ODLOCITVE[koda] });
    }
    const zavrnjenih = Object.entries(z.kode).filter(([k]) => !k.startsWith("shadow_")).reduce((x, [, n]) => x + n, 0);
    return { ...z, zavrnjenih, shadow_bi_poslal: z.kode.shadow_would_send || 0, predlogi };
  });
  return { as_of_utc: new Date(zdaj).toISOString().replace(/\.\d{3}Z$/, "Z"), skupine, odlocitve: odl, meja_vzorca: MIN_SKUPAJ,
    opomba: "Analiza zaključenih pozicij po stroških. Predlogi so ideje za preizkus v Strategy Testerju in na demo, ne zagotovilo in ne samodejna sprememba. Ure in dnevi so po strežniškem času borze." };
}

// Kratek povzetek dneva za dnevno poročilo (po valuti in okolju posebej).
export function dnevniPovzetek(posli, dan) {
  const zaprte = pozicije(posli).filter((p) => p.status === "zaprta" && p.zaprto_msc != null && new Date(p.zaprto_msc).toISOString().slice(0, 10) === dan);
  return [...razdeli(zaprte, (p) => [p.bot_id, p.environment, p.mode, p.currency].join("|"))].map(([k, a]) => {
    const [bot_id, environment, mode, currency] = k.split("|");
    return { bot_id, environment, mode, currency, ...statistika(a) };
  });
}
