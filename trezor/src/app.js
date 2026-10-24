// REMAKO trezor: gesla, uporabniška imena in podatki podjetja za dva človeka s skupno kodo.
// Vse se šifrira v brskalniku (kripto.js); v Firestore gre samo šifrirano besedilo.

import { initializeApp } from "firebase/app";
import { initializeFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { izKode, zakleni, odkleni, mocKode, novoGeslo, NAJMANJ_ZNAKOV } from "./kripto.js";

/* global FB_CONFIG */
const db = initializeFirestore(initializeApp(FB_CONFIG), { ignoreUndefinedProperties: true });
if (location.hostname === "localhost") connectFirestoreEmulator(db, "127.0.0.1", 8080); // samo za preizkus
const KATEGORIJE = [
  ["gesla", "Gesla"],
  ["podjetje", "Podjetje"],
  ["banka", "Banka"],
  ["trgovanje", "Trgovanje"],
  ["opombe", "Opombe"],
];
const imeKat = (k) => (KATEGORIJE.find(([id]) => id === k) || [, "Drugo"])[1];

let trezor = null; // { id, kljuc }
let podatki = null; // { vnosi: [...] }
let posodobljeno = null;
let odjava = null;
let filter = { kat: "vse", isci: "" };

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
const zaslon = (...vsebina) => app.replaceChildren(...vsebina);

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
  h("header", { class: "top" }, h("div", { class: "logo" }, h("span", { class: "r" }, "[R]"), "EMAKO.", h("span", { class: "grad" }, " TREZOR")), h("div", { class: "row" }, ...desno));

/* ---------- Zaklenjeno ---------- */

function zaklenjeno(sporocilo) {
  const vnos = h("input", { type: "password", id: "koda", autocomplete: "current-password", placeholder: "Koda", autofocus: true });
  const napaka = h("p", { class: "err" }, sporocilo || "");
  const gumb = h("button", { class: "btn", type: "submit" }, "Odkleni");
  const obrazec = h(
    "form",
    {
      class: "card narrow",
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
          } else {
            nov(vnos.value);
          }
        } catch (err) {
          console.error(err);
          napaka.textContent = err?.code === "unavailable" ? "Ni povezave. Poskusi znova." : "Trezorja ni bilo mogoče odpreti.";
          gumb.disabled = false;
          gumb.textContent = "Odkleni";
        }
      },
    },
    h("h1", {}, "Zasebni trezor"),
    h("p", { class: "muted" }, "Gesla, uporabniška imena in podatki REMAKO d.o.o. Vstop samo s kodo."),
    vnos,
    napaka,
    gumb,
    h("p", { class: "fine" }, "Vse je šifrirano na tvoji napravi. Kode ne hrani nihče, zato je ni mogoče obnoviti.")
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
            odprt();
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

function odprt() {
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
  document.querySelectorAll(".sheet").forEach((s) => s.remove());
  zaklenjeno(sporocilo);
}

const ujema = (v, q) =>
  !q || [v.naziv, v.uporabnik, v.povezava, v.opombe, ...(v.polja || []).filter((p) => !p.skrito).flatMap((p) => [p.ime, p.vrednost])]
    .some((s) => String(s || "").toLowerCase().includes(q));

function seznam() {
  const vnosi = [...podatki.vnosi].sort((a, b) => a.naziv.localeCompare(b.naziv, "sl"));
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
    h("button", { class: "chip" + (filter.kat === id ? " on" : ""), onclick: () => ((filter.kat = id), seznam()) }, ime, n != null && h("span", { class: "n" }, n));

  zaslon(
    glava(
      h("button", { class: "iconbtn", title: "Nastavitve", "aria-label": "Nastavitve", onclick: nastavitve }, "⚙"),
      h("button", { class: "iconbtn", title: "Zakleni", "aria-label": "Zakleni", onclick: () => zakleni_() }, "🔒")
    ),
    isci,
    h("div", { class: "chips" }, cip("vse", "Vse", vnosi.length), KATEGORIJE.map(([id, ime]) => cip(id, ime, stej(id)))),
    prikazani.length
      ? h("div", { class: "list" }, prikazani.map((v) => vrstica(v)))
      : h("p", { class: "empty" }, q ? "Ni zadetkov." : "Tukaj še ni ničesar. Dodaj prvi vnos."),
    h("p", { class: "fine" }, posodobljeno ? `Zadnja sprememba: ${posodobljeno.toLocaleString("sl-SI")}` : ""),
    h("button", { class: "fab", onclick: () => uredi(null) }, "+ Dodaj")
  );
}

