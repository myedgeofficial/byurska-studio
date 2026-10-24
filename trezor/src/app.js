// REMAKO trezor: gesla, uporabniška imena in podatki podjetja za dva človeka s skupno kodo.
// Vse se šifrira v brskalniku (kripto.js); v Firestore gre samo šifrirano besedilo.

import { initializeApp } from "firebase/app";
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref as sref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
import { read as beriTabelo, utils as tabelaUtils } from "xlsx";
import { najdiTabelo, vTrejde, ugani, statistika as izracunaj, kljucTrejda, DNEVI, MESECI } from "./trejdi.js";
import { krivulja, stolpci, toplota, vecKrivulj, nalozeniStolpci, krof, koledar, obroc, merilnik, iskrica, trak } from "./grafi.js";
import { napredno, simuliraj, coach, tedenski, trajanje as trajanjeKratko, SEJE } from "./analiza.js";
import { ikona } from "./ikone.js";
import { izKode, zakleni, odkleni, mocKode, novoGeslo, NAJMANJ_ZNAKOV, zakleniDatoteko, odkleniDatoteko } from "./kripto.js";

/* global FB_CONFIG */
const fbApp = initializeApp(FB_CONFIG);
const db = initializeFirestore(fbApp, { ignoreUndefinedProperties: true });
const shramba = getStorage(fbApp);
if (location.hostname === "localhost") {
  // samo za preizkus
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(shramba, "127.0.0.1", 9199);
}
const NAJVEC_MB = 25;
const KATEGORIJE = [
  ["gesla", "Gesla"],
  ["podjetje", "Podjetje"],
  ["banka", "Banka"],
  ["trgovanje", "Trgovanje"],
  ["dokumenti", "Licence in pogodbe"],
  ["denar", "Izplačila in nakazila"],
  ["opombe", "Opombe"],
];
const evri = (n) => (Number(n) || 0).toLocaleString("sl-SI", { style: "currency", currency: "EUR" });
const datum = (d) => (d ? new Date(d + "T12:00").toLocaleDateString("sl-SI") : "");
const dniDo = (d) => Math.ceil((new Date(d + "T23:59") - Date.now()) / 86400000);
const IKONA_KAT = { vse: "vse", gesla: "kljuc", podjetje: "podjetje", banka: "banka", trgovanje: "graf", dokumenti: "dokument", denar: "denar", opombe: "opomba" };
const imeKat = (k) => (KATEGORIJE.find(([id]) => id === k) || [, "Drugo"])[1];

let trezor = null; // { id, kljuc }
let podatki = null; // { vnosi: [...] }
let posodobljeno = null;
let odjava = null;
let filter = { kat: "vse", isci: "" };
let pogled = "trezor"; // ali "statistika"
let statFilter = { racun: "moji", obdobje: "vse", algo: "vsi", vrsta: "zivo" };
let statOddelek = "pregled", remakoOddelek = "pregled";
const simPravila = { maxNaDan: 0, stopPoIzgubah: 0, brezSeje: "", samoKz: false };
const trejdiCache = new Map(); // id uvoza → trejdi (samo v pomnilniku)

// Ime na tej napravi (za pozdrav). Ni skrivnost, zato v localStorage.
const IME_KLJUC = "remako-trezor-ime";
const beriIme = () => { try { return localStorage.getItem(IME_KLJUC) || ""; } catch (e) { return ""; } };
const shraniIme = (ime) => { try { localStorage.setItem(IME_KLJUC, ime); } catch (e) {} };
function pozdrav() {
  const ura = new Date().getHours();
  const p = ura >= 5 && ura < 10 ? "Dobro jutro" : ura >= 10 && ura < 18 ? "Dober dan" : "Dober večer";
  const ime = beriIme();
  return h("div", { class: "pozdrav" },
    h("div", { class: "datum" }, new Date().toLocaleDateString("sl-SI", { weekday: "long", day: "numeric", month: "long" })),
    h("div", { class: "hello" }, ime ? [p + ", ", h("span", { class: "grad" }, ime)] : p));
}

const $ = (s) => document.querySelector(s);
const app = $("#app");

// Varno sestavljanje elementov (vse besedilo gre skozi textContent).
function h(tag, lastnosti = {}, ...otroci) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(lastnosti || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const o of otroci.flat(Infinity)) if (o != null && o !== false) el.append(o instanceof Node ? o : String(o));
  return el;
}
// Kot replaceChildren, a preskoči prazne (null, false) in splošči sezname.
const zamenjaj = (el, ...otroci) => el.replaceChildren(...otroci.flat(Infinity).filter((o) => o != null && o !== false));
const zaslon = (...vsebina) => (app.classList.toggle("siroko", pogled !== "trezor" && vsebina.some((x) => x?.classList?.contains("tabs"))), zamenjaj(app, ...vsebina));

function obvestilo(besedilo) {
  const el = h("div", { class: "toast" }, besedilo);
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

let brisiOdlozisce = null;
async function kopiraj(vrednost, kaj) {
  try {
    await navigator.clipboard.writeText(vrednost);
    obvestilo(`${kaj} kopirano`);
    clearTimeout(brisiOdlozisce);
    brisiOdlozisce = setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), 45000);
  } catch (e) {
    obvestilo("Kopiranje ni uspelo");
  }
}

const glava = (...desno) =>
  h("header", { class: "top" },
    h("div", { class: "logo" }, h("span", { class: "mark" }, "R"), h("span", { class: "wordmark" }, "REMAKO", h("small", {}, "Trezor"))),
    h("div", { class: "row" }, ...desno));

/* ---------- Zaklenjeno ---------- */

function zaklenjeno(sporocilo) {
  const vnos = h("input", { type: "password", id: "koda", autocomplete: "current-password", placeholder: "Koda", autofocus: true });
  const napaka = h("p", { class: "err" }, sporocilo || "");
  const gumb = h("button", { class: "btn", type: "submit" }, ikona("odklenjeno"), "Odkleni");
  const obrazec = h(
    "form",
    {
      class: "card narrow glass login",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!vnos.value.trim()) return;
        gumb.disabled = true;
        gumb.textContent = "Odklepam …";
        napaka.textContent = "";
        try {
          const t = await izKode(vnos.value);
          const snap = await getDoc(doc(db, "trezor", t.id));
          if (snap.exists()) {
            podatki = await odkleni(t, snap.data());
            trezor = t;
            posodobljeno = snap.data().t?.toDate?.() || null;
            odprt();
            oznaciObstoj();
            dopolni();
          } else if ((await getDoc(OZNAKA)).exists() && !novDovoljen) {
            napaka.textContent = "Napačna koda. Preveri jo z gumbom Pokaži.";
            gumb.disabled = false;
            zamenjaj(gumb, ikona("odklenjeno"), "Odkleni");
          } else {
            nov(vnos.value);
          }
        } catch (err) {
          console.error(err);
          napaka.textContent = err?.code === "unavailable" ? "Ni povezave. Poskusi znova." : "Trezorja ni bilo mogoče odpreti.";
          gumb.disabled = false;
          zamenjaj(gumb, ikona("odklenjeno"), "Odkleni");
        }
      },
    },
    h("div", { class: "seal" }, h("div", { class: "seal-ring" }), ikona("scit", "seal-ik")),
    h("h1", { class: "center" }, "Zasebni trezor"),
    h("p", { class: "muted center" }, "Gesla, računi in dokumenti REMAKO d.o.o."),
    h("div", { class: "row codefield" }, vnos,
      h("button", { class: "eye", type: "button", title: "Pokaži kodo", "aria-label": "Pokaži kodo", onclick: (e) => ((vnos.type = vnos.type === "password" ? "text" : "password"), e.currentTarget.classList.toggle("on")) }, ikona("oko"))),
    napaka,
    gumb,
    h("p", { class: "fine" }, "Vse je šifrirano na tvoji napravi. Kode ne hrani nihče, zato je ni mogoče obnoviti."),
    h("button", { class: "linkbtn", type: "button", onclick: () => {
      if (!confirm("Nov trezor naredi samo, če je stara koda izgubljena. Stari trezor ostane, a brez kode ga ni mogoče odpreti. Nadaljujem?")) return;
      novDovoljen = true;
      napaka.textContent = "Vpiši novo kodo in klikni Odkleni.";
    } }, "Pozabljena koda? Ustvari nov trezor")
  );
  zaslon(glava(), obrazec);
  vnos.focus();
}

function nov(koda) {
  const ponovi = h("input", { type: "password", autocomplete: "new-password", placeholder: "Ponovi kodo" });
  const napaka = h("p", { class: "err" });
  const m = mocKode(koda);
  const gumb = h("button", { class: "btn", type: "submit", disabled: !m.dovolj }, "Ustvari trezor");
  zaslon(
    glava(),
    h(
      "form",
      {
        class: "card narrow",
        onsubmit: async (e) => {
          e.preventDefault();
          if (ponovi.value !== koda) return (napaka.textContent = "Kodi se ne ujemata.");
          gumb.disabled = true;
          gumb.textContent = "Ustvarjam …";
          try {
            const t = await izKode(koda);
            const zacetek = { vnosi: [podjetje()] };
            await setDoc(doc(db, "trezor", t.id), { ...(await zakleni(t, zacetek)), v: 1, t: serverTimestamp() });
            trezor = t;
            podatki = zacetek;
            novDovoljen = false;
            odprt();
            oznaciObstoj();
            dopolni();
          } catch (err) {
            console.error(err);
            napaka.textContent = "Trezorja ni bilo mogoče ustvariti.";
            gumb.disabled = false;
            gumb.textContent = "Ustvari trezor";
          }
        },
      },
      h("h1", {}, "Nov trezor?"),
      h("p", { class: "muted" }, "S to kodo trezor še ne obstaja. Če ga že imata, si se zatipkal: pojdi nazaj in poskusi znova."),
      m.dovolj
        ? h("p", { class: "ok" }, "Koda je dovolj močna.")
        : h("p", { class: "err" }, `Koda je prešibka. Uporabi vsaj ${NAJMANJ_ZNAKOV} znakov z velikimi in malimi črkami ter številkami, npr. tri besede in letnico.`),
      m.dovolj && ponovi,
      napaka,
      gumb,
      h("button", { class: "btn ghost", type: "button", onclick: () => zaklenjeno() }, "Nazaj")
    )
  );
  ponovi.focus();
}

// Javna oznaka, da trezor že obstaja: takrat napačna koda ne ponudi novega trezorja.
const OZNAKA = doc(db, "trezor-stanje", "obstaja");
let novDovoljen = false;
const oznaciObstoj = () => setDoc(OZNAKA, { obstaja: true }).catch(() => {});

// Prazne kartice za trgovalne račune in javni podatki podjetja (z remako.si), dodani enkrat.
// Izbrisane kartice se ne vrnejo.
const ZACETNI = [
  ["z-ampfutures", "AMP Futures", "https://www.ampfutures.com", [["Trguje", "Teo (samo Teo)"], ["Številka računa", ""], ["Platforma", ""], ["Strežnik", ""], ["Varnostne kode 2FA", "", true]]],
  ["z-metatrader5", "MetaTrader 5", "https://www.metatrader5.com", [["Namen", "Izdelava in testiranje algoritmov, avtomatsko trgovanje"], ["Številka računa (login)", ""], ["Strežnik", ""], ["Borzni posrednik", ""], ["Investorsko geslo (samo branje)", "", true]]],
  ["z-bitonex", "Bitunix", "https://www.bitunix.com", [["Trguje", "Tim (samo Tim)"], ["UID", ""], ["API ključ", "", true], ["API skrivnost", "", true], ["Varnostne kode 2FA", "", true]]],
];
const ZACETNI_TRGUJE = { "z-ampfutures": ["Trguje", "Teo (samo Teo)"], "z-metatrader5": ["Namen", "Izdelava in testiranje algoritmov, avtomatsko trgovanje"], "z-bitonex": ["Trguje", "Tim (samo Tim)"] };
const PODJETJE_POLJA = [
  ["Ustanoviteljica in direktorica", "Urška Repušič"],
  ["Naslov", "Ljubljanska cesta 63, 2327 Rače, Slovenija"],
  ["Matična številka", "6569471000"],
  ["Davčna številka / ID za DDV", "SI45736901"],
  ["TRR", ""],
];