function vrstica(v) {
  const pod = v.uporabnik || (v.polja || []).find((p) => p.vrednost && !p.skrito && p.vrednost !== v.naziv)?.vrednost || imeKat(v.kat);
  return h(
    "div",
    { class: "item", tabindex: "0", onclick: () => podrobno(v.id), onkeydown: (e) => e.key === "Enter" && podrobno(v.id) },
    h("div", { class: "av k-" + v.kat }, (v.naziv || "?").trim().charAt(0).toUpperCase()),
    h("div", { class: "grow" }, h("div", { class: "t" }, v.naziv), h("div", { class: "s" }, pod)),
    v.geslo && h("button", { class: "mini", onclick: (e) => (e.stopPropagation(), kopiraj(v.geslo, "Geslo")) }, "Kopiraj geslo")
  );
}

function list(vsebina, zapri) {
  const ozadje = h("div", { class: "sheet", onclick: (e) => e.target === ozadje && (ozadje.remove(), zapri?.()) }, h("div", { class: "panel" }, vsebina));
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
      h("button", { class: "mini", onclick: () => kopiraj(vrednost, ime) }, "Kopiraj")
    )
  );
}

function podrobno(id) {
  const v = podatki.vnosi.find((x) => x.id === id);
  if (!v) return;
  const s = list(
    [
      h("div", { class: "row between" }, h("span", { class: "tag k-" + v.kat }, imeKat(v.kat)), h("button", { class: "iconbtn", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, "✕")),
      h("h1", {}, v.naziv),
      polje("Uporabniško ime", v.uporabnik),
      polje("Geslo", v.geslo, true),
      polje("Povezava", v.povezava),
      (v.polja || []).map((p) => polje(p.ime || "Podatek", p.vrednost, p.skrito)),
      v.opombe && h("div", { class: "field" }, h("div", { class: "lbl" }, "Opombe"), h("div", { class: "val pre" }, v.opombe)),
      h("button", { class: "btn", onclick: () => uredi(v) }, "Uredi"),
    ],
    seznam
  );
}

function uredi(v) {
  const nov_ = !v;
  const x = structuredClone(v || { id: crypto.randomUUID(), naziv: "", kat: filter.kat === "vse" ? "gesla" : filter.kat, polja: [] });
  const vh = (ime, kljuc, attrs = {}) =>
    h("label", {}, ime, h(attrs.tag || "input", { value: x[kljuc] || "", oninput: (e) => (x[kljuc] = e.target.value), ...attrs, tag: null }));

  const geslo = h("input", { value: x.geslo || "", type: "password", autocomplete: "new-password", oninput: (e) => (x.geslo = e.target.value) });
  const poljaEl = h("div", {});
  const narisiPolja = () =>
    poljaEl.replaceChildren(
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
            await spremeni((d) => {
              const i = d.vnosi.findIndex((y) => y.id === x.id);
              if (i >= 0) d.vnosi[i] = x;
              else d.vnosi.push(x);
            });
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
      h("div", { class: "row between" }, h("h1", {}, nov_ ? "Nov vnos" : "Uredi"), h("button", { class: "iconbtn", type: "button", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, "✕")),
      vh("Naziv", "naziv", { placeholder: "npr. Interactive Brokers", required: true }),
      h("label", {}, "Kategorija",
        h("select", { onchange: (e) => (x.kat = e.target.value) }, KATEGORIJE.map(([id, ime]) => h("option", { value: id, selected: x.kat === id }, ime)))),
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
      shrani,
      !nov_ &&
        h("button", {
          class: "btn ghost danger",
          type: "button",
          onclick: async () => {
            if (!confirm(`Izbrišem »${x.naziv}«?`)) return;
            try {
              await spremeni((d) => (d.vnosi = d.vnosi.filter((y) => y.id !== x.id)));
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
      h("div", { class: "row between" }, h("h1", {}, "Nastavitve"), h("button", { class: "iconbtn", type: "button", "aria-label": "Zapri", onclick: () => (s.remove(), seznam()) }, "✕")),
      h("p", { class: "muted" }, "Trezor ostane odklenjen, dokler ne zapreš strani ali klikneš ključavnico. Kopirana vsebina se iz odložišča pobriše po 45 sekundah."),
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

// Šifrirana kopija v datoteki: odpre se samo s kodo, ki je veljala ob prenosu.
function varnostnaKopija() {
  const datoteka = h("input", { type: "file", accept: ".json,application/json" });
  const koda = h("input", { type: "password", autocomplete: "off", placeholder: "Koda, ki je veljala ob prenosu kopije" });
  const sporocilo = h("p", { class: "err" });
  return h(
    "div",
    {},
    h("h2", {}, "Varnostna kopija"),
    h("p", { class: "muted" }, "Prenesi šifrirano kopijo in jo shrani na varno (npr. iCloud, Google Drive, USB). Odpre se samo s kodo, zato je varna tudi, če jo kdo najde."),
    h("button", {
      class: "btn ghost",
      type: "button",
      onclick: async () => {
        const kopija = { aplikacija: "remako-trezor", razlicica: 1, ustvarjeno: new Date().toISOString(), id: trezor.id, ...(await zakleni(trezor, podatki)) };
        const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(kopija)], { type: "application/json" })), download: `remako-trezor-${kopija.ustvarjeno.slice(0, 10)}.json` });
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