function dopolni() {
  if (podatki.dopolnjeno >= 4) return;
  spremeni((d) => {
    if (d.dopolnjeno >= 4) return;
    const bx = d.vnosi.find((v) => v.id === "z-bitonex");
    if (bx && bx.naziv === "Bitonex") Object.assign(bx, { naziv: "Bitunix", povezava: bx.povezava || "https://www.bitunix.com" });
    const firma = d.vnosi.find((v) => v.naziv === "REMAKO d.o.o.");
    if (firma) {
      firma.polja ||= [];
      for (const [ime, vrednost] of PODJETJE_POLJA) {
        const kljuc = ime.split(" ")[0].toLowerCase();
        const p = firma.polja.find((x) => (x.ime || "").toLowerCase().startsWith(kljuc));
        if (!p) firma.polja.push({ ime, vrednost });
        else if (!p.vrednost) Object.assign(p, { ime, vrednost });
      }
    }
    for (const [id, [ime, vrednost]] of Object.entries(ZACETNI_TRGUJE)) {
      const v = d.vnosi.find((y) => y.id === id);
      if (v && !(v.polja || []).some((p) => p.ime === ime)) (v.polja ||= []).unshift({ ime, vrednost });
    }
    for (const [id, naziv, povezava, polja] of ZACETNI) {
      if (d.dopolnjeno >= 2 || d.vnosi.some((v) => v.id === id)) continue;
      d.vnosi.push({ id, naziv, kat: "trgovanje", uporabnik: "", geslo: "", povezava, polja: polja.map(([ime, vrednost, skrito]) => ({ ime, vrednost, skrito: !!skrito })), spremenjeno: Date.now() });
    }
    d.dopolnjeno = 4;
  }).then(() => document.querySelector(".tabs") && !document.querySelector(".sheet") && seznam()).catch((e) => console.error(e));
}

const podjetje = () => ({
  id: crypto.randomUUID(),
  naziv: "REMAKO d.o.o.",
  kat: "podjetje",
  polja: [
    { ime: "Naziv", vrednost: "REMAKO d.o.o." },
    { ime: "D-U-N-S", vrednost: "520178670" },
    { ime: "Davčna številka", vrednost: "" },
    { ime: "Matična številka", vrednost: "" },
    { ime: "Naslov", vrednost: "" },
    { ime: "TRR", vrednost: "" },
    { ime: "E-pošta", vrednost: "support@remako.si" },
    { ime: "Splet", vrednost: "https://remako.si" },
  ],
  spremenjeno: Date.now(),
});

/* ---------- Odprt trezor ---------- */

function kdoSi(naprej) {
  const izberi = (ime) => (shraniIme(ime), naprej());
  zaslon(glava(), h("div", { class: "card narrow" },
    h("h1", {}, "Kdo si?"),
    h("p", { class: "muted" }, "Da te trezor na tej napravi pozdravi po imenu."),
    h("div", { class: "ime-izbira" }, ["Teo", "Tim"].map((ime) => h("button", { class: "btn", type: "button", onclick: () => izberi(ime) }, ime)))));
}

function odprt() {
  if (!beriIme()) return kdoSi(odprt);
  odjava?.();
  odjava = onSnapshot(doc(db, "trezor", trezor.id), async (snap) => {
    if (!snap.exists()) return zakleni_("Trezor je bil premaknjen na novo kodo. Vpiši novo kodo.");
    if (snap.metadata.hasPendingWrites) return;
    try {
      podatki = await odkleni(trezor, snap.data());
      posodobljeno = snap.data().t?.toDate?.() || posodobljeno;
      if (!document.querySelector(".sheet")) seznam();
    } catch (e) {
      console.error(e);
    }
  });
  seznam();
}

// Vsaka sprememba gre skozi transakcijo: preberemo najnovejšo različico, uporabimo spremembo in shranimo.
// Tako se spremembi obeh hkrati ne prepišeta.
async function spremeni(sprememba) {
  const ref = doc(db, "trezor", trezor.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Trezor ne obstaja več");
    const sveze = await odkleni(trezor, snap.data());
    sprememba(sveze);
    tx.update(ref, { ...(await zakleni(trezor, sveze)), v: snap.data().v + 1, t: serverTimestamp() });
    podatki = sveze;
  });
  posodobljeno = new Date();
}

function zakleni_(sporocilo) {
  odjava?.();
  odjava = null;
  trezor = null;
  podatki = null;
  trejdiCache.clear();
  document.querySelectorAll(".sheet").forEach((s) => s.remove());
  zaklenjeno(sporocilo);
}

const ujema = (v, q) =>
  !q || [v.naziv, v.uporabnik, v.povezava, v.opombe, v.racun, ...(v.datoteke || []).map((f) => f.ime), ...(v.polja || []).filter((p) => !p.skrito).flatMap((p) => [p.ime, p.vrednost])]
    .some((s) => String(s || "").toLowerCase().includes(q));

function zavihki() {
  return h("div", { class: "tabs" },
    h("button", { class: pogled === "trezor" ? "on" : "", onclick: () => ((pogled = "trezor"), seznam()) }, ikona("scit"), "Trezor"),
    h("button", { class: pogled === "statistika" ? "on" : "", onclick: () => ((pogled = "statistika"), seznam()) }, ikona("trend"), "Statistika"),
    h("button", { class: pogled === "remako" ? "on" : "", onclick: () => ((pogled = "remako"), seznam()) }, ikona("podjetje"), "REMAKO"));
}

const glavaOdprta = () =>
  glava(
    h("button", { class: "pill", title: "Koda in varnostna kopija", "aria-label": "Nastavitve", onclick: nastavitve }, ikona("nastavitve"), h("span", { class: "hide-xs" }, "Koda in kopija")),
    h("button", { class: "iconbtn", title: "Zakleni", "aria-label": "Zakleni", onclick: () => zakleni_() }, ikona("kljucavnica"))
  );

function seznam() {
  if (pogled === "statistika") return statistikaZaslon();
  if (pogled === "remako") return remakoZaslon();
  const vnosi = [...podatki.vnosi].sort((a, b) =>
    a.kat === "denar" && b.kat === "denar" ? String(b.datum || "").localeCompare(String(a.datum || "")) : a.naziv.localeCompare(b.naziv, "sl"));
  const q = filter.isci.trim().toLowerCase();
  const prikazani = vnosi.filter((v) => (filter.kat === "vse" || v.kat === filter.kat) && ujema(v, q));
  const stej = (k) => vnosi.filter((v) => v.kat === k).length;

  const isci = h("input", {
    type: "search",
    placeholder: "Išči",
    value: filter.isci,
    oninput: (e) => {
      filter.isci = e.target.value;
      const poz = e.target.selectionStart;
      seznam();
      const n = $("input[type=search]");
      n.focus();
      n.setSelectionRange(poz, poz);
    },
  });
  const cip = (id, ime, n) =>
    h("button", { class: "chip" + (filter.kat === id ? " on" : ""), onclick: () => ((filter.kat = id), seznam()) }, ikona(IKONA_KAT[id]), ime, n != null && h("span", { class: "n" }, n));

  zaslon(
    glavaOdprta(),
    pozdrav(),
    zavihki(),
    filter.kat === "vse" && !q && pregled(vnosi),
    h("div", { class: "search" }, ikona("isci"), isci),
    h("div", { class: "chips" }, cip("vse", "Vse", vnosi.length), KATEGORIJE.map(([id, ime]) => cip(id, ime, stej(id)))),
    filter.kat === "denar" && povzetekDenarja(vnosi),
    filter.kat === "dokumenti" && opozoriloPoteka(vnosi),
    prikazani.length
      ? h("div", { class: "list" }, prikazani.map((v) => vrstica(v)))
      : h("p", { class: "empty" }, q ? "Ni zadetkov." : "Tukaj še ni ničesar. Dodaj prvi vnos."),
    h("p", { class: "fine" }, posodobljeno ? `Zadnja sprememba: ${posodobljeno.toLocaleString("sl-SI")}` : ""),
    h("button", { class: "fab", onclick: meniDodaj }, ikona("plus"), "Dodaj")
  );
}

// Nadzorna plošča na vrhu: kratek pregled trezorja.
function pregled(vnosi) {
  const denar = vnosi.filter((v) => v.kat === "denar");
  const izplacano = denar.filter((v) => v.smer !== "nakazilo").reduce((a, v) => a + (Number(v.znesek) || 0), 0);
  const naslednji = vnosi.filter((v) => v.kat === "dokumenti" && v.veljaDo && dniDo(v.veljaDo) >= 0).sort((a, b) => a.veljaDo.localeCompare(b.veljaDo))[0];
  const racuni = vnosi.filter((v) => v.kat === "trgovanje").length;
  const kartica = (ik, lbl, num, sub, kat) => h("button", { class: "stat k-" + kat, onclick: () => ((filter.kat = kat), seznam()) },
    h("span", { class: "stat-ik" }, ikona(ik)), h("span", { class: "lbl" }, lbl), h("span", { class: "num" }, num), h("span", { class: "sub" }, sub));
  return h("div", { class: "overview" },
    kartica("graf", "Trgovalni računi", String(racuni), "AMP · Bitunix · MT5", "trgovanje"),
    kartica("denar", "Izplačano", evri(izplacano), `${denar.length} vnosov`, "denar"),
    kartica("dokument", "Naslednji potek", naslednji ? new Date(naslednji.veljaDo + "T12:00").toLocaleDateString("sl-SI", { day: "numeric", month: "short" }) : "—", naslednji ? naslednji.naziv : "Licence in pogodbe", "dokumenti"));
}

function povzetekDenarja(vnosi) {
  const po = {};
  for (const v of vnosi.filter((x) => x.kat === "denar")) {
    const r = (po[v.racun || "Brez računa"] ||= { izplacilo: 0, nakazilo: 0 });
    r[v.smer === "nakazilo" ? "nakazilo" : "izplacilo"] += Number(v.znesek) || 0;
  }
  const vrstice = Object.entries(po);
  if (!vrstice.length) return h("p", { class: "muted small" }, "Sem shranjujta izplačila (payoute) in nakazila na račune: znesek, datum in dokazilo (PDF, posnetek, e-pošta).");
  return h("div", { class: "card sum" },
    h("div", { class: "sumrow head" }, h("span", {}, "Račun"), h("span", {}, "Nakazano"), h("span", {}, "Izplačano")),
    vrstice.map(([r, z]) => h("div", { class: "sumrow" }, h("span", {}, r), h("span", {}, evri(z.nakazilo)), h("span", { class: "plus" }, evri(z.izplacilo)))));
}

function opozoriloPoteka(vnosi) {
  const kmalu = vnosi.filter((v) => v.kat === "dokumenti" && v.veljaDo && dniDo(v.veljaDo) <= 30);
  return kmalu.length ? h("p", { class: "err" }, "Kmalu poteče ali je poteklo: " + kmalu.map((v) => `${v.naziv} (${datum(v.veljaDo)})`).join(", ")) : null;
}

function podnaslov(v) {
  if (v.kat === "denar") return [v.smer === "nakazilo" ? "Nakazilo" : "Izplačilo", evri(v.znesek), v.racun, datum(v.datum)].filter(Boolean).join(" · ");
  if (v.kat === "dokumenti" && v.veljaDo) return (dniDo(v.veljaDo) < 0 ? "Poteklo " : "Velja do ") + datum(v.veljaDo);
  return null;
}

function vrstica(v) {
  const pod = podnaslov(v) || v.uporabnik || (v.polja || []).find((p) => p.vrednost && !p.skrito && p.vrednost !== v.naziv)?.vrednost || imeKat(v.kat);
  return h(
    "div",
    { class: "item", tabindex: "0", onclick: () => podrobno(v.id), onkeydown: (e) => e.key === "Enter" && podrobno(v.id) },
    h("div", { class: "av k-" + v.kat }, ikona(IKONA_KAT[v.kat] || "opomba")),
    h("div", { class: "grow" }, h("div", { class: "t" }, v.naziv), h("div", { class: "s" + (v.veljaDo && dniDo(v.veljaDo) <= 30 ? " warn" : "") }, pod)),
    v.datoteke?.length ? h("span", { class: "clip", title: "Priponke" }, ikona("sponka"), v.datoteke.length) : null,
    v.geslo && h("button", { class: "mini", title: "Kopiraj geslo", onclick: (e) => (e.stopPropagation(), kopiraj(v.geslo, "Geslo")) }, ikona("kopiraj"), h("span", { class: "hide-xs" }, "Geslo"))
  );
}

function list(vsebina, zapri) {
  const ozadje = h("div", { class: "sheet", onclick: (e) => e.target === ozadje && (ozadje.remove(), zapri?.()) }, h("div", { class: "panel" }, h("div", { class: "grip" }), vsebina));
  document.querySelectorAll(".sheet").forEach((s) => s.remove());
  document.body.append(ozadje);
  return ozadje;
}

function polje(ime, vrednost, skrito) {
  if (!vrednost) return null;
  const val = h("div", { class: "val" + (skrito ? " mono" : "") }, skrito ? "••••••••••" : vrednost);
  let vidno = !skrito;
  const je = /^https?:\/\//i.test(vrednost);
  return h(
    "div",
    { class: "field" },
    h("div", { class: "lbl" }, ime),
    h(
      "div",
      { class: "row" },
      je && !skrito ? h("a", { class: "val grow", href: vrednost, target: "_blank", rel: "noopener noreferrer" }, vrednost) : h("div", { class: "grow" }, val),
      skrito &&
        h("button", { class: "mini", onclick: (e) => ((vidno = !vidno), (val.textContent = vidno ? vrednost : "••••••••••"), (e.target.textContent = vidno ? "Skrij" : "Pokaži")) }, "Pokaži"),
      h("button", { class: "mini icon", title: "Kopiraj", "aria-label": "Kopiraj " + ime, onclick: () => kopiraj(vrednost, ime) }, ikona("kopiraj"))
    )
  );
}

function podrobno(id) {
  const v = podatki.vnosi.find((x) => x.id === id);
  if (!v) return;
  const s = list(
    [
      h("div", { class: "row between" }, h("span", { class: "tag k-" + v.kat }, ikona(IKONA_KAT[v.kat] || "opomba"), imeKat(v.kat)), h("button", { class: "iconbtn", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, ikona("zapri"))),
      h("h1", {}, v.naziv),
      v.kat === "denar" && polje(v.smer === "nakazilo" ? "Nakazilo" : "Izplačilo", evri(v.znesek)),
      v.kat === "denar" && polje("Račun", v.racun),
      v.kat === "denar" && polje("Datum", datum(v.datum)),
      v.veljaDo && polje("Velja do", datum(v.veljaDo)),
      polje("Uporabniško ime", v.uporabnik),
      polje("Geslo", v.geslo, true),
      polje("Povezava", v.povezava),
      (v.polja || []).map((p) => polje(p.ime || "Podatek", p.vrednost, p.skrito)),
      v.opombe && h("div", { class: "field" }, h("div", { class: "lbl" }, "Opombe"), h("div", { class: "val pre" }, v.opombe)),
      v.datoteke?.length &&
        h("div", { class: "field" }, h("div", { class: "lbl" }, "Priponke"),
          v.datoteke.map((f) => h("div", { class: "row file" }, h("div", { class: "grow val" }, f.ime, h("span", { class: "dim" }, " · " + velikost(f.velikost))),
            h("button", { class: "mini", onclick: (e) => odpriDatoteko(f, e.target) }, "Odpri")))),
      h("button", { class: "btn", onclick: () => uredi(v) }, "Uredi"),
    ],
    seznam
  );
}

function uredi(v) {
  const nov_ = !v;
  const x = structuredClone(v || { id: crypto.randomUUID(), naziv: "", kat: filter.kat === "vse" ? "gesla" : filter.kat, polja: [] });
  x.datoteke ||= [];
  const prvotne = [...x.datoteke];
  const nove = []; // { meta, file }
  const vh = (ime, kljuc, attrs = {}) =>
    h("label", {}, ime, h(attrs.tag || "input", { value: x[kljuc] || "", oninput: (e) => (x[kljuc] = e.target.value), ...attrs, tag: null }));

  const geslo = h("input", { value: x.geslo || "", type: "password", autocomplete: "new-password", oninput: (e) => (x.geslo = e.target.value) });
  const poljaEl = h("div", {});
  const narisiPolja = () =>
    zamenjaj(poljaEl, 
      ...x.polja.map((p, i) =>
        h(
          "div",
          { class: "extra" },
          h("input", { placeholder: "Ime (npr. IBAN)", value: p.ime, oninput: (e) => (p.ime = e.target.value) }),
          h("input", { placeholder: "Vrednost", value: p.vrednost, type: p.skrito ? "password" : "text", oninput: (e) => (p.vrednost = e.target.value) }),
          h("div", { class: "row" },
            h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!p.skrito, onchange: (e) => ((p.skrito = e.target.checked), narisiPolja()) }), "Skrito"),
            h("button", { class: "mini danger", type: "button", onclick: () => (x.polja.splice(i, 1), narisiPolja()) }, "Odstrani"))
        )
      )
    );
  narisiPolja();

  // Polja, ki so odvisna od kategorije (izplačila, licence).
  const posebna = h("div", {});
  const racuni = () => podatki.vnosi.filter((y) => y.kat === "trgovanje").map((y) => y.naziv);
  const narisiPosebna = () =>
    zamenjaj(posebna, ...[
      x.kat === "denar" ? h("div", {},
        h("label", {}, "Vrsta", h("select", { onchange: (e) => (x.smer = e.target.value) },
          h("option", { value: "izplacilo", selected: x.smer !== "nakazilo" }, "Izplačilo (payout) z računa"),
          h("option", { value: "nakazilo", selected: x.smer === "nakazilo" }, "Nakazilo na račun"))),
        h("label", {}, "Znesek v €", h("input", { type: "number", step: "0.01", inputmode: "decimal", value: x.znesek ?? "", oninput: (e) => (x.znesek = e.target.value === "" ? null : Number(e.target.value)) })),
        h("label", {}, "Datum", h("input", { type: "date", value: x.datum || new Date().toISOString().slice(0, 10), oninput: (e) => (x.datum = e.target.value) })),
        h("label", {}, "Račun", h("select", { onchange: (e) => (x.racun = e.target.value) },
          h("option", { value: "" }, "—"), [...new Set([...racuni(), x.racun].filter(Boolean))].map((r) => h("option", { value: r, selected: x.racun === r }, r))))
      ) : null,
      x.kat === "dokumenti" ? h("label", {}, "Velja do (neobvezno)", h("input", { type: "date", value: x.veljaDo || "", oninput: (e) => (x.veljaDo = e.target.value) })) : null,
    ].filter(Boolean));
  if (x.kat === "denar") x.datum ||= new Date().toISOString().slice(0, 10);
  narisiPosebna();

  const priponkeEl = h("div", {});
  const narisiPriponke = () =>
    zamenjaj(priponkeEl, 
      ...[...x.datoteke.map((f) => [f, false]), ...nove.map((n) => [n.meta, true])].map(([f, je_nova]) =>
        h("div", { class: "row file" }, h("div", { class: "grow val" }, f.ime, h("span", { class: "dim" }, " · " + velikost(f.velikost) + (je_nova ? " · nova" : ""))),
          h("button", { class: "mini danger", type: "button", onclick: () => {
            if (je_nova) nove.splice(nove.findIndex((n) => n.meta === f), 1);
            else x.datoteke = x.datoteke.filter((y) => y !== f);
            narisiPriponke();
          } }, "Odstrani")))
    );
  const izbira = h("input", { type: "file", multiple: true, class: "hidden", onchange: (e) => {
    for (const file of e.target.files) {
      if (file.size > NAJVEC_MB * 1048576) { obvestilo(`${file.name} je večja od ${NAJVEC_MB} MB`); continue; }
      nove.push({ meta: { id: crypto.randomUUID(), ime: file.name, tip: file.type || "application/octet-stream", velikost: file.size }, file });
    }
    e.target.value = "";
    narisiPriponke();
  } });
  narisiPriponke();

  const shrani = h("button", { class: "btn", type: "submit" }, "Shrani");
  const s = list(
    h(
      "form",
      {
        onsubmit: async (e) => {
          e.preventDefault();
          x.naziv = (x.naziv || "").trim();
          if (!x.naziv) return obvestilo("Vpiši naziv");
          x.polja = x.polja.filter((p) => p.ime || p.vrednost);
          x.spremenjeno = Date.now();
          shrani.disabled = true;
          shrani.textContent = "Shranjujem …";
          try {
            for (const [i, n] of nove.entries()) {
              shrani.textContent = `Nalagam priponko ${i + 1}/${nove.length} …`;
              const paket = await zakleniDatoteko(trezor, n.meta.id, new Uint8Array(await n.file.arrayBuffer()));
              await uploadBytes(potDatoteke(trezor.id, n.meta.id), paket, { contentType: "application/octet-stream" });
              x.datoteke.push(n.meta);
            }
            nove.length = 0;
            shrani.textContent = "Shranjujem …";
            await spremeni((d) => {
              const i = d.vnosi.findIndex((y) => y.id === x.id);
              if (i >= 0) d.vnosi[i] = x;
              else d.vnosi.push(x);
            });
            pobrisiDatoteke(prvotne.filter((f) => !x.datoteke.some((y) => y.id === f.id)));
            obvestilo("Shranjeno");
            s.remove();
            seznam();
            podrobno(x.id);
          } catch (err) {
            console.error(err);
            obvestilo("Shranjevanje ni uspelo");
            shrani.disabled = false;
            shrani.textContent = "Shrani";
          }
        },
      },
      h("div", { class: "row between" }, h("h1", {}, nov_ ? "Nov vnos" : "Uredi"), h("button", { class: "iconbtn", type: "button", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, ikona("zapri"))),
      vh("Naziv", "naziv", { placeholder: "npr. Interactive Brokers", required: true }),
      h("label", {}, "Kategorija",
        h("select", { onchange: (e) => ((x.kat = e.target.value), narisiPosebna()) }, KATEGORIJE.map(([id, ime]) => h("option", { value: id, selected: x.kat === id }, ime)))),
      posebna,
      vh("Uporabniško ime ali e-pošta", "uporabnik", { autocomplete: "off" }),
      h("label", {}, "Geslo",
        h("div", { class: "row" }, geslo,
          h("button", { class: "mini", type: "button", onclick: (e) => ((geslo.type = geslo.type === "password" ? "text" : "password"), (e.target.textContent = geslo.type === "password" ? "Pokaži" : "Skrij")) }, "Pokaži"),
          h("button", { class: "mini", type: "button", onclick: () => ((x.geslo = geslo.value = novoGeslo()), (geslo.type = "text")) }, "Ustvari"))),
      vh("Povezava", "povezava", { type: "url", placeholder: "https://" }),
      h("label", {}, "Dodatni podatki"),
      poljaEl,
      h("button", { class: "btn ghost", type: "button", onclick: () => (x.polja.push({ ime: "", vrednost: "" }), narisiPolja()) }, "+ Dodaj podatek"),
      vh("Opombe", "opombe", { tag: "textarea", rows: 4 }),
      h("label", {}, "Priponke (pogodbe, licence, računi, potrdila, e-pošta kot PDF ali posnetek)"),
      priponkeEl,
      izbira,
      h("button", { class: "btn ghost", type: "button", onclick: () => izbira.click() }, "+ Dodaj datoteko"),
      h("p", { class: "fine left" }, `Datoteke se šifrirajo na tvoji napravi, največ ${NAJVEC_MB} MB na datoteko.`),
      shrani,
      !nov_ &&
        h("button", {
          class: "btn ghost danger",
          type: "button",
          onclick: async () => {
            if (!confirm(`Izbrišem »${x.naziv}«?`)) return;
            try {
              await spremeni((d) => (d.vnosi = d.vnosi.filter((y) => y.id !== x.id)));
              pobrisiDatoteke(prvotne);
              s.remove();
              seznam();
              obvestilo("Izbrisano");
            } catch (err) {
              obvestilo("Brisanje ni uspelo");
            }
          },
        }, "Izbriši")
    ),
    seznam
  );
}

function nastavitve() {
  const nova = h("input", { type: "password", autocomplete: "new-password", placeholder: "Nova koda" });
  const ponovi = h("input", { type: "password", autocomplete: "new-password", placeholder: "Ponovi novo kodo" });
  const napaka = h("p", { class: "err" });
  const gumb = h("button", { class: "btn", type: "submit" }, "Zamenjaj kodo");
  const s = list(
    h(
      "form",
      {
        onsubmit: async (e) => {
          e.preventDefault();
          napaka.textContent = "";
          if (!mocKode(nova.value).dovolj) return (napaka.textContent = `Koda je prešibka (vsaj ${NAJMANJ_ZNAKOV} znakov, velike in male črke, številke).`);
          if (nova.value !== ponovi.value) return (napaka.textContent = "Kodi se ne ujemata.");
          gumb.disabled = true;
          gumb.textContent = "Prenašam …";
          try {
            const t = await izKode(nova.value);
            // Priponke najprej prešifriramo z novo kodo; stare pobrišemo šele, ko je trezor prenesen.
            const vse = [...podatki.vnosi.flatMap((v) => v.datoteke || []), ...(podatki.uvozi || [])];
            for (const [i, f] of vse.entries()) {
              gumb.textContent = `Prenašam priponke ${i + 1}/${vse.length} …`;
              const bajti = await odkleniDatoteko(trezor, f.id, await getBytes(potDatoteke(trezor.id, f.id)));
              await uploadBytes(potDatoteke(t.id, f.id), await zakleniDatoteko(t, f.id, bajti), { contentType: "application/octet-stream" });
            }
            const stariId = trezor.id;
            const staro = doc(db, "trezor", trezor.id);
            const novo = doc(db, "trezor", t.id);
            odjava?.();
            await runTransaction(db, async (tx) => {
              const snap = await tx.get(staro);
              if ((await tx.get(novo)).exists()) throw new Error("obstaja");
              const d = await odkleni(trezor, snap.data());
              tx.set(novo, { ...(await zakleni(t, d)), v: 1, t: serverTimestamp() });
              tx.delete(staro);
              podatki = d;
            });
            trezor = t;
            vse.forEach((f) => deleteObject(potDatoteke(stariId, f.id)).catch(() => {}));
            s.remove();
            odprt();
            obvestilo("Koda zamenjana. Novo kodo povej Timu.");
          } catch (err) {
            console.error(err);
            napaka.textContent = "Zamenjava ni uspela. Stara koda še vedno velja.";
            gumb.disabled = false;
            gumb.textContent = "Zamenjaj kodo";
            odprt();
          }
        },
      },
      h("div", { class: "row between" }, h("h1", {}, "Nastavitve"), h("button", { class: "iconbtn", type: "button", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, ikona("zapri"))),
      h("p", { class: "muted" }, "Trezor ostane odklenjen, dokler ne zapreš strani ali klikneš ključavnico. Kopirana vsebina se iz odložišča pobriše po 45 sekundah."),
      h("p", { class: "muted" }, `Na tej napravi si ${beriIme() || "neznan"}. `,
        h("button", { class: "linkbtn inline", type: "button", onclick: () => (s.remove(), kdoSi(() => seznam())) }, "Zamenjaj")),
      varnostnaKopija(),
      h("h2", {}, "Zamenjaj kodo"),
      h("p", { class: "muted" }, "Po zamenjavi stara koda ne deluje več, tudi na drugih napravah."),
      nova,
      ponovi,
      napaka,
      gumb
    ),
    seznam
  );
}

const potDatoteke = (tid, fid) => sref(shramba, `trezor/${tid}/${fid}`);
const velikost = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " kB");
const pobrisiDatoteke = (seznam) => seznam.forEach((f) => deleteObject(potDatoteke(trezor.id, f.id)).catch(() => {}));

async function odpriDatoteko(f, gumb) {
  const prej = gumb.textContent;
  gumb.textContent = "…";
  try {
    const bajti = await odkleniDatoteko(trezor, f.id, await getBytes(potDatoteke(trezor.id, f.id)));
    const url = URL.createObjectURL(new Blob([bajti], { type: f.tip }));
    const a = h("a", { href: url, download: f.ime, target: "_blank", rel: "noopener" });
    // PDF in slike odpremo v novem zavihku, ostalo prenesemo.
    if (/^(image\/|application\/pdf)/.test(f.tip)) a.removeAttribute("download");
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    console.error(e);
    obvestilo("Datoteke ni bilo mogoče odpreti");
  }
  gumb.textContent = prej;
}

/* ---------- Statistika trejdov ---------- */

async function naloziTrejde() {
  const uvozi = podatki.uvozi || [];
  await Promise.all(uvozi.filter((u) => !trejdiCache.has(u.id)).map(async (u) => {
    const bajti = await odkleniDatoteko(trezor, u.id, await getBytes(potDatoteke(trezor.id, u.id)));
    trejdiCache.set(u.id, JSON.parse(new TextDecoder().decode(bajti)));
  }));
  const videno = new Set();
  const vsi = [];
  for (const u of uvozi) {
    for (const t of trejdiCache.get(u.id) || []) {
      const k = kljucTrejda(u.racun, t);
      if (videno.has(k)) continue;
      videno.add(k);
      vsi.push({ ...t, r: u.racun, a: u.algo || t.a || "", v: u.vrsta || "zivo" });
    }
  }
  return vsi;
}

const pnl = (v, cls = true) => h("span", { class: cls ? (v > 0 ? "pos" : v < 0 ? "neg" : "") : "" }, (v > 0 ? "+" : "") + evri(v));
const odstotek = (x) => Math.round(x * 100) + " %";
const tile = (lbl, num, sub) => h("div", { class: "tile" }, h("div", { class: "lbl" }, lbl), h("div", { class: "num" }, num), sub ? h("div", { class: "sub" }, sub) : null);
const graf = (naslov, svg, opomba) => h("div", { class: "chart" }, h("h3", {}, naslov), opomba ? h("div", { class: "note" }, opomba) : null, svg);
const trajanjeBes = (min) => (min == null ? "—" : min < 60 ? Math.round(min) + " min" : min < 1440 ? (min / 60).toFixed(1) + " h" : (min / 1440).toFixed(1) + " dni");

// Kdo trguje na računu: iz polja »Trguje« na kartici računa, MT5 so algoritmi, sicer kdo je uvozil.
function trgovalec(u) {
  const vnos = (podatki.vnosi || []).find((v) => v.naziv === u.racun);
  const trguje = (vnos?.polja || []).find((p) => /^trguje/i.test(p.ime || ""))?.vrednost || "";
  if (/^\s*teo/i.test(trguje)) return "Teo";
  if (/^\s*tim/i.test(trguje)) return "Tim";
  if (/metatrader|mt5/i.test(u.racun) || u.algo || (vnos?.polja || []).some((p) => /namen/i.test(p.ime || "") && /algorit/i.test(p.vrednost || ""))) return "Algoritmi";
  return u.kdo || "Drugi";
}
const BARVA = { Teo: "s-teo", Tim: "s-tim", Algoritmi: "s-algo" };
let remakoObdobje = "dan";

async function remakoZaslon() {
  const uvozi = podatki.uvozi || [];
  const vsebina = h("div", {}, h("div", { class: "spin" }));
  zaslon(glavaOdprta(), pozdrav(), zavihki(), vsebina);
  if (!uvozi.length) return zamenjaj(vsebina, h("div", { class: "card" }, h("h1", {}, "REMAKO skupaj"),
    h("p", { class: "muted" }, "Tukaj bo skupna statistika podjetja: Teo + Tim + algoritmi, po dnevih, tednih in mesecih. Najprej uvozita zgodovino trejdov."),
    h("button", { class: "btn", onclick: () => uvoziTrejde() }, "Uvozi zgodovino")));
  let vsi;
  try { vsi = await naloziTrejde(); } catch (e) { console.error(e); return zamenjaj(vsebina, h("p", { class: "err" }, "Zgodovine ni bilo mogoče naložiti.")); }
  if (pogled !== "remako") return;
  const kdoZa = new Map(uvozi.map((u) => [u.racun, trgovalec(u)]));
  const trejdi = vsi.filter((t) => t.v === "zivo").map((t) => ({ ...t, k: kdoZa.get(t.r) || "Drugi" })).sort((a, b) => a.t.localeCompare(b.t));
  if (!trejdi.length) return zamenjaj(vsebina, h("p", { class: "empty" }, "Ni trejdov živega trgovanja (backtesti se tu ne štejejo)."));
  const ljudje = ["Teo", "Tim", "Algoritmi", ...new Set(trejdi.map((t) => t.k))].filter((x, i, a) => a.indexOf(x) === i && trejdi.some((t) => t.k === x));
  const cls = (k) => BARVA[k] || "s-drugi";
  const st = izracunaj(trejdi);
  const poOsebi = Object.fromEntries(ljudje.map((k) => [k, izracunaj(trejdi.filter((t) => t.k === k))]));

  const d0 = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ponedeljek = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return d0(x); };
  const KLJUC = { dan: (d) => d0(d), teden: ponedeljek, mesec: (d) => d0(d).slice(0, 7) };
  const OZNAKA = { dan: (k) => k.slice(8) + "." + k.slice(5, 7), teden: (k) => k.slice(8) + "." + k.slice(5, 7), mesec: (k) => MESECI[+k.slice(5) - 1] + " " + k.slice(2, 4) };
  const kljuc = KLJUC[remakoObdobje];
  const obdobja = [...new Set(trejdi.map((t) => kljuc(new Date(t.t))))].sort().slice(remakoObdobje === "dan" ? -45 : remakoObdobje === "teden" ? -26 : -24);
  const skupine = new Map(obdobja.map((o) => [o, []]));
  for (const t of trejdi) skupine.get(kljuc(new Date(t.t)))?.push(t);
  const vsota = (a) => Math.round(a.reduce((x, t) => x + t.p, 0) * 100) / 100;
  const wr = (a) => (a.length ? a.filter((t) => t.p > 0).length / a.length : 0);

  const zdaj = new Date();
  const danes = trejdi.filter((t) => KLJUC.dan(new Date(t.t)) === KLJUC.dan(zdaj));
  const taTeden = trejdi.filter((t) => KLJUC.teden(new Date(t.t)) === KLJUC.teden(zdaj));
  const taMesec = trejdi.filter((t) => KLJUC.mesec(new Date(t.t)) === KLJUC.mesec(zdaj));

  // Krivulje kapitala po osebah in skupaj
  const kumul = (a) => { let v = 0; return a.map((t) => ({ t: t.t, v: Math.round((v += t.p) * 100) / 100 })); };
  const serije = [{ ime: "REMAKO", cls: "s-skupaj", tocke: kumul(trejdi) }, ...ljudje.map((k) => ({ ime: k, cls: cls(k), tocke: kumul(trejdi.filter((t) => t.k === k)) }))];
  const legenda = (imena) => h("div", { class: "legenda" }, imena.map(([ime, c]) => h("span", { class: c }, ime)));
  const legendaVsiF = () => legenda([["REMAKO skupaj", "s-skupaj"], ...ljudje.map((k) => [k, cls(k)])]);
  const legendaLjudjeF = () => legenda(ljudje.map((k) => [k, cls(k)]));

  // Padec od vrha (skupaj)
  let vrh = 0, kap = 0;
  const podvodno = trejdi.map((t) => { kap += t.p; vrh = Math.max(vrh, kap); return { t: t.t, v: Math.round((kap - vrh) * 100) / 100 }; });
  // Porazdelitev rezultatov trejdov
  const ps = trejdi.map((t) => t.p).sort((a, b) => a - b);
  const lo = ps[Math.floor(ps.length * 0.02)], hi = ps[Math.ceil(ps.length * 0.98) - 1];
  const KOS = 14, korak = (hi - lo) / KOS || 1;
  const kosi = Array.from({ length: KOS }, (_, i) => ({ od: lo + i * korak, n: 0 }));
  for (const p of ps) kosi[Math.min(KOS - 1, Math.max(0, Math.floor((p - lo) / korak)))].n++;
  // Dnevni rezultat za koledar
  const poDnevu = new Map();
  for (const t of trejdi) { const k = KLJUC.dan(new Date(t.t)); poDnevu.set(k, (poDnevu.get(k) || 0) + t.p); }
  const tabela = (glava, vrstice) => h("table", { class: "tbl" }, h("tr", {}, glava.map((g) => h("th", {}, g))), vrstice.map((r) => h("tr", {}, r.map((c) => h("td", {}, c)))));
  const pfStr = (x) => (Number.isFinite(x) ? x.toFixed(2) : "∞");
  // Skupni nasveti za oba
  const nas = coach(st, napredno(trejdi), evri, odstotek, true);
  const dobro = [...nas.pomaga], slabo = [...nas.skodi], izboljsaj = [];
  for (const k of ljudje) {
    const x = poOsebi[k];
    if (x.n < 10) continue;
    if (x.neto > 0 && x.pf >= 1.2) dobro.push(`${k}: ${evri(x.neto)}, PF ${pfStr(x.pf)}, uspešnost ${odstotek(x.wr)}.`);
    else if (x.neto < 0) slabo.push(`${k} je v minusu (${evri(x.neto)}, PF ${pfStr(x.pf)}).`);
    else izboljsaj.push(`${k} je blizu ničle (PF ${pfStr(x.pf)}). Manj trejdov, samo najboljši setupi.`);
    if (x.povpP && x.povpZ / -x.povpP < 1 && x.wr < 0.6) izboljsaj.push(`${k}: povprečna izguba (${evri(-x.povpP)}) je večja od povprečnega dobitka (${evri(x.povpZ)}). Cilj: dobitek vsaj 1,5× izguba.`);
    if (x.neto > 0 && x.maxDD > x.neto) izboljsaj.push(`${k}: največji padec (${evri(x.maxDD)}) je večji od celotnega dobička. Manjša velikost pozicij ali dnevni limit izgube.`);
  }
  const tedenNaz = tedenski(trejdi);
  if (tedenNaz.ta.n && tedenNaz.prej.n) (tedenNaz.ta.p >= tedenNaz.prej.p ? dobro : izboljsaj).push(`Ta teden ${evri(tedenNaz.ta.p)}, prejšnji ${evri(tedenNaz.prej.p)}.`);
  const slabDan = st.tedni.filter((d) => d.n >= 5).sort((a, b) => a.p - b.p)[0];
  if (slabDan && slabDan.p < 0) izboljsaj.push(`${["Ponedeljek", "Torek", "Sreda", "Četrtek", "Petek", "Sobota", "Nedelja"][slabDan.k]} je skupno najslabši dan (${evri(slabDan.p)}). Ta dan manj trejdov ali premor.`);
  const nasvetiStolpec = (naslov, c, a) => h("div", { class: "coach-col " + c }, h("b", {}, naslov), a.length ? h("ul", {}, a.map((u) => h("li", {}, u))) : h("p", { class: "dim small" }, "Nič izrazitega."));
  const imeObd = { dan: "dnevih", teden: "tednih", mesec: "mesecih" }[remakoObdobje];

  const vk = (lbl, ...v) => h("div", { class: "vk" }, h("div", { class: "lbl" }, lbl), ...v);
  const kartica = (naslov, opomba, ...v) => h("div", { class: "chart" }, h("h3", {}, naslov), opomba ? h("div", { class: "note" }, opomba) : null, ...v);
  const barlist = (items) => { const max = Math.max(1, ...items.map((x) => Math.abs(x.p))); return h("div", { class: "barlist" }, items.map((x) => h("div", { class: "bl" },
    h("div", { class: "ime" }, x.ime, h("small", {}, `${x.n} trejdov · ${odstotek(x.wr)}`)),
    h("div", { class: "os" }, h("i", { class: x.p >= 0 ? "plus" : "minus", style: `width:${(Math.abs(x.p) / max) * 50}%` })),
    h("div", { class: "zn" }, pnl(x.p))))); };
  const obdobjeIzbira = h("div", { class: "tabs small tri" }, [["dan", "Dnevno"], ["teden", "Tedensko"], ["mesec", "Mesečno"]].map(([k, ime]) =>
    h("button", { class: remakoObdobje === k ? "on" : "", onclick: () => ((remakoObdobje = k), seznam()) }, ime)));
  const oznakeVs = Math.ceil(obdobja.length / 10);
  const ODDELKI = [["pregled", "Pregled", "vse"], ["profit", "Profit", "denar"], ["uspesnost", "Uspešnost", "trend"], ["cas", "Čas", "koledar"], ["primerjava", "Primerjava", "graf"]];
  const oddelek = {
    pregled: () => [
      h("div", { class: "mreza dve" },
        h("div", { class: "hero" }, h("div", { class: "lbl" }, "REMAKO skupaj"), h("div", { class: "velik" }, pnl(st.neto)),
          h("div", { class: "pod" }, `${st.n} trejdov · uspešnost ${odstotek(st.wr)} · PF ${pfStr(st.pf)}`), iskrica(st.krivulja, st.neto >= 0 ? "plus" : "minus")),
        h("div", { class: "viz" },
          vk("Danes", h("div", { class: "vrednost" }, pnl(vsota(danes))), h("div", { class: "pod" }, `${danes.length} trejdov · ${odstotek(wr(danes))}`)),
          vk("Ta teden", h("div", { class: "vrednost" }, pnl(vsota(taTeden))), h("div", { class: "pod" }, `${taTeden.length} trejdov · ${odstotek(wr(taTeden))}`)),
          vk("Ta mesec", h("div", { class: "vrednost" }, pnl(vsota(taMesec))), h("div", { class: "pod" }, `${taMesec.length} trejdov · ${odstotek(wr(taMesec))}`)),
          vk("Uspešnost", obroc(st.wr, odstotek(st.wr), st.wr >= 0.5 ? "plus" : "minus")))),
      h("div", { class: "mreza" }, ljudje.map((k) => h("div", { class: "vk oseba " + cls(k) },
        h("div", { class: "lbl" }, k), h("div", { class: "vrstaosebe" }, obroc(poOsebi[k].wr, odstotek(poOsebi[k].wr), poOsebi[k].wr >= 0.5 ? "plus" : "minus"),
          h("div", {}, h("div", { class: "vrednost" }, pnl(poOsebi[k].neto)), h("div", { class: "pod" }, `${poOsebi[k].n} trejdov · PF ${pfStr(poOsebi[k].pf)}`))),
        iskrica(kumul(trejdi.filter((t) => t.k === k)), poOsebi[k].neto >= 0 ? "plus" : "minus")))),
      h("div", { class: "coach tri" }, nasvetiStolpec("Kaj je dobro", "dobro", dobro), nasvetiStolpec("Kaj izboljšati", "srednje", izboljsaj), nasvetiStolpec("Kaj je slabo", "", slabo)),
      h("div", { class: "mreza dve" },
        h("div", { class: "chart" }, h("h3", {}, "Krivulja kapitala"), legendaVsiF(), vecKrivulj(serije)),
        graf("Koledar", koledar(poDnevu), "Dnevni rezultat REMAKO, zadnjih 12 tednov")),
    ],
    profit: () => [obdobjeIzbira,
      h("div", { class: "mreza dve" },
        h("div", { class: "chart" }, h("h3", {}, `Profit po ${imeObd}`), legendaLjudjeF(),
          nalozeniStolpci(obdobja.map(OZNAKA[remakoObdobje]), ljudje.map((k) => ({ ime: k, cls: cls(k), v: obdobja.map((o) => vsota(skupine.get(o).filter((t) => t.k === k))) })), { oznakeVsakih: oznakeVs })),
        graf(`Skupaj po ${imeObd}`, stolpci(obdobja.map((o) => ({ oznaka: OZNAKA[remakoObdobje](o), v: vsota(skupine.get(o)), opis: `${o}: ${evri(vsota(skupine.get(o)))}, ${skupine.get(o).length} trejdov` })), { oznakeVsakih: oznakeVs }))),
      h("div", { class: "mreza dve" },
        h("div", { class: "chart" }, h("h3", {}, "Delež dobička"), legendaLjudjeF(), krof(ljudje.map((k) => ({ ime: k, cls: cls(k), v: poOsebi[k].neto })), kratkoSt(st.neto) + " €")),
        graf("Padec od vrha", krivulja(podvodno, { visina: 170, barva: "minus" }), `Največji padec ${evri(st.maxDD)}`)),
    ],
    uspesnost: () => [obdobjeIzbira,
      h("div", { class: "mreza dve" },
        h("div", { class: "chart" }, h("h3", {}, `Uspešnost po ${imeObd}`), legendaVsiF(),
          vecKrivulj([{ cls: "s-skupaj", tocke: obdobja.map((o) => ({ t: o.length === 7 ? o + "-15" : o, v: Math.round(wr(skupine.get(o)) * 100) })) },
            ...ljudje.map((k) => ({ cls: cls(k), tocke: obdobja.filter((o) => skupine.get(o).some((t) => t.k === k)).map((o) => ({ t: o.length === 7 ? o + "-15" : o, v: Math.round(wr(skupine.get(o).filter((t) => t.k === k)) * 100) })) }))], { visina: 200, enota: " %" })),
        graf("Porazdelitev rezultatov trejdov", stolpci(kosi.map((x) => ({ oznaka: kratkoSt(x.od), v: x.n, opis: `${evri(x.od)} do ${evri(x.od + korak)}: ${x.n} trejdov` })), { oznakeVsakih: 3 }), "Koliko trejdov je padlo v posamezen razpon")),
      h("div", { class: "viz" }, ljudje.map((k) => vk(k, obroc(poOsebi[k].wr, odstotek(poOsebi[k].wr), poOsebi[k].wr >= 0.5 ? "plus" : "minus"), h("div", { class: "pod" }, `PF ${pfStr(poOsebi[k].pf)}`))),
        h("div", { class: "vk" }, h("div", { class: "lbl" }, "Delež trejdov"), krof(ljudje.map((k) => ({ ime: k, cls: cls(k), v: poOsebi[k].n })), String(st.n)))),
    ],
    cas: () => [
      h("div", { class: "mreza dve" },
        h("div", { class: "chart" }, h("h3", {}, "Po dnevih v tednu"), legendaLjudjeF(),
          nalozeniStolpci(DNEVI, ljudje.map((k) => ({ ime: k, cls: cls(k), v: DNEVI.map((_, d) => vsota(trejdi.filter((t) => t.k === k && (new Date(t.t).getDay() + 6) % 7 === d))) })))),
        h("div", { class: "chart" }, h("h3", {}, "Po urah dneva"), legendaLjudjeF(),
          nalozeniStolpci(Array.from({ length: 24 }, (_, u) => String(u)), ljudje.map((k) => ({ ime: k, cls: cls(k), v: Array.from({ length: 24 }, (_, u) => vsota(trejdi.filter((t) => t.k === k && new Date(t.t).getHours() === u))) })), { oznakeVsakih: 3 }))),
      graf("Toplotna karta: dan × ura", toplota(napredno(trejdi).toplota, DNEVI), "REMAKO skupaj, ura vstopa"),
    ],
    primerjava: () => [obdobjeIzbira,
      h("div", { class: "mreza" },
        kartica("Rezultat", null, barlist(ljudje.map((k) => ({ ime: k, n: poOsebi[k].n, wr: poOsebi[k].wr, p: poOsebi[k].neto })))),
        kartica("Na trejd", null, barlist(ljudje.map((k) => ({ ime: k, n: poOsebi[k].n, wr: poOsebi[k].wr, p: Math.round(poOsebi[k].pricakovano * 100) / 100 })))),
        kartica("Največji padec", null, barlist(ljudje.map((k) => ({ ime: k, n: poOsebi[k].n, wr: poOsebi[k].wr, p: -poOsebi[k].maxDD }))))),
      h("div", { class: "chart" }, h("h3", {}, `Pregled po ${imeObd}`),
        tabela(["Obdobje", ...ljudje, "Skupaj", "Uspešnost"], [...obdobja].reverse().map((o) => {
          const a = skupine.get(o);
          return [OZNAKA[remakoObdobje](o), ...ljudje.map((k) => { const x = a.filter((t) => t.k === k); return x.length ? pnl(vsota(x)) : "—"; }), pnl(vsota(a)), odstotek(wr(a))];
        }))),
      h("p", { class: "fine" }, "Šteje samo živo trgovanje. Kdo trguje, se vzame iz polja »Trguje« na kartici računa (MT5 = algoritmi). Zneski so v valuti računov."),
    ],
  };
  if (!oddelek[remakoOddelek]) remakoOddelek = "pregled";
  zamenjaj(vsebina,
    h("nav", { class: "oddelki" }, ODDELKI.map(([k, ime, ik]) => h("button", { class: remakoOddelek === k ? "on" : "", onclick: () => ((remakoOddelek = k), seznam()) }, ikona(ik), ime))),
    ...oddelek[remakoOddelek]());
}
const kratkoSt = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)));

async function statistikaZaslon() {
  const uvozi = podatki.uvozi || [];
  const vsebina = h("div", {}, h("div", { class: "spin" }));
  zaslon(glavaOdprta(), pozdrav(), zavihki(), vsebina,
    h("button", { class: "fab", onclick: () => uvoziTrejde() }, ikona("plus"), "Uvozi zgodovino"));
  if (!uvozi.length) {
    return zamenjaj(vsebina, h("div", { class: "card" },
      h("h1", {}, "Statistika trejdov"),
      h("p", { class: "muted" }, "Uvozi zgodovino trejdov iz platforme in tukaj dobita celotno statistiko z grafi: dobiček, uspešnost, najboljše in najslabše dni, ure in instrumente."),
      h("p", { class: "muted small" }, "MetaTrader 5: Zgodovina › desni klik › Poročilo › Excel ali HTML. AMP Futures: izpisek trejdov (Trade/Fill report) iz platforme kot CSV ali Excel. Bitunix: Futures › Zgodovina › Izvozi (CSV). Topstep: Trades › Export (CSV)."),
      h("button", { class: "btn", onclick: () => uvoziTrejde() }, "Uvozi prvo zgodovino")));
  }
  let vsi;
  try {
    vsi = await naloziTrejde();
  } catch (e) {
    console.error(e);
    return zamenjaj(vsebina, h("p", { class: "err" }, "Zgodovine ni bilo mogoče naložiti. Poskusi znova."));
  }
  if (pogled !== "statistika") return;
  const racuni = [...new Set(uvozi.map((u) => u.racun))];
  const jaz = beriIme();
  const osebaRacuna = (r) => trgovalec(uvozi.find((u) => u.racun === r));
  const osebe = [...new Set(racuni.map(osebaRacuna))].sort((a, b) => (a === jaz ? -1 : b === jaz ? 1 : a.localeCompare(b)));
  if (statFilter.racun === "moji") statFilter.racun = osebe.includes(jaz) ? "oseba:" + jaz : "vsi";
  const izbranaOseba = statFilter.racun.startsWith("oseba:") ? statFilter.racun.slice(6) : null;
  if (izbranaOseba && !osebe.includes(izbranaOseba)) statFilter.racun = "vsi";
  const moji = racuni.filter((r) => osebaRacuna(r) === jaz);
  const naRacunu = (r) => statFilter.racun === "vsi" || (izbranaOseba ? osebaRacuna(r) === izbranaOseba : r === statFilter.racun);
  const meja = { vse: 0, "30": Date.now() - 30 * 864e5, "90": Date.now() - 90 * 864e5, leto: new Date(new Date().getFullYear(), 0, 1).getTime() }[statFilter.obdobje] || 0;
  const vVrsti = vsi.filter((t) => t.v === statFilter.vrsta);
  const algoritmi = [...new Set(vVrsti.filter((t) => naRacunu(t.r)).map((t) => t.a).filter(Boolean))];
  if (statFilter.algo !== "vsi" && !algoritmi.includes(statFilter.algo)) statFilter.algo = "vsi";
  const izbrani = vVrsti.filter((t) => naRacunu(t.r) && (statFilter.algo === "vsi" || t.a === statFilter.algo) && new Date(t.t).getTime() >= meja);
  const st = izracunaj(izbrani);
  const cip = (aktivno, ime, klik) => h("button", { class: "chip" + (aktivno ? " on" : ""), onclick: klik }, ime);
  const filtri = [
    vsi.some((t) => t.v === "test") ? h("div", { class: "tabs small" },
      h("button", { class: statFilter.vrsta === "zivo" ? "on" : "", onclick: () => ((statFilter.vrsta = "zivo"), seznam()) }, "Živo trgovanje"),
      h("button", { class: statFilter.vrsta === "test" ? "on" : "", onclick: () => ((statFilter.vrsta = "test"), seznam()) }, "Backtesti")) : null,
    h("div", { class: "chips" }, osebe.map((o) => cip(statFilter.racun === "oseba:" + o, o === jaz ? `Moja (${o})` : o, () => ((statFilter.racun = "oseba:" + o), seznam()))),
      cip(statFilter.racun === "vsi", "Vsi", () => ((statFilter.racun = "vsi"), seznam())),
      racuni.map((r) => cip(statFilter.racun === r, r, () => ((statFilter.racun = r), seznam())))),
    algoritmi.length ? h("div", { class: "chips" }, cip(statFilter.algo === "vsi", "Vsi algoritmi", () => ((statFilter.algo = "vsi"), seznam())),
      algoritmi.map((a) => cip(statFilter.algo === a, [ikona("robot"), a], () => ((statFilter.algo = a), seznam())))) : null,
    h("div", { class: "chips" }, [["vse", "Ves čas"], ["30", "30 dni"], ["90", "90 dni"], ["leto", "Letos"]].map(([k, ime]) => cip(statFilter.obdobje === k, ime, () => ((statFilter.obdobje = k), seznam())))),
  ];
  if (!st.n) return zamenjaj(vsebina, ...filtri, h("p", { class: "empty" }, "V tem izboru ni trejdov."));

  const tedni = DNEVI.map((ime, i) => st.tedni.find((d) => d.k === i) || { k: i, n: 0, p: 0, wr: 0 });
  const ure = st.ure.sort((a, b) => a.k - b.k);
  const zadnjiDnevi = st.dnevi.slice(-60);
  const mes = st.meseci.map((m) => ({ oznaka: MESECI[+m.k.slice(5) - 1] + (st.meseci.length > 12 ? " " + m.k.slice(2, 4) : ""), v: m.p, opis: `${m.k}: ${evri(m.p)}, ${m.n} trejdov` }));
  const DAN_IME = ["ponedeljek", "torek", "sreda", "četrtek", "petek", "sobota", "nedelja"];
  const sTrejdi = (a) => a.filter((x) => x.n >= 3);
  const najTeden = [...sTrejdi(tedni)].sort((a, b) => b.p - a.p);
  const najUra = [...sTrejdi(ure)].sort((a, b) => b.p - a.p);

  const an = napredno(izbrani);
  const nasvet = coach(st, an, evri, odstotek, false);
  const teden = tedenski(izbrani);
  const pf = (x) => (Number.isFinite(x) ? x.toFixed(2) : "∞");
  const k = an.konsistenca;
  let vrh = 0, kap = 0;
  const podvodno = [...izbrani].sort((a, b) => a.t.localeCompare(b.t)).map((t) => { kap += t.p; vrh = Math.max(vrh, kap); return { t: t.t, v: kap - vrh }; });

  // Gradniki
  const vk = (lbl, ...vsebina) => h("div", { class: "vk" }, h("div", { class: "lbl" }, lbl), ...vsebina);
  const par = (vrstice) => { const max = Math.max(1, ...vrstice.map((r) => Math.abs(r[1]))); return h("div", { class: "par" }, vrstice.map(([ime, v, cls, besedilo]) => h("div", { class: "vrsta" }, ime, h("div", { class: "bar" }, h("i", { class: cls, style: `width:${Math.max(3, (Math.abs(v) / max) * 100)}%` })), h("b", {}, besedilo ?? evri(v))))); };
  const barlist = (items) => { const max = Math.max(1, ...items.map((x) => Math.abs(x.p))); return h("div", { class: "barlist" }, items.map((x) => h("div", { class: "bl" },
    h("div", { class: "ime" }, x.ime, h("small", {}, `${x.n} trejdov · ${odstotek(x.wr)}`)),
    h("div", { class: "os" }, h("i", { class: x.p >= 0 ? "plus" : "minus", style: `width:${(Math.abs(x.p) / max) * 50}%` })),
    h("div", { class: "zn" }, pnl(x.p))))); };
  const kartica = (naslov, opomba, ...vsebina) => h("div", { class: "chart" }, h("h3", {}, naslov), opomba ? h("div", { class: "note" }, opomba) : null, ...vsebina);
  const znacka = (ik, besedilo, cls) => h("span", { class: "znacka " + (cls || "") }, ikona(ik), besedilo);

  const simKartica = h("div", { class: "chart" });
  const narisiSim = () => {
    const sim = simuliraj(izbrani, simPravila);
    const izbor = (opis, kljuc, moznosti) => h("label", {}, opis, h("select", { onchange: (e) => ((simPravila[kljuc] = kljuc === "brezSeje" ? e.target.value : +e.target.value), narisiSim()) },
      moznosti.map(([v, ime]) => h("option", { value: v, selected: simPravila[kljuc] === v }, ime))));
    const razlika = sim.neto - st.neto;
    zamenjaj(simKartica, h("h3", {}, "Simulator pravil"),
      h("div", { class: "note" }, "Kaj bi bilo, če bi se držal teh pravil (na istih trejdih)."),
      h("div", { class: "sim" },
        izbor("Največ trejdov na dan", "maxNaDan", [[0, "brez omejitve"], [1, "1"], [2, "2"], [3, "3"], [5, "5"], [10, "10"], [20, "20"]]),
        izbor("Konec dneva po izgubah", "stopPoIzgubah", [[0, "nikoli"], [1, "po 1. izgubi"], [2, "po 2 izgubah"], [3, "po 3 izgubah"]]),
        izbor("Brez seje", "brezSeje", [["", "trguj vse seje"], ...SEJE.slice(0, 3).map(([ime]) => [ime, ime])]),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: simPravila.samoKz, onchange: (e) => ((simPravila.samoKz = e.target.checked), narisiSim()) }), "Samo v killzonah (brez NY kosila)")),
      h("div", { class: "viz" },
        vk("Neto s pravili", h("div", { class: "vrednost" }, pnl(sim.neto)), h("div", { class: "pod " + (razlika >= 0 ? "pos" : "neg") }, (razlika >= 0 ? "+" : "−") + evri(Math.abs(razlika)) + " proti dejanskemu")),
        vk("Trejdov", obroc(st.n ? sim.n / st.n : 0, String(sim.n), "vij"), h("div", { class: "pod" }, `od ${st.n}`)),
        vk("Uspešnost", obroc(sim.wr, odstotek(sim.wr), sim.wr >= 0.5 ? "plus" : "minus"), h("div", { class: "pod" }, `dejansko ${odstotek(st.wr)}`)),
        vk("Največji padec", h("div", { class: "vrednost neg" }, "−" + evri(sim.maxDD)), h("div", { class: "pod" }, `dejansko −${evri(st.maxDD)}`))),
      vecKrivulj([{ cls: "s-drugi", tocke: st.krivulja }, { cls: "s-skupaj", tocke: sim.krivulja }], { visina: 200 }),
      h("div", { class: "legenda" }, h("span", { class: "s-skupaj" }, "S pravili"), h("span", { class: "s-drugi" }, "Dejansko")));
  };
  narisiSim();

  const ODDELKI = [["pregled", "Pregled", "vse"], ["cas", "Čas", "koledar"], ["izvedba", "Izvedba", "trend"], ["sim", "Simulator", "robot"], ["instr", "Instrumenti", "graf"]];
  const oddelek = {
    pregled: () => [
      h("div", { class: "mreza dve" },
        h("div", { class: "hero" }, h("div", { class: "lbl" }, "Neto rezultat"), h("div", { class: "velik" }, pnl(st.neto)),
          h("div", { class: "pod" }, `${st.n} trejdov · ${datum(st.od.slice(0, 10))} – ${datum(st.do.slice(0, 10))} · ${evri(st.pricakovano)} na trejd`),
          iskrica(st.krivulja, st.neto >= 0 ? "plus" : "minus")),
        h("div", { class: "viz" },
          vk("Uspešnost", obroc(st.wr, odstotek(st.wr), st.wr >= 0.5 ? "plus" : "minus"), h("div", { class: "pod" }, `${st.zmag} ✓ · ${st.porazov} ✗`)),
          vk("Profit factor", merilnik(st.pf, 3, pf(st.pf)), h("div", { class: "pod" }, st.pf >= 1.5 ? "odlično" : st.pf >= 1 ? "v plusu" : "pod 1 = izguba")),
          vk("Zeleni dnevi", obroc(st.zelenihDni, odstotek(st.zelenihDni), "plus"), h("div", { class: "pike" }, st.dnevi.slice(-28).map((d) => h("i", { class: d.p > 0 ? "plus" : d.p < 0 ? "minus" : "nic", title: `${datum(d.k)}: ${evri(d.p)}` })))),
          vk("Največji padec", h("div", { class: "vrednost neg" }, "−" + evri(st.maxDD)), iskrica(podvodno, "minus")))),
      h("div", { class: "znacke" },
        najTeden.length ? znacka("koledar", `Najboljši dan: ${DAN_IME[najTeden[0].k]}`, "plus") : null,
        najUra.length ? znacka("trend", `Najboljša ura: ${najUra[0].k}:00`, "plus") : null,
        najUra.length > 1 && najUra[najUra.length - 1].p < 0 ? znacka("trend", `Najslabša ura: ${najUra[najUra.length - 1].k}:00`, "minus") : null,
        st.simboli.length ? znacka("graf", `Najboljši: ${st.simboli[0].k}`, "plus") : null,
        st.smeri.length === 2 ? znacka("graf", `Long ${evri(st.smeri.find((x) => x.k === "buy")?.p || 0)} · Short ${evri(st.smeri.find((x) => x.k === "sell")?.p || 0)}`) : null),
      h("div", { class: "mreza" },
        kartica("Dobitek proti izgubi", null, par([["Povp. dobitek", st.povpZ, "plus"], ["Povp. izguba", st.povpP, "minus"], ["Najboljši", st.najboljsi.p, "plus"], ["Najslabši", st.najslabsi.p, "minus"]]),
          h("div", { class: "note" }, `Razmerje ${st.povpP ? (st.povpZ / -st.povpP).toFixed(2) : "—"} · niz ${st.nizZ} ✓ / ${st.nizP} ✗`)),
        kartica("Zadnjih 60 trejdov", "Zeleno navzgor dobitek, rdeče navzdol izguba", trak([...izbrani].sort((a, b) => a.t.localeCompare(b.t)).slice(-60).map((t) => t.p))),
        teden.ta.n || teden.prej.n ? kartica("Ta teden proti prejšnjemu", null, par([["Ta teden", teden.ta.p, teden.ta.p >= 0 ? "plus" : "minus"], ["Prejšnji", teden.prej.p, teden.prej.p >= 0 ? "plus" : "minus"]]),
          h("div", { class: "note" }, `${teden.ta.n} trejdov (${odstotek(teden.ta.wr)}) · prej ${teden.prej.n} (${odstotek(teden.prej.wr)})`)) : null),
      nasvet.skodi.length || nasvet.pomaga.length ? h("div", { class: "coach" },
        h("div", { class: "coach-col" }, h("b", {}, !izbranaOseba || izbranaOseba === jaz ? "Kaj ti škodi" : `Kaj škodi (${izbranaOseba})`), nasvet.skodi.length ? h("ul", {}, nasvet.skodi.slice(0, 4).map((u) => h("li", {}, u))) : h("p", { class: "dim small" }, "Nič izrazitega.")),
        h("div", { class: "coach-col dobro" }, h("b", {}, !izbranaOseba || izbranaOseba === jaz ? "Kaj ti pomaga" : `Kaj pomaga (${izbranaOseba})`), nasvet.pomaga.length ? h("ul", {}, nasvet.pomaga.slice(0, 4).map((u) => h("li", {}, u))) : h("p", { class: "dim small" }, "Še premalo podatkov."))) : null,
      h("div", { class: "mreza dve" },
        graf("Krivulja kapitala", krivulja(st.krivulja)),
        graf("Rezultat po dnevih", stolpci(zadnjiDnevi.map((d) => ({ oznaka: d.k.slice(8) + "." + d.k.slice(5, 7), v: d.p, opis: `${datum(d.k)}: ${evri(d.p)}, ${d.n} trejdov` })), { oznakeVsakih: Math.ceil(zadnjiDnevi.length / 8) }))),
    ],
    cas: () => [
      h("div", { class: "mreza dve" },
        graf("Toplotna karta: dan × ura", toplota(an.toplota, DNEVI), "Zeleno dobiček, rdeče izguba. Ura vstopa."),
        graf("Koledar", koledar(new Map(st.dnevi.map((d) => [d.k, d.p]))), "Zadnjih 12 tednov")),
      h("div", { class: "mreza" },
        kartica("Seje", "Čas New York: Azija 18–03, London 03–08, New York 08–17", barlist(an.seje)),
        kartica("Killzone (ICT)", "Asia 20–24, London 2–5, NY AM 8:30–11, kosilo 12–13:30, NY PM 13:30–16", barlist([...an.killzone.filter((x) => x.n), { ime: "Izven killzon", ...an.izvenKz }])),
        kartica("Dnevi v tednu", null, barlist(tedni.filter((d) => d.n).map((d) => ({ ime: DAN_IME[d.k], ...d }))))),
      h("div", { class: "mreza dve" },
        graf("Po urah dneva", stolpci(ure.map((u) => ({ oznaka: String(u.k), v: u.p, opis: `${u.k}:00: ${evri(u.p)}, ${u.n} trejdov` })), { oznakeVsakih: ure.length > 12 ? 3 : 1 })),
        graf("Po mesecih", stolpci(mes, { oznakeVsakih: Math.ceil(mes.length / 8) }))),
    ],
    izvedba: () => [
      h("div", { class: "viz" },
        vk("Držanje dobitkov", h("div", { class: "vrednost pos" }, trajanjeKratko(an.izvedba.dobitki)), h("div", { class: "pod" }, "mediana")),
        vk("Držanje izgub", h("div", { class: "vrednost neg" }, trajanjeKratko(an.izvedba.izgube)), h("div", { class: "pod" }, "mediana")),
        vk("Najboljši dan", obroc(k.najDanDelez, odstotek(k.najDanDelez), k.najDanDelez > 0.5 ? "minus" : "zlata"), h("div", { class: "pod" }, "delež vsega dobička")),
        vk("Trejdov na dan", obroc(k.maxTrejdov ? k.povpTrejdov / k.maxTrejdov : 0, k.povpTrejdov.toFixed(0), "vij"), h("div", { class: "pod" }, `največ ${k.maxTrejdov}`))),
      h("div", { class: "mreza" },
        kartica("Po trajanju trejda", null, barlist(an.poTrajanju)),
        kartica("Kateri trejd v dnevu", "Ali se rezultat slabša z vsakim naslednjim trejdom", barlist(an.zapStevilka.map((z) => ({ ...z, ime: z.ime + " trejd" })))),
        kartica("Po izgubi in po dobitku", "Trejdi, odprti v 15 min po prejšnjem", barlist([{ ime: "Po izgubi", ...an.poIzgubi }, { ime: "Po dobitku", ...an.poDobitku }]))),
      h("p", { class: "fine" }, "MAE/MFE in dejanski risk/reward potrebujeta stop loss in gibanje cene med trejdom, ki jih izvozi ne vsebujejo."),
    ],
    sim: () => [simKartica],
    instr: () => [
      h("div", { class: "mreza" },
        st.simboli.length ? kartica("Instrumenti", null, barlist(st.simboli.slice(0, 12).map((x) => ({ ime: x.k, ...x })))) : null,
        st.algoritmi.length && statFilter.algo === "vsi" ? kartica("Algoritmi", null, barlist(st.algoritmi.map((x) => ({ ime: x.k, ...x })))) : null,
        racuni.length > 1 ? kartica("Računi", null, barlist(racuni.map((r) => { const x = izracunaj(izbrani.filter((t) => t.r === r)); return { ime: r, n: x.n, wr: x.wr, p: x.neto }; }).filter((x) => x.n))) : null,
        kartica("Uvoženo", null, h("div", { class: "barlist" }, uvozi.map((u) => h("div", { class: "uvoz" },
          h("div", {}, h("b", {}, u.racun + (u.algo ? " · " + u.algo : "") + (u.vrsta === "test" ? " · backtest" : "")), h("div", { class: "dim small" }, `${u.st} trejdov · ${u.ime} · ${u.kdo || ""} ${new Date(u.dodano).toLocaleDateString("sl-SI")}`)),
          h("button", { class: "mini danger", onclick: async () => {
            if (!confirm(`Odstranim uvoz »${u.ime}«?`)) return;
            await spremeni((d) => (d.uvozi = (d.uvozi || []).filter((y) => y.id !== u.id)));
            deleteObject(potDatoteke(trezor.id, u.id)).catch(() => {});
            trejdiCache.delete(u.id);
            seznam();
          } }, "Odstrani")))))),
      h("p", { class: "fine" }, "Isti trejdi v več uvozih se štejejo enkrat. Zneski so v valuti računa."),
    ],
  };
  if (!oddelek[statOddelek]) statOddelek = "pregled";
  zamenjaj(vsebina,
    h("div", { class: "statglava" }, h("div", {}, ...filtri), h("nav", { class: "oddelki" }, ODDELKI.map(([k, ime, ik]) =>
      h("button", { class: statOddelek === k ? "on" : "", onclick: () => ((statOddelek = k), seznam()) }, ikona(ik), ime)))),
    ...oddelek[statOddelek]());
}

// Prebere datoteko (CSV, Excel, HTML) in poišče tabelo s trejdi. Vrne { vrstice, tab } ali null.
async function preberiTrejde(f) {
  const bajti = new Uint8Array(await f.arrayBuffer());
  // MetaTrader 5 shrani HTML poročilo v UTF-16, zato besedilo dekodiramo sami.
  const utf16 = (bajti[0] === 0xff && bajti[1] === 0xfe) || (bajti[0] === 0xfe && bajti[1] === 0xff);
  const wb = utf16 || /\.(html?|csv|txt)$/i.test(f.name)
    ? beriTabelo(new TextDecoder(utf16 ? (bajti[0] === 0xff ? "utf-16le" : "utf-16be") : "utf-8").decode(bajti), { type: "string", cellDates: true, dense: true, raw: true })
    : beriTabelo(bajti, { type: "array", cellDates: true, dense: true });
  let naj = null;
  for (const ime_ of wb.SheetNames) {
    const v = tabelaUtils.sheet_to_json(wb.Sheets[ime_], { header: 1, raw: true, defval: "" });
    const t = najdiTabelo(v);
    if (t && t.vrstice.length && (!naj || t.vrstice.length > naj.tab.vrstice.length)) naj = { vrstice: v, tab: t };
  }
  return naj;
}
const jeTabela = (f) => /\.(csv|xlsx?|html?|txt)$/i.test(f.name);

function uvoziTrejde(datoteka) {
  const racuni = podatki.vnosi.filter((v) => v.kat === "trgovanje").map((v) => v.naziv);
  const iz_imena = datoteka && racuni.find((r) => {
    const n = datoteka.name.toLowerCase(), k = r.toLowerCase();
    return n.includes(k.split(" ")[0]) || (/metatrader|mt5/.test(k) && /mt5|metatrader|report/.test(n));
  });
  // Privzeto račun, na katerem trguje ta oseba (Tim → Bitunix, Teo → AMP).
  const moj = racuni.find((r) => trgovalec({ racun: r }) === beriIme());
  let racun = iz_imena || moj || racuni[0] || "";
  let algo = "", vrsta = "zivo";
  const znaniAlgo = [...new Set((podatki.uvozi || []).map((u) => u.algo).filter(Boolean))];
  let vrstice = null, tab = null, ime = "";
  const predogled = h("div", {});
  async function obdelaj(f) {
    ime = f.name;
    zamenjaj(predogled, h("div", { class: "spin" }));
    try {
      const naj = await preberiTrejde(f);
      if (!naj) throw new Error("ni tabele");
      vrstice = naj.vrstice;
      tab = naj.tab;
      narisi();
    } catch (err) {
      console.error(err);
      zamenjaj(predogled, h("p", { class: "err" }, "V datoteki nisem našel trejdov (stolpca s časom in dobičkom). Poskusi izvoz kot CSV ali Excel."));
    }
  }
  const izbira = h("input", { type: "file", accept: ".csv,.xlsx,.xls,.html,.htm,.txt", class: "hidden", onchange: (e) => e.target.files[0] && obdelaj(e.target.files[0]) });
  const STOLPCI = [["cas", "Čas zaprtja"], ["odprto", "Čas odprtja"], ["sym", "Instrument"], ["smer", "Smer"], ["kol", "Količina"], ["pnl", "Dobiček / P&L"], ["prov", "Provizija"], ["swap", "Swap"], ["algo", "Algoritem (Magic/Comment)"]];
  function narisi() {
    const trejdi = vTrejde(tab.vrstice, tab.stolpci);
    const vsota = trejdi.reduce((a, t) => a + t.p, 0);
    zamenjaj(predogled, 
      h("p", { class: "ok" }, `Najdenih ${trejdi.length} trejdov, skupaj ${evri(vsota)}.`),
      h("details", {}, h("summary", { class: "muted small" }, "Stolpci (popravi, če je kaj narobe)"),
        STOLPCI.map(([k, opis]) => h("label", {}, opis, h("select", { onchange: (e) => ((tab.stolpci[k] = +e.target.value), k === "prov" && delete tab.stolpci.provVse, narisi()) },
          h("option", { value: -1 }, "—"), tab.glava.map((g, i) => h("option", { value: i, selected: tab.stolpci[k] === i }, g || `stolpec ${i + 1}`))))),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!tab.stolpci.neto, onchange: (e) => ((tab.stolpci.neto = e.target.checked), narisi()) }), "Dobiček že vključuje provizije")),
      trejdi.length ? h("table", { class: "tbl" }, h("tr", {}, ["Zaprto", "Instr.", "P&L"].map((x) => h("th", {}, x))),
        trejdi.slice(-5).map((t) => h("tr", {}, h("td", {}, new Date(t.t).toLocaleString("sl-SI")), h("td", {}, t.s), h("td", {}, pnl(t.p))))) : null,
      h("button", { class: "btn", disabled: !trejdi.length || !racun, onclick: async (e) => {
        e.target.disabled = true;
        e.target.textContent = "Shranjujem …";
        try {
          const id = crypto.randomUUID();
          await uploadBytes(potDatoteke(trezor.id, id), await zakleniDatoteko(trezor, id, new TextEncoder().encode(JSON.stringify(trejdi))), { contentType: "application/octet-stream" });
          await spremeni((d) => (d.uvozi ||= []).push({ id, racun, ime, st: trejdi.length, dodano: Date.now(), kdo: beriIme(), algo: algo.trim(), vrsta }));
          trejdiCache.set(id, trejdi);
          s.remove();
          Object.assign(statFilter, { racun: "vsi", algo: "vsi", vrsta });
          pogled = "statistika";
          seznam();
          obvestilo(`Uvoženih ${trejdi.length} trejdov`);
        } catch (err) {
          console.error(err);
          obvestilo("Uvoz ni uspel");
          e.target.disabled = false;
          e.target.textContent = "Uvozi";
        }
      } }, `Uvozi v »${racun || "?"}«`)
    );
  }
  const s = list([
    h("div", { class: "row between" }, h("h1", {}, "Uvozi zgodovino"), h("button", { class: "iconbtn", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, ikona("zapri"))),
    h("label", {}, "Račun", h("select", { onchange: (e) => ((racun = e.target.value), tab && narisi()) }, racuni.map((r) => h("option", { value: r, selected: r === racun }, r)))),
    !racuni.length && h("p", { class: "err" }, "Najprej dodaj trgovalni račun v kategoriji Trgovanje."),
    h("label", {}, "Vrsta", h("select", { onchange: (e) => (vrsta = e.target.value) },
      h("option", { value: "zivo" }, "Živo trgovanje (pravi ali demo račun)"),
      h("option", { value: "test" }, "Backtest (MT5 Strategy Tester)"))),
    h("label", {}, "Algoritem (neobvezno, npr. ime EA)",
      h("input", { list: "algoritmi", placeholder: "Prazno = ročno trgovanje ali iz stolpca Magic/Comment", oninput: (e) => (algo = e.target.value) }),
      h("datalist", { id: "algoritmi" }, znaniAlgo.map((a) => h("option", { value: a })))),
    h("p", { class: "muted small" }, "Datoteka: CSV, Excel (xlsx) ali HTML poročilo. MetaTrader 5: Zgodovina › desni klik › Poročilo. AMP: Trade/Fill report. Bitunix: Zgodovina › Izvozi. Topstep: Trades › Export."),
    izbira,
    h("button", { class: "btn ghost", onclick: () => izbira.click() }, "Izberi datoteko"),
    predogled,
  ], seznam);
  if (datoteka) obdelaj(datoteka);
}

/* ---------- Nalaganje datotek ---------- */

function meniDodaj() {
  const moznost = (ik, naslov, opis, klik) => h("button", { class: "option", onclick: () => (s.remove(), klik()) },
    h("span", { class: "option-ik" }, ikona(ik)), h("span", { class: "grow" }, h("b", {}, naslov), h("span", { class: "dim small block" }, opis)));
  const s = list([
    h("div", { class: "row between" }, h("h1", {}, "Dodaj"), h("button", { class: "iconbtn", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, ikona("zapri"))),
    moznost("prenos", "Naloži datoteke", "Pogodbe, licence, računi, potrdila o izplačilih, maili (PDF, slike …)", () => nalozi()),
    moznost("trend", "Uvozi zgodovino trejdov", "Izvoz iz MT5, AMP Bitunixa ali Topstepa za statistiko", () => uvoziTrejde()),
    moznost("pero", "Nov vnos", "Geslo, račun, podatki ali opomba", () => uredi(null)),
  ], seznam);
}

let odprtoNalaganje = null;
function nalozi(zacetne = []) {
  const vrsta = []; // { file, naziv, kat, trejdi }
  const seznamEl = h("div", {});
  const dodajDatoteke = async (files) => {
    for (const file of files) {
      if (file.size > NAJVEC_MB * 1048576) { obvestilo(`${file.name} je večja od ${NAJVEC_MB} MB`); continue; }
      const z = { file, naziv: file.name.replace(/\.[^.]+$/, ""), kat: /racun|račun|invoice|payout|izplač|nakaz|potrdilo|receipt/i.test(file.name) ? "denar" : "dokumenti", trejdi: 0 };
      vrsta.push(z);
      if (jeTabela(file)) preberiTrejde(file).then((r) => ((z.trejdi = r ? vTrejde(r.tab.vrstice, r.tab.stolpci).length : 0), narisi())).catch(() => {});
    }
    narisi();
  };
  const narisi = () => zamenjaj(seznamEl, vrsta.map((z, i) => h("div", { class: "upl" },
    h("div", { class: "row" }, h("span", { class: "upl-ik" }, ikona(z.trejdi ? "trend" : "dokument")), h("span", { class: "grow dim small" }, `${z.file.name} · ${velikost(z.file.size)}`),
      h("button", { class: "mini icon", "aria-label": "Odstrani", onclick: () => (vrsta.splice(i, 1), narisi()) }, ikona("zapri"))),
    z.trejdi ? h("div", { class: "hint" }, `To je zgodovina trejdov (${z.trejdi}).`,
      h("button", { class: "mini", onclick: () => { vrsta.splice(i, 1); s.remove(); uvoziTrejde(z.file); } }, "Uvozi v statistiko")) : null,
    h("input", { value: z.naziv, placeholder: "Naziv", oninput: (e) => (z.naziv = e.target.value) }),
    h("select", { onchange: (e) => (z.kat = e.target.value) }, KATEGORIJE.map(([id, ime]) => h("option", { value: id, selected: z.kat === id }, ime))))),
    !vrsta.length && h("p", { class: "muted small center" }, "Ni še izbranih datotek."));
  const izbira = h("input", { type: "file", multiple: true, class: "hidden", onchange: (e) => (dodajDatoteke([...e.target.files]), (e.target.value = "")) });
  const shrani = h("button", { class: "btn", onclick: async () => {
    if (!vrsta.length) return obvestilo("Izberi datoteke");
    shrani.disabled = true;
    try {
      const novi = [];
      for (const [i, z] of vrsta.entries()) {
        zamenjaj(shrani, `Nalagam ${i + 1}/${vrsta.length} …`);
        const meta = { id: crypto.randomUUID(), ime: z.file.name, tip: z.file.type || "application/octet-stream", velikost: z.file.size };
        await uploadBytes(potDatoteke(trezor.id, meta.id), await zakleniDatoteko(trezor, meta.id, new Uint8Array(await z.file.arrayBuffer())), { contentType: "application/octet-stream" });
        novi.push({ id: crypto.randomUUID(), naziv: z.naziv.trim() || z.file.name, kat: z.kat, polja: [], datoteke: [meta], datum: z.kat === "denar" ? new Date().toISOString().slice(0, 10) : undefined, dodal: beriIme(), spremenjeno: Date.now() });
      }
      await spremeni((d) => d.vnosi.push(...novi));
      s.remove();
      filter.kat = "vse";
      seznam();
      obvestilo(novi.length === 1 ? "Datoteka naložena" : `Naloženih ${novi.length} datotek`);
    } catch (err) {
      console.error(err);
      obvestilo("Nalaganje ni uspelo");
      shrani.disabled = false;
      zamenjaj(shrani, "Naloži");
    }
  } }, "Naloži");
  const cona = h("button", { class: "drop", onclick: () => izbira.click() }, ikona("prenos"), h("b", {}, "Izberi datoteke"), h("span", { class: "dim small" }, "ali jih povleci sem · do 25 MB, šifrirano"));
  const s = list([
    h("div", { class: "row between" }, h("h1", {}, "Naloži datoteke"), h("button", { class: "iconbtn", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, ikona("zapri"))),
    izbira, cona, seznamEl, shrani,
  ], seznam);
  narisi();
  odprtoNalaganje = { s, dodaj: dodajDatoteke };
  if (zacetne.length) dodajDatoteke(zacetne);
}

// Povleci in spusti datoteke kamorkoli na stran.
window.addEventListener("dragover", (e) => { if (trezor && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (!trezor || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  if (odprtoNalaganje && document.body.contains(odprtoNalaganje.s)) odprtoNalaganje.dodaj([...e.dataTransfer.files]);
  else nalozi([...e.dataTransfer.files]);
});

// Šifrirana kopija v datoteki: odpre se samo s kodo, ki je veljala ob prenosu.
function varnostnaKopija() {
  const datoteka = h("input", { type: "file", accept: ".json,application/json" });
  const koda = h("input", { type: "password", autocomplete: "off", placeholder: "Koda, ki je veljala ob prenosu kopije" });
  const sporocilo = h("p", { class: "err" });
  return h(
    "div",
    {},
    h("h2", {}, "Varnostna kopija"),
    h("p", { class: "muted" }, "Na telefonu izberi »Shrani v Datoteke« (iCloud) ali Google Drive, na računalniku se datoteka shrani med Prenose. Kopija je šifrirana in se odpre samo s kodo, ki velja ob prenosu. Priponke niso v kopiji: pomembne pogodbe hranita tudi posebej."),
    h("button", {
      class: "btn ghost",
      type: "button",
      onclick: async () => {
        const kopija = { aplikacija: "remako-trezor", razlicica: 1, ustvarjeno: new Date().toISOString(), id: trezor.id, ...(await zakleni(trezor, podatki)) };
        const ime = `remako-trezor-${kopija.ustvarjeno.slice(0, 10)}.json`;
        const blob = new Blob([JSON.stringify(kopija)], { type: "application/json" });
        const datoteka = new File([blob], ime, { type: "application/json" });
        // Na telefonu meni Deli (Shrani v Datoteke, iCloud, Google Drive), na računalniku navaden prenos.
        if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files: [datoteka] })) {
          try {
            await navigator.share({ files: [datoteka], title: "REMAKO trezor kopija" });
            return obvestilo("Kopija shranjena");
          } catch (e) {
            if (e.name === "AbortError") return;
          }
        }
        const a = h("a", { href: URL.createObjectURL(blob), download: ime });
        document.body.append(a);
        a.click();
        a.remove();
        obvestilo("Kopija prenesena");
      },
    }, "Prenesi varnostno kopijo"),
    h("label", {}, "Obnovi iz kopije (doda vnose, ki jih v trezorju ni)"),
    datoteka,
    koda,
    sporocilo,
    h("button", {
      class: "btn ghost",
      type: "button",
      onclick: async () => {
        sporocilo.textContent = "";
        try {
          const kopija = JSON.parse(await datoteka.files[0].text());
          const t = await izKode(koda.value);
          if (t.id !== kopija.id) return (sporocilo.textContent = "Koda ne ustreza tej kopiji.");
          const iz = await odkleni(t, kopija);
          let n = 0;
          await spremeni((d) => {
            const imamo = new Set(d.vnosi.map((v) => v.id));
            for (const v of iz.vnosi || []) if (!imamo.has(v.id)) (d.vnosi.push(v), n++);
          });
          obvestilo(`Obnovljenih vnosov: ${n}`);
        } catch (err) {
          console.error(err);
          sporocilo.textContent = "Kopije ni bilo mogoče odpreti.";
        }
      },
    }, "Obnovi")
  );
}

zaklenjeno();
