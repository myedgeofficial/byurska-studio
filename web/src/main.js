import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, connectAuthEmulator
} from "firebase/auth";
import {
  initializeFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where,
  orderBy, limit, onSnapshot, writeBatch, arrayUnion, connectFirestoreEmulator
} from "firebase/firestore";
import { getStorage, ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject, connectStorageEmulator } from "firebase/storage";
import {
  ZACETNI_CLANI, ZACETNE_MAPE, PLATFORME, platformeIme, drevo, dan, ura, kdajBesedilo, opomnikiZa, PRIVZETI_OPOMNIKI, opisOpomnikov,
  vrstaDatoteke, velikost, veljavenEmail, nujnost, znesek, evri
} from "./data.js";
import { novaSol, kljucIzGesla, zakleni, odkleni, preveritev, pravilen } from "./trezor.js";

const Studio = registerPlugin("Studio");
const native = Capacitor.isNativePlatform();
const view = document.getElementById("view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);

/* ---------- ikone ---------- */
const ico = {
  nazaj: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  nast: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>`,
  vec: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
  plus: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  play: `<svg class="play" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>`,
  dat: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-linejoin="round"><path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5"/></svg>`,
  povezava: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.7" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/></svg>`,
  kljucavnica: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/></svg>`,
  chev: `<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>`
};

/* ---------- drobni pripomočki ---------- */
let toastT;
function toast(t) {
  const el = $("toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600);
}
const napaka = (e) => toast("Ni uspelo" + (e?.code ? ` (${String(e.code).replace(/^.*\//, "")})` : ""));

function openSheet(html, bind) {
  const s = $("sheet"), box = s.querySelector(".sheet-box");
  box.innerHTML = `<div class="grab"></div><button class="zapri" id="zapri" aria-label="Zapri">×</button>${html}`;
  s.hidden = false;
  s.querySelector(".sheet-bg").onclick = closeSheet;
  $("zapri").onclick = closeSheet;
  bind?.(box);
}
function closeSheet() {
  const s = $("sheet");
  s.querySelectorAll("video").forEach((v) => v.pause());
  s.hidden = true; s.querySelector(".sheet-box").innerHTML = "";
}

async function kopiraj(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) {
    const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select();
    document.execCommand("copy"); a.remove();
  }
  toast("Kopirano");
}

// Ključ za gesla: na telefonu v Keychainu, v brskalniku (samo za preizkus) v localStorage.
const kljucShramba = {
  async beri() {
    if (native) return (await Studio.kljucPreberi({ ime: "trezor" }).catch(() => ({}))).vrednost || null;
    try { return localStorage.getItem("trezor"); } catch (e) { return null; }
  },
  async pisi(v) {
    if (native) return Studio.kljucShrani({ ime: "trezor", vrednost: v || "" }).catch(() => {});
    try { v ? localStorage.setItem("trezor", v) : localStorage.removeItem("trezor"); } catch (e) {}
  }
};

const prefs = { obvestilaVprasal: false, opomniki: { ...PRIVZETI_OPOMNIKI } };
async function loadPrefs() {
  try { const { value } = await Preferences.get({ key: "studio" }); Object.assign(prefs, JSON.parse(value || "{}")); } catch (e) {}
}
const savePrefs = () => Preferences.set({ key: "studio", value: JSON.stringify(prefs) }).catch(() => {});

/* ---------- Firebase ---------- */
const cfg = window.STUDIO_FB;
let auth, db, storage, jaz = "";
function initFb() {
  const app = initializeApp(cfg);
  auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  storage = getStorage(app);
  if (cfg.emulator) { // samo za lokalne preizkuse
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
}

/* ---------- stanje ---------- */
const S = { mape: [], objave: [], clani: {}, trezor: undefined, kljuc: null, kljucOk: false, nalozeno: false };
const pot = { zaslon: "domov", mapa: null, zavihek: "todo" };
const zgod = [];
const globalne = [];
let mapaUnsub = [];
const M = { datoteke: [], gesla: [], opombe: [], naloge: [], odklenjena: {}, nalaganja: [] };

const imeClana = (e) => S.clani[e]?.ime || ZACETNI_CLANI[e] || String(e || "").split("@")[0];
const mapa = (id) => S.mape.find((m) => m.id === id);
const imeMape = (id) => mapa(id)?.ime || "Mapa";

/* =================== PRIJAVA =================== */
let nacin = "prijava";
function renderPrijava(err = "") {
  view.className = "";
  const nov = nacin === "nov";
  view.innerHTML = `
  <div style="padding-top:12vh">
    <h1>Byurska</h1>
    <p class="muted">Skupni prostor za objave, vsebino in gesla.</p>
    <form id="f" novalidate>
      <label for="em">E-pošta</label>
      <input id="em" type="email" inputmode="email" autocomplete="username" autocapitalize="off" placeholder="ime@gmail.com">
      <label for="pw">Geslo${nov ? " (vsaj 8 znakov)" : ""}</label>
      <input id="pw" type="password" autocomplete="${nov ? "new-password" : "current-password"}">
      <div class="err" ${err ? "" : "hidden"}>${esc(err)}</div>
      <button class="btn" type="submit">${nov ? "Ustvari račun" : "Prijava"}</button>
    </form>
    <button class="link" id="menjaj">${nov ? "Že imaš račun? Prijava" : "Prvič tukaj? Ustvari račun"}</button><br>
    ${nov ? "" : `<button class="link" id="pozabil">Pozabljeno geslo</button>`}
  </div>`;
  const f = $("f");
  $("menjaj").onclick = () => { nacin = nov ? "prijava" : "nov"; renderPrijava(); };
  $("pozabil")?.addEventListener("click", async () => {
    const e = f.em.value.trim();
    if (!veljavenEmail(e)) return renderPrijava("Vpiši e-pošto, nato tapni Pozabljeno geslo.");
    await sendPasswordResetEmail(auth, e).catch(() => {});
    toast("Poslali smo ti povezavo za novo geslo.");
  });
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const e = f.em.value.trim().toLowerCase(), p = f.pw.value;
    if (!veljavenEmail(e)) return renderPrijava("Vpiši pravo e-pošto.");
    if (nov && p.length < 8) return renderPrijava("Geslo naj ima vsaj 8 znakov.");
    f.querySelector("button").disabled = true;
    try {
      if (nov) {
        const c = await createUserWithEmailAndPassword(auth, e, p);
        await sendEmailVerification(c.user).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, e, p);
      }
    } catch (x) {
      const c = x.code || "";
      renderPrijava(c.includes("email-already") ? "Ta e-pošta že ima račun. Prijavi se."
        : c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") ? "E-pošta ali geslo ni pravo."
        : c.includes("too-many") ? "Preveč poskusov. Poskusi čez nekaj minut."
        : c.includes("network") ? "Ni povezave z internetom." : "Ni uspelo. Poskusi znova.");
    }
  };
}

function renderPotrdi(u) {
  view.innerHTML = `
  <div style="padding-top:12vh">
    <h1>Potrdi e-pošto</h1>
    <p>Na <b>${esc(u.email)}</b> smo poslali povezavo. Odpri jo (poglej tudi v vsiljeno pošto), nato se vrni sem.</p>
    <div class="err" id="err" hidden></div>
    <button class="btn" id="naprej">Potrdil sem, naprej</button>
    <button class="btn ghost" id="znova">Pošlji povezavo znova</button>
    <button class="btn danger" id="odjava">Odjava</button>
  </div>`;
  $("naprej").onclick = async () => {
    await u.reload().catch(() => {});
    if (auth.currentUser?.emailVerified) { await auth.currentUser.getIdToken(true); zacni(auth.currentUser); }
    else { $("err").hidden = false; $("err").textContent = "E-pošta še ni potrjena."; }
  };
  $("znova").onclick = () => sendEmailVerification(u).then(() => toast("Poslano znova.")).catch(() => toast("Počakaj minuto in poskusi znova."));
  $("odjava").onclick = () => signOut(auth);
}

function renderNiDostopa(email) {
  view.innerHTML = `
  <div style="padding-top:12vh">
    <h1>Še nimaš dostopa</h1>
    <p>Račun <b>${esc(email)}</b> še ni v ekipi. Prosi Teota ali Urško, naj te dodata v Nastavitve › Ekipa.</p>
    <button class="btn" id="znova">Poskusi znova</button>
    <button class="btn danger" id="odjava">Odjava</button>
  </div>`;
  $("znova").onclick = () => zacni(auth.currentUser);
  $("odjava").onclick = () => signOut(auth);
}

/* =================== ZAČETEK =================== */
async function zacni(u) {
  jaz = u.email.toLowerCase();
  view.innerHTML = `<div class="center"><div class="spin"></div></div>`;
  try {
    const moj = await getDoc(doc(db, "clani", jaz));
    if (!moj.exists() || !moj.data().ime) await setDoc(doc(db, "clani", jaz), { ime: moj.data()?.ime || ZACETNI_CLANI[jaz] || jaz.split("@")[0] }, { merge: true });
  } catch (e) {
    if (e.code === "permission-denied") return renderNiDostopa(jaz);
    view.innerHTML = `<div class="center"><p>Ni povezave s strežnikom.</p><button class="btn ghost" id="r">Poskusi znova</button></div>`;
    $("r").onclick = () => zacni(u);
    return;
  }
  S.kljuc = await kljucShramba.beri();
  globalne.splice(0).forEach((f) => f());
  globalne.push(onSnapshot(collection(db, "mape"), (s) => {
    S.mape = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!S.mape.length && !s.metadata.fromCache) posejMape();
    S.nalozeno = true; osvezi();
  }, () => {}));
  globalne.push(onSnapshot(query(collection(db, "objave"), where("kdaj", ">=", Date.now() - 30 * 864e5), orderBy("kdaj")), (s) => {
    S.objave = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    planirajObvestila(); osvezi();
  }, () => {}));
  globalne.push(onSnapshot(collection(db, "clani"), (s) => {
    S.clani = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
    if (pot.zaslon === "nastavitve") osvezi();
  }, () => {}));
  globalne.push(onSnapshot(doc(db, "nastavitve", "trezor"), async (s) => {
    S.trezor = s.exists() ? s.data() : null;
    S.kljucOk = !!(S.trezor && S.kljuc && await pravilen(S.kljuc, S.trezor.preveri));
    if (pot.zaslon === "mapa" && pot.zavihek === "gesla") osvezi();
  }, () => {}));
  if (native && !prefs.obvestilaVprasal) {
    prefs.obvestilaVprasal = true; savePrefs();
    Studio.dovoljenje().then(planirajObvestila).catch(() => {});
  }
}

async function posejMape() {
  const b = writeBatch(db);
  ZACETNE_MAPE.forEach(({ id, ...m }) => b.set(doc(db, "mape", id), m));
  await b.commit().catch(() => {});
}

// Vsak telefon si sam nastavi obvestila za vse prihajajoče objave (dan ali dva prej ob 9:00 in ob uri objave).
let planT;
function planirajObvestila() {
  if (!native) return;
  clearTimeout(planT);
  planT = setTimeout(() => {
    const seznam = S.objave.flatMap((o) => opomnikiZa(o, imeMape(o.mapa), Date.now(), prefs.opomniki)).sort((a, b) => a.kdaj - b.kdaj).slice(0, 60);
    Studio.obvestila({ seznam }).catch(() => {});
  }, 400);
}

/* =================== NAVIGACIJA =================== */
function pojdi(zaslon, opts = {}) {
  zgod.push({ ...pot });
  if (pot.mapa !== opts.mapa || zaslon !== "mapa") odjaviMapo();
  Object.assign(pot, { zaslon, mapa: null, zavihek: "todo" }, opts);
  if (zaslon === "mapa") prijaviMapo(pot.mapa);
  window.scrollTo(0, 0);
  osvezi();
}
function nazaj() {
  const p = zgod.pop() || { zaslon: "domov" };
  if (p.zaslon !== "mapa" || p.mapa !== pot.mapa) odjaviMapo();
  const bilaMapa = pot.mapa;
  Object.assign(pot, { zaslon: "domov", mapa: null, zavihek: "todo" }, p);
  if (pot.zaslon === "mapa" && pot.mapa !== bilaMapa) prijaviMapo(pot.mapa);
  window.scrollTo(0, 0);
  osvezi();
}
function osvezi() {
  if (!jaz) return;
  if (pot.zaslon === "mapa" && !mapa(pot.mapa) && S.nalozeno) { pot.zaslon = "domov"; odjaviMapo(); }
  ({ domov: renderDomov, mapa: renderMapa, objave: renderObjave, nastavitve: renderNastavitve })[pot.zaslon]();
}

// Barve utripanja se menjajo s časom (oranžno → rdeče), zato seznam vsakih 5 minut osvežimo.
setInterval(() => { if (jaz && (pot.zaslon === "domov" || pot.zaslon === "objave") && !document.querySelector("#sheet:not([hidden])")) osvezi(); }, 5 * 60e3);

/* =================== DOMOV (kot na skici) =================== */
function prihajajoce() {
  return S.objave.filter((o) => !o.objavljeno);
}
function renderDomov() {
  const prih = prihajajoce();
  // Mapa utripa po najbolj nujni neobjavljeni objavi (rdeče pred oranžno).
  const utrip = {};
  for (const o of prih) { const n = nujnost(o); if (n && utrip[o.mapa] !== "rdeca") utrip[o.mapa] = n; }
  const box = (m) => `<button class="box${utrip[m.id] ? ` utripa ${utrip[m.id]}` : ""}" data-m="${esc(m.id)}">${esc(m.ime)}</button>`;
  view.className = "";
  view.innerHTML = `
  <div class="top"><div class="grow"><h1>Byurska</h1></div><button class="iconbtn" id="nast" aria-label="Nastavitve">${ico.nast}</button></div>
  ${prih[0] ? `<div class="next"><div class="nextlbl">Naslednja objava</div>${vrsticaObjave(prih[0])}</div>` : ""}
  <div class="map dots">
    ${S.nalozeno ? drevo(S.mape).map((g) => `
      <div class="grp ${g.otroci.length > 3 ? "wide" : "square"}">
        <svg class="lines"></svg>
        <div class="root">${box(g)}</div>
        <div class="kids">${g.otroci.map(box).join("")}<button class="box plusbox" data-dodaj="${esc(g.id)}">+ Dodaj</button></div>
      </div>`).join("") : `<div class="center"><div class="spin"></div></div>`}
    <button class="addmap" id="addmap">+ Nova skupina</button>
  </div>
  <h2>Objave</h2>
  <div class="next">${prih.length ? prih.slice(0, 5).map(vrsticaObjave).join("") : `<div class="empty">Ni načrtovanih objav.</div>`}</div>
  <div class="row"><button class="btn" id="nova">Nova objava</button><button class="btn ghost" id="vse">Vse objave</button></div>`;
  $("nast").onclick = () => pojdi("nastavitve");
  $("addmap").onclick = () => urediMapo();
  view.querySelectorAll("[data-dodaj]").forEach((b) => (b.onclick = () => urediMapo(null, b.dataset.dodaj)));
  $("nova").onclick = () => urediObjavo();
  $("vse").onclick = () => pojdi("objave");
  view.querySelectorAll(".box[data-m]").forEach((b) => (b.onclick = () => pojdi("mapa", { mapa: b.dataset.m })));
  vezObjave(view);
  requestAnimationFrame(narisiCrte);
}

// Črte kot na skici: pri dolgem seznamu ena črta do stolpca, sicer pahljača do vsake mape.
function narisiCrte() {
  view.querySelectorAll(".grp").forEach((g) => {
    const svg = g.querySelector("svg.lines"), root = g.querySelector(".root .box"), kids = [...g.querySelectorAll(".kids .box:not(.plusbox)")];
    if (!svg || !root || !kids.length) return;
    const o = g.getBoundingClientRect(), r = root.getBoundingClientRect();
    const x1 = r.right - o.left + 10, y1 = r.top + r.height / 2 - o.top;
    let html = "";
    if (g.classList.contains("wide")) {
      // Oklepaj: črta do stolpca, navpična hrbtenica in kratka črtica do vsake mape.
      const sred = (b) => b.top + b.height / 2 - o.top, x2 = kids[0].getBoundingClientRect().left - o.left - 6, xm = (x1 + x2) / 2;
      const ys = kids.map((k) => sred(k.getBoundingClientRect()));
      html = `<line x1="${x1}" y1="${y1}" x2="${xm}" y2="${y1}"/><line x1="${xm}" y1="${Math.min(y1, ...ys)}" x2="${xm}" y2="${Math.max(y1, ...ys)}"/>` +
        ys.map((y) => `<line x1="${xm}" y1="${y}" x2="${x2}" y2="${y}"/>`).join("");
    } else {
      html = kids.map((k) => {
        const b = k.getBoundingClientRect();
        return `<line x1="${x1}" y1="${y1}" x2="${b.left - o.left - 10}" y2="${b.top + b.height / 2 - o.top}"/>`;
      }).join("");
    }
    svg.innerHTML = html;
  });
}
window.addEventListener("resize", () => pot.zaslon === "domov" && narisiCrte());

/* =================== OBJAVE =================== */
function vrsticaObjave(o) {
  const zamuda = !o.objavljeno && o.kdaj < Date.now(), n = nujnost(o);
  return `<button class="obj${o.objavljeno ? " done" : ""}${zamuda ? " late" : ""}${n ? ` utripa ${n}` : ""}" data-o="${esc(o.id)}">
    <div class="when"><b>${esc(dan(o.kdaj))}</b>${ura(new Date(o.kdaj))}</div>
    <div class="what"><div>${esc(imeMape(o.mapa))}</div><small>${esc(o.opis || (o.objavljeno ? "Objavljeno" : imeClana(o.dodal)))}</small></div>
    <div class="pl">${(o.platforme || []).map((p) => `<span>${p === "ig" ? "IG" : "TT"}</span>`).join("")}</div>
  </button>`;
}
const vezObjave = (el) => el.querySelectorAll(".obj[data-o]").forEach((b) => (b.onclick = () => pokaziObjavo(b.dataset.o)));

function renderObjave() {
  const prih = S.objave.filter((o) => o.kdaj >= Date.now() - 6 * 3600e3 || !o.objavljeno);
  const pret = S.objave.filter((o) => !prih.includes(o)).reverse();
  view.innerHTML = `
  <div class="top"><button class="iconbtn" id="nazaj" aria-label="Nazaj">${ico.nazaj}</button><div class="grow"><h1>Objave</h1></div></div>
  <button class="btn" id="nova">Nova objava</button>
  <h2>Prihajajoče</h2>
  <div class="next">${prih.length ? prih.map(vrsticaObjave).join("") : `<div class="empty">Ni načrtovanih objav.</div>`}</div>
  ${pret.length ? `<h2>Zadnjih 30 dni</h2><div class="next">${pret.map(vrsticaObjave).join("")}</div>` : ""}`;
  $("nazaj").onclick = nazaj;
  $("nova").onclick = () => urediObjavo();
  vezObjave(view);
}

function pokaziObjavo(id) {
  const o = S.objave.find((x) => x.id === id);
  if (!o) return;
  const d = o.datoteka;
  const alarmi = opomnikiZa({ ...o, objavljeno: false }, imeMape(o.mapa), 0, prefs.opomniki);
  const naslov = `Objava: ${imeMape(o.mapa)} (${platformeIme(o.platforme)})`;
  openSheet(`
    <h3>${esc(imeMape(o.mapa))} · ${esc(platformeIme(o.platforme))}</h3>
    <p>${esc(kdajBesedilo(o.kdaj))}</p>
    ${o.opis ? `<p class="sel muted">${esc(o.opis)}</p>` : ""}
    ${d ? `<div class="preview">${predogled(d)}</div><button class="btn ghost" id="deli">Shrani ali deli vsebino</button>` : ""}
    <p class="small muted">Tvoji opomniki: ${esc(opisOpomnikov(prefs.opomniki))}. Dodano: ${esc(imeClana(o.dodal))}.</p>
    <div class="row"><button class="btn ghost" id="kol">V Koledar</button><button class="btn ghost" id="opo">V Opomnike</button></div>
    <button class="btn" id="obj">${o.objavljeno ? "Ni še objavljeno" : "Označi kot objavljeno"}</button>
    <div class="row"><button class="btn ghost" id="ured">Uredi</button><button class="btn danger" id="brisi">Izbriši</button></div>`, () => {
    $("deli")?.addEventListener("click", () => deli(d));
    $("kol").onclick = async () => {
      if (!native) return toast("Deluje v aplikaciji na iPhonu.");
      const r = await Studio.koledar({ naslov, opis: o.opis || "", zacetek: o.kdaj, alarmi: alarmi.map((a) => Math.round((o.kdaj - a.kdaj) / 60000)) }).catch(() => null);
      if (r?.dodano) toast("Dodano v Koledar");
      else if (r?.zavrnjeno) toast("Dovoli dostop do Koledarja v Nastavitvah iPhona.");
    };
    $("opo").onclick = async () => {
      if (!native) return toast("Deluje v aplikaciji na iPhonu.");
      const r = await Studio.opomnik({ naslov, opis: o.opis || "", kdaj: o.kdaj, alarmi: alarmi.map((a) => a.kdaj) }).catch(() => null);
      toast(r?.dodano ? "Dodano v Opomnike" : r?.zavrnjeno ? "Dovoli dostop do Opomnikov v Nastavitvah iPhona." : "Ni uspelo");
    };
    $("obj").onclick = () => { updateDoc(doc(db, "objave", o.id), { objavljeno: !o.objavljeno }).catch(napaka); closeSheet(); };
    $("ured").onclick = () => urediObjavo(o);
    $("brisi").onclick = () => {
      if (!confirm("Izbrišem to objavo?")) return;
      deleteDoc(doc(db, "objave", o.id)).catch(napaka); closeSheet();
    };
  });
}

const vDatum = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function izbiraMap(izbrana) {
  return drevo(S.mape).map((g) => `<option value="${esc(g.id)}"${g.id === izbrana ? " selected" : ""}>${esc(g.ime)}</option>` +
    g.otroci.map((m) => `<option value="${esc(m.id)}"${m.id === izbrana ? " selected" : ""}>   ${esc(m.ime)}</option>`).join("")).join("");
}

function urediObjavo(o = {}, privzeto = {}) {
  const jutri = new Date(Date.now() + 864e5); jutri.setHours(18, 0, 0, 0);
  const kdaj = new Date(o.kdaj || jutri.getTime());
  const st = {
    mapa: o.mapa || privzeto.mapa || (pot.zaslon === "mapa" ? pot.mapa : S.mape[0]?.id),
    platforme: [...(o.platforme || ["ig"])],
    datoteka: o.datoteka || privzeto.datoteka || null
  };
  openSheet(`
    <h3>${o.id ? "Uredi objavo" : "Nova objava"}</h3>
    <label for="om">Mapa</label>
    <select id="om">${izbiraMap(st.mapa)}</select>
    <label>Kam</label>
    <div class="chips" id="op">${PLATFORME.map(([k, n]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${st.platforme.includes(k)}">${n}</button>`).join("")}</div>
    <div class="row">
      <div><label for="od">Dan</label><input id="od" type="date" value="${vDatum(kdaj)}"></div>
      <div><label for="ou">Ura</label><input id="ou" type="time" value="${ura(kdaj)}"></div>
    </div>
    <label for="oo">Kaj objavimo <span class="muted">(ni obvezno)</span></label>
    <textarea id="oo" maxlength="500" placeholder="npr. Reel z novim izgledom, besedilo v opisu">${esc(o.opis || "")}</textarea>
    <p class="small muted">Opomnik: ${esc(opisOpomnikov(prefs.opomniki))}. Vsak si ga nastavi v Nastavitvah.</p>
    <div id="odat"></div>
    <div class="err" id="oerr" hidden></div>
    <button class="btn" id="oshrani">Shrani</button>`, (box) => {
    const datIzpis = () => {
      $("odat").innerHTML = st.datoteka ? `<label>Vsebina</label><div class="field"><div class="grow">${esc(st.datoteka.ime)}</div><button id="odrem">Odstrani</button></div>` : "";
      $("odrem")?.addEventListener("click", () => { st.datoteka = null; datIzpis(); });
    };
    datIzpis();
    const tog = (sel, arr, num) => box.querySelectorAll(`${sel} .chip`).forEach((c) => (c.onclick = () => {
      const k = num ? Number(c.dataset.k) : c.dataset.k;
      const i = arr.indexOf(k); i >= 0 ? arr.splice(i, 1) : arr.push(k);
      c.setAttribute("aria-pressed", arr.includes(k));
    }));
    tog("#op", st.platforme, false);
    $("oshrani").onclick = async () => {
      const [y, m, d] = $("od").value.split("-").map(Number);
      const [h, mi] = ($("ou").value || "18:00").split(":").map(Number);
      const err = (t) => { $("oerr").hidden = false; $("oerr").textContent = t; };
      if (!y) return err("Izberi dan.");
      if (!st.platforme.length) return err("Izberi Instagram ali TikTok.");
      const data = {
        mapa: $("om").value, platforme: st.platforme, kdaj: new Date(y, m - 1, d, h || 0, mi || 0).getTime(),
        opis: $("oo").value.trim(), datoteka: st.datoteka || null
      };
      $("oshrani").disabled = true;
      try {
        if (o.id) await updateDoc(doc(db, "objave", o.id), data);
        else await addDoc(collection(db, "objave"), { ...data, objavljeno: false, dodal: jaz, ustvarjeno: Date.now() });
        closeSheet(); toast(o.id ? "Shranjeno" : "Objava dodana. Opomnili vas bomo.");
      } catch (e) { $("oshrani").disabled = false; napaka(e); }
    };
  });
}

/* =================== MAPA =================== */
function prijaviMapo(id) {
  odjaviMapo();
  M.datoteke = []; M.gesla = []; M.opombe = []; M.naloge = []; M.nalozeno = false;
  mapaUnsub.push(onSnapshot(query(collection(db, "mape", id, "datoteke"), orderBy("ob", "desc")), (s) => {
    M.datoteke = s.docs.map((d) => ({ id: d.id, ...d.data() })); M.nalozeno = true;
    if (pot.zaslon === "mapa" && pot.mapa === id) osvezi();
  }, () => {}));
  mapaUnsub.push(onSnapshot(query(collection(db, "mape", id, "gesla"), orderBy("naslov")), (s) => {
    M.gesla = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (pot.zaslon === "mapa" && pot.mapa === id && pot.zavihek === "gesla") osvezi();
  }, () => {}));
  mapaUnsub.push(onSnapshot(query(collection(db, "mape", id, "naloge"), orderBy("ob", "desc")), (s) => {
    M.naloge = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (pot.zaslon === "mapa" && pot.mapa === id && pot.zavihek === "todo" && !document.activeElement?.matches?.("#tn, #tz")) osvezi();
  }, () => {}));
  mapaUnsub.push(onSnapshot(query(collection(db, "mape", id, "opombe"), orderBy("ob", "desc")), (s) => {
    M.opombe = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (pot.zaslon === "mapa" && pot.mapa === id && pot.zavihek === "opombe" && !document.activeElement?.matches?.("#on")) osvezi();
  }, () => {}));
}
function odjaviMapo() { mapaUnsub.splice(0).forEach((f) => f()); }

function renderMapa() {
  const m = mapa(pot.mapa);
  if (!m) { view.innerHTML = `<div class="center"><div class="spin"></div></div>`; return; }
  const otroci = S.mape.filter((x) => x.oce === m.id).sort((a, b) => (a.red ?? 0) - (b.red ?? 0));
  const z = pot.zavihek;
  const tabs = [["todo", "TO DO"], ["urejeno", "Urejeno"], ["surovo", "Surovo"], ["gesla", "Gesla"], ["opombe", "Opombe"], ["objave", "Objave"]];
  view.innerHTML = `
  <div class="top"><button class="iconbtn" id="nazaj" aria-label="Nazaj">${ico.nazaj}</button>
    <div class="grow"><h1>${esc(m.ime)}</h1></div>
    <button class="iconbtn" id="vec" aria-label="Več">${ico.vec}</button></div>
  ${m.url ? `<a class="small" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.url.replace(/^https?:\/\//, ""))}</a>` : ""}
  ${otroci.length ? `<div class="sub">${otroci.map((c) => `<button class="box" data-m="${esc(c.id)}">${esc(c.ime)}</button>`).join("")}</div>` : ""}
  <div class="tabs">${tabs.map(([k, n]) => `<button data-t="${k}" aria-pressed="${z === k}">${n}</button>`).join("")}</div>
  <div id="vsebina"></div>`;
  $("nazaj").onclick = nazaj;
  $("vec").onclick = () => menuMape(m);
  view.querySelectorAll(".sub .box").forEach((b) => (b.onclick = () => pojdi("mapa", { mapa: b.dataset.m })));
  view.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { pot.zavihek = b.dataset.t; osvezi(); }));
  const el = $("vsebina");
  if (z === "urejeno" || z === "surovo") renderDatoteke(el, m, z);
  else if (z === "gesla") renderGesla(el, m);
  else if (z === "opombe") renderOpombe(el, m);
  else if (z === "todo") renderNaloge(el, m);
  else {
    const moje = S.objave.filter((o) => o.mapa === m.id);
    el.innerHTML = `<button class="btn" id="nova">Nova objava</button>
      <div class="next" style="margin-top:14px">${moje.length ? moje.map(vrsticaObjave).join("") : `<div class="empty">Za to mapo ni objav.</div>`}</div>`;
    $("nova").onclick = () => urediObjavo({}, { mapa: m.id });
    vezObjave(el);
  }
}

function menuMape(m) {
  openSheet(`<h3>${esc(m.ime)}</h3>
    <button class="btn ghost" id="mu">Uredi ime in povezavo</button>
    <button class="btn ghost" id="mp">Dodaj podmapo</button>
    <button class="btn danger" id="mb">Izbriši mapo</button>`, () => {
    $("mu").onclick = () => urediMapo(m);
    $("mp").onclick = () => urediMapo(null, m.id);
    $("mb").onclick = async () => {
      const [d, g, n, t] = await Promise.all(["datoteke", "gesla", "opombe", "naloge"].map((c) => getDocs(query(collection(db, "mape", m.id, c), limit(1)))));
      if (!d.empty || !g.empty || !n.empty || !t.empty || S.mape.some((x) => x.oce === m.id)) return toast("Mapa ni prazna. Najprej odstrani naloge, vsebino, gesla, opombe in podmape.");
      if (!confirm(`Izbrišem mapo ${m.ime}?`)) return;
      closeSheet(); nazaj(); deleteDoc(doc(db, "mape", m.id)).catch(napaka);
      // samodejno dodana app se ne vrne, če jo izbrišeš
      if (m.repo) setDoc(doc(db, "nastavitve", "samodejno"), { izpusti: arrayUnion(m.repo.toLowerCase()) }, { merge: true }).catch(() => {});
    };
  });
}

function urediMapo(m = null, oce = null) {
  const korenske = S.mape.filter((x) => !x.oce).sort((a, b) => (a.red ?? 0) - (b.red ?? 0));
  const izbran = m ? m.oce || "" : oce ?? "";
  openSheet(`<h3>${m ? "Uredi mapo" : "Nova mapa"}</h3>
    <label for="mi">Ime</label><input id="mi" maxlength="60" value="${esc(m?.ime || "")}" placeholder="npr. Lumora">
    ${m && !m.oce && S.mape.some((x) => x.oce === m.id) ? "" : `<label for="mo">Kam</label>
    <select id="mo"><option value="">Nova skupina (kot Byurska.com ali Apps)</option>${korenske.filter((k) => k.id !== m?.id).map((k) => `<option value="${esc(k.id)}"${k.id === izbran ? " selected" : ""}>Pod ${esc(k.ime)}</option>`).join("")}</select>`}
    <label for="mu">Spletna stran <span class="muted">(ni obvezno)</span></label><input id="mu" type="url" inputmode="url" autocapitalize="off" value="${esc(m?.url || "")}" placeholder="https://">
    <button class="btn" id="ms">Shrani</button>`, () => {
    $("ms").onclick = async () => {
      const ime = $("mi").value.trim();
      if (!ime) return toast("Vpiši ime.");
      let url = $("mu").value.trim();
      if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      const oceN = $("mo") ? $("mo").value || null : m?.oce || null;
      const sorojenci = S.mape.filter((x) => (x.oce || null) === oceN);
      const data = { ime, url: url || null, oce: oceN };
      try {
        if (m) await updateDoc(doc(db, "mape", m.id), data);
        else await addDoc(collection(db, "mape"), { ...data, red: Math.max(0, ...sorojenci.map((x) => x.red ?? 0)) + 1 + (oceN ? 0 : 10) });
        closeSheet(); toast("Shranjeno");
      } catch (e) { napaka(e); }
    };
  });
}

/* ---------- vsebina (urejeno / surovo) ---------- */
function predogled(d, tile = false) {
  const v = d.povezava ? "povezava" : vrstaDatoteke(d.tip, d.ime);
  if (tile) {
    if (d.slicica || v === "slika") return `<img src="${esc(d.slicica || d.url)}" alt="" loading="lazy">${v === "video" ? ico.play : ""}`;
    if (v === "video") return `<video src="${esc(d.url)}#t=0.1" preload="metadata" muted playsinline></video>${ico.play}`;
    return `${v === "povezava" ? ico.povezava : ico.dat}<div class="nm">${esc(d.ime)}</div>`;
  }
  if (v === "slika") return `<img src="${esc(d.url)}" alt="">`;
  if (v === "video") return `<video src="${esc(d.url)}" controls playsinline preload="metadata"${d.slicica ? ` poster="${esc(d.slicica)}"` : ""}></video>`;
  return `<div style="padding:28px">${v === "povezava" ? ico.povezava : ico.dat}</div>`;
}

function renderDatoteke(el, m, vrsta) {
  const seznam = M.datoteke.filter((d) => d.vrsta === vrsta);
  const nal = M.nalaganja.filter((n) => n.mapa === m.id && n.vrsta === vrsta);
  el.innerHTML = `
    ${nal.map((n) => `<div class="prog" data-nal="${n.kljuc}">Nalagam ${esc(n.ime)} · <span>${n.odst}</span>%<div class="bar"><i style="width:${n.odst}%"></i></div></div>`).join("")}
    <div class="grid">
      <button class="tile add" id="dodaj">${ico.plus}<span>Dodaj</span></button>
      ${seznam.map((d) => `<button class="tile" data-d="${esc(d.id)}">${predogled(d, true)}</button>`).join("")}
    </div>
    ${!seznam.length && M.nalozeno ? `<div class="empty">${vrsta === "urejeno" ? "Tu je vsebina, pripravljena za objavo." : "Tu so surovi posnetki in slike za urejanje."}</div>` : ""}
    <input type="file" id="file" multiple hidden>`;
  $("dodaj").onclick = () => openSheet(`<h3>Dodaj v ${vrsta === "urejeno" ? "Urejeno" : "Surovo"}</h3>
      <button class="btn" id="dg">Slike, videi ali datoteke</button>
      <button class="btn ghost" id="dp">Povezava (Google Drive, Dropbox ...)</button>`, () => {
    $("dg").onclick = () => { closeSheet(); $("file").click(); };
    $("dp").onclick = () => dodajPovezavo(m, vrsta);
  });
  $("file").onchange = (e) => { [...e.target.files].forEach((f) => nalozi(m.id, vrsta, f)); e.target.value = ""; };
  el.querySelectorAll(".tile[data-d]").forEach((b) => (b.onclick = () => pokaziDatoteko(b.dataset.d)));
}

function dodajPovezavo(m, vrsta) {
  openSheet(`<h3>Povezava</h3>
    <label for="pi">Ime</label><input id="pi" maxlength="80" placeholder="npr. Posnetki iz plezalne">
    <label for="pu">Povezava</label><input id="pu" type="url" inputmode="url" autocapitalize="off" placeholder="https://">
    <button class="btn" id="ps">Dodaj</button>`, () => {
    $("ps").onclick = async () => {
      let url = $("pu").value.trim();
      if (!url) return toast("Prilepi povezavo.");
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      await addDoc(collection(db, "mape", m.id, "datoteke"), {
        vrsta, ime: $("pi").value.trim() || url.replace(/^https?:\/\//, "").slice(0, 60), povezava: true, url, dodal: jaz, ob: Date.now()
      }).then(() => { closeSheet(); toast("Dodano"); }).catch(napaka);
    };
  });
}

// Majhna slicica za mrežo (iz slike ali prvega kadra videa), da se mapa hitro odpre.
function slicica(file) {
  const v = vrstaDatoteke(file.type, file.name);
  if (v === "datoteka") return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const konec = (b) => { URL.revokeObjectURL(url); resolve(b); };
    const t = setTimeout(() => konec(null), 6000);
    const risi = (src, w, h) => {
      const s = Math.min(1, 420 / Math.max(w, h)), c = document.createElement("canvas");
      c.width = Math.round(w * s); c.height = Math.round(h * s);
      try { c.getContext("2d").drawImage(src, 0, 0, c.width, c.height); c.toBlob((b) => { clearTimeout(t); konec(b); }, "image/jpeg", 0.75); }
      catch (e) { clearTimeout(t); konec(null); }
    };
    if (v === "slika") {
      const img = new Image();
      img.onload = () => risi(img, img.naturalWidth, img.naturalHeight);
      img.onerror = () => { clearTimeout(t); konec(null); };
      img.src = url;
    } else {
      const vid = document.createElement("video");
      vid.muted = true; vid.playsInline = true; vid.preload = "auto";
      vid.onloadeddata = () => { vid.currentTime = Math.min(0.5, (vid.duration || 1) / 2); };
      vid.onseeked = () => risi(vid, vid.videoWidth, vid.videoHeight);
      vid.onerror = () => { clearTimeout(t); konec(null); };
      vid.src = url; vid.load();
    }
  });
}

async function nalozi(mapaId, vrsta, file) {
  const ime = file.name || `vsebina-${Date.now()}`;
  const varno = ime.replace(/[^\w.\-]+/g, "_").slice(-80);
  const pot0 = `mape/${mapaId}/${vrsta}/${Date.now()}-${varno}`;
  const n = { mapa: mapaId, vrsta, ime, odst: 0, kljuc: Math.random().toString(36).slice(2) };
  M.nalaganja.push(n); osvezi();
  try {
    const sl = await slicica(file);
    let slUrl = null;
    if (sl) {
      const r = ref(storage, `${pot0}.jpg-sl`);
      await uploadBytes(r, sl, { contentType: "image/jpeg" });
      slUrl = await getDownloadURL(r);
    }
    const r = ref(storage, pot0);
    const task = uploadBytesResumable(r, file, { contentType: file.type || "application/octet-stream" });
    await new Promise((res, rej) => task.on("state_changed", (s) => {
      const p = Math.round((s.bytesTransferred / Math.max(1, s.totalBytes)) * 100);
      if (p !== n.odst) {
        n.odst = p;
        const el = view.querySelector(`[data-nal="${n.kljuc}"]`);
        if (el) { el.querySelector("span").textContent = p; el.querySelector("i").style.width = p + "%"; }
      }
    }, rej, res));
    const url = await getDownloadURL(r);
    await addDoc(collection(db, "mape", mapaId, "datoteke"), {
      vrsta, ime, tip: file.type || "", velikost: file.size, pot: pot0, url, slicica: slUrl, slPot: slUrl ? `${pot0}.jpg-sl` : null, dodal: jaz, ob: Date.now()
    });
  } catch (e) { napaka(e); }
  M.nalaganja.splice(M.nalaganja.indexOf(n), 1);
  osvezi();
}

function deli(d) {
  if (d.povezava) return window.open(d.url, "_blank");
  if (!native) return window.open(d.url, "_blank");
  toast("Pripravljam ...");
  Studio.deli({ url: d.url, ime: d.ime }).catch(() => toast("Prenos ni uspel"));
}

function pokaziDatoteko(id) {
  const d = M.datoteke.find((x) => x.id === id);
  if (!d) return;
  const druga = d.vrsta === "urejeno" ? "surovo" : "urejeno";
  openSheet(`
    <div class="preview">${predogled(d)}</div>
    <h3 class="sel" style="margin-top:12px;word-break:break-word">${esc(d.ime)}</h3>
    <p class="small muted">${esc(imeClana(d.dodal))} · ${esc(kdajBesedilo(d.ob))}${d.velikost ? ` · ${velikost(d.velikost)}` : ""}</p>
    <button class="btn" id="dd">${d.povezava ? "Odpri povezavo" : "Shrani ali deli"}</button>
    <button class="btn ghost" id="dn">Načrtuj objavo s tem</button>
    <div class="row"><button class="btn ghost" id="dm">Premakni v ${druga === "urejeno" ? "Urejeno" : "Surovo"}</button><button class="btn danger" id="db">Izbriši</button></div>`, () => {
    $("dd").onclick = () => deli(d);
    $("dn").onclick = () => urediObjavo({}, { mapa: pot.mapa, datoteka: { id: d.id, ime: d.ime, url: d.url, tip: d.tip || "", slicica: d.slicica || null, povezava: !!d.povezava } });
    $("dm").onclick = () => { updateDoc(doc(db, "mape", pot.mapa, "datoteke", d.id), { vrsta: druga }).catch(napaka); closeSheet(); };
    $("db").onclick = async () => {
      if (!confirm(`Izbrišem ${d.ime}?`)) return;
      closeSheet();
      try {
        if (d.pot) await deleteObject(ref(storage, d.pot)).catch(() => {});
        if (d.slPot) await deleteObject(ref(storage, d.slPot)).catch(() => {});
        await deleteDoc(doc(db, "mape", pot.mapa, "datoteke", d.id));
      } catch (e) { napaka(e); }
    };
  });
}

/* ---------- TO DO s stroški ---------- */
function renderNaloge(el, m) {
  const odprte = M.naloge.filter((n) => !n.narejeno), narejene = M.naloge.filter((n) => n.narejeno);
  const vsota = (a) => a.reduce((s, n) => s + (n.strosek || 0), 0);
  const vrstica = (n) => `<div class="item naloga${n.narejeno ? " done" : ""}">
    <button class="kljuk" data-k="${esc(n.id)}" aria-label="${n.narejeno ? "Ni narejeno" : "Narejeno"}" aria-pressed="${!!n.narejeno}"></button>
    <button class="grow" data-n="${esc(n.id)}"><div class="ob">${esc(n.besedilo)}</div><small>${esc(imeClana(n.uredil || n.dodal))} · ${esc(kdajBesedilo(n.ob))}</small></button>
    ${n.strosek ? `<span class="eur">${evri(n.strosek)}</span>` : ""}</div>`;
  el.innerHTML = `<div class="opn"><textarea id="tn" maxlength="2000" placeholder="Kaj je treba narediti?"></textarea>
    <div class="row"><input id="tz" inputmode="decimal" placeholder="Strošek €"><button class="btn" id="tdd">Dodaj</button></div></div>
    <div class="stroski"><div><small>Stroški skupaj</small><b>${evri(vsota(M.naloge))}</b></div><div><small>Še odprto</small><b>${evri(vsota(odprte))}</b></div></div>
    <div class="list" style="margin-top:12px">${odprte.length ? odprte.map(vrstica).join("") : `<div class="empty">Ni odprtih nalog.</div>`}</div>
    ${narejene.length ? `<h2>Narejeno</h2><div class="list">${narejene.map(vrstica).join("")}</div>` : ""}`;
  $("tdd").onclick = async () => {
    const besedilo = $("tn").value.trim();
    if (!besedilo) return toast("Napiši, kaj je treba narediti.");
    $("tdd").disabled = true;
    try {
      await addDoc(collection(db, "mape", m.id, "naloge"), { besedilo, strosek: znesek($("tz").value), narejeno: false, dodal: jaz, ob: Date.now() });
      $("tn").value = ""; $("tz").value = ""; document.activeElement?.blur(); osvezi();
    } catch (e) { napaka(e); } finally { if ($("tdd")) $("tdd").disabled = false; }
  };
  el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => {
    const n = M.naloge.find((x) => x.id === b.dataset.k);
    if (n) updateDoc(doc(db, "mape", m.id, "naloge", n.id), { narejeno: !n.narejeno, uredil: jaz }).catch(napaka);
  }));
  el.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => urediNalogo(m, M.naloge.find((x) => x.id === b.dataset.n))));
}

function urediNalogo(m, n) {
  if (!n) return;
  openSheet(`<h3>Naloga</h3>
    <textarea id="te" maxlength="2000" style="min-height:110px">${esc(n.besedilo)}</textarea>
    <label for="tez">Strošek €</label><input id="tez" inputmode="decimal" value="${n.strosek ? esc(String(n.strosek).replace(".", ",")) : ""}" placeholder="0,00">
    <p class="small muted">${esc(imeClana(n.dodal))} · ${esc(kdajBesedilo(n.ob))}</p>
    <div class="row"><button class="btn" id="tes">Shrani</button><button class="btn danger" id="teb">Izbriši</button></div>`, () => {
    $("tes").onclick = () => {
      const besedilo = $("te").value.trim();
      if (!besedilo) return toast("Naloga je prazna.");
      updateDoc(doc(db, "mape", m.id, "naloge", n.id), { besedilo, strosek: znesek($("tez").value), uredil: jaz }).catch(napaka); closeSheet();
    };
    $("teb").onclick = () => {
      if (!confirm("Izbrišem nalogo?")) return;
      deleteDoc(doc(db, "mape", m.id, "naloge", n.id)).catch(napaka); closeSheet();
    };
  });
}

/* ---------- opombe (skupne, vidijo jih vsi) ---------- */
function renderOpombe(el, m) {
  el.innerHTML = `<div class="opn"><textarea id="on" maxlength="4000" placeholder="Nova opomba za ${esc(m.ime)} ..."></textarea>
    <button class="btn" id="os">Dodaj opombo</button></div>
    <div class="list" style="margin-top:14px">${M.opombe.length ? M.opombe.map((o) => `<button class="item opomba" data-n="${esc(o.id)}"><div class="grow">
      <div class="ob">${esc(o.besedilo)}</div><small>${esc(imeClana(o.uredil || o.dodal))} · ${esc(kdajBesedilo(o.ob))}</small></div></button>`).join("")
      : `<div class="empty">Ideje, dogovori, kaj je še treba narediti ...</div>`}</div>`;
  $("os").onclick = async () => {
    const besedilo = $("on").value.trim();
    if (!besedilo) return toast("Napiši opombo.");
    $("os").disabled = true;
    try { await addDoc(collection(db, "mape", m.id, "opombe"), { besedilo, dodal: jaz, ob: Date.now() }); $("on").value = ""; $("on").blur(); osvezi(); }
    catch (e) { napaka(e); } finally { if ($("os")) $("os").disabled = false; }
  };
  el.querySelectorAll(".item[data-n]").forEach((b) => (b.onclick = () => urediOpombo(m, M.opombe.find((x) => x.id === b.dataset.n))));
}

function urediOpombo(m, o) {
  if (!o) return;
  openSheet(`<h3>Opomba</h3>
    <textarea id="oe" maxlength="4000" style="min-height:160px">${esc(o.besedilo)}</textarea>
    <p class="small muted">${esc(imeClana(o.dodal))} · ${esc(kdajBesedilo(o.ob))}</p>
    <div class="row"><button class="btn" id="oes">Shrani</button><button class="btn danger" id="oeb">Izbriši</button></div>`, () => {
    $("oes").onclick = () => {
      const besedilo = $("oe").value.trim();
      if (!besedilo) return toast("Opomba je prazna.");
      updateDoc(doc(db, "mape", m.id, "opombe", o.id), { besedilo, uredil: jaz, ob: Date.now() }).catch(napaka); closeSheet();
    };
    $("oeb").onclick = () => {
      if (!confirm("Izbrišem opombo?")) return;
      deleteDoc(doc(db, "mape", m.id, "opombe", o.id)).catch(napaka); closeSheet();
    };
  });
}

/* ---------- gesla in pomembne informacije ---------- */
async function renderGesla(el, m) {
  if (S.trezor === undefined) { el.innerHTML = `<div class="center"><div class="spin"></div></div>`; return; }
  if (!S.trezor) {
    el.innerHTML = `<div class="lock">${ico.kljucavnica}
      <p><b>Gesla so zaklenjena s skupnim geslom.</b></p>
      <p class="small muted">Izmisli si ga enkrat in ga povej Urški in Nives. Brez njega gesel ne more prebrati nihče, tudi strežnik ne.</p></div>
      <label for="t1">Skupno geslo (vsaj 8 znakov)</label><input id="t1" type="password" autocomplete="new-password">
      <label for="t2">Še enkrat</label><input id="t2" type="password" autocomplete="new-password">
      <button class="btn" id="ts">Nastavi</button>`;
    $("ts").onclick = async () => {
      const a = $("t1").value, b = $("t2").value;
      if (a.length < 8) return toast("Vsaj 8 znakov.");
      if (a !== b) return toast("Gesli se ne ujemata.");
      $("ts").disabled = true;
      const sol = novaSol(), k = await kljucIzGesla(a, sol);
      try {
        await setDoc(doc(db, "nastavitve", "trezor"), { sol, preveri: await preveritev(k), nastavil: jaz, ob: Date.now() });
        S.kljuc = k; S.kljucOk = true; await kljucShramba.pisi(k); osvezi();
      } catch (e) { $("ts").disabled = false; napaka(e); }
    };
    return;
  }
  if (!S.kljucOk) {
    el.innerHTML = `<div class="lock">${ico.kljucavnica}<p><b>Vpiši skupno geslo za gesla</b></p>
      <p class="small muted">Samo prvič na tem telefonu. Če ga ne poznaš, vprašaj ${esc(imeClana(S.trezor.nastavil))}.</p></div>
      <input id="t1" type="password" autocomplete="current-password" placeholder="Skupno geslo">
      <button class="btn" id="ts">Odkleni</button>`;
    $("ts").onclick = async () => {
      $("ts").disabled = true; $("ts").textContent = "Preverjam ...";
      const k = await kljucIzGesla($("t1").value, S.trezor.sol);
      if (await pravilen(k, S.trezor.preveri)) { S.kljuc = k; S.kljucOk = true; await kljucShramba.pisi(k); osvezi(); }
      else { $("ts").disabled = false; $("ts").textContent = "Odkleni"; toast("Geslo ni pravo."); }
    };
    return;
  }
  for (const g of M.gesla) {
    const c = M.odklenjena[g.id];
    if (!c || c.ct !== g.enc?.ct) {
      try { M.odklenjena[g.id] = { ct: g.enc?.ct, v: g.enc ? await odkleni(S.kljuc, g.enc) : {} }; }
      catch (e) { M.odklenjena[g.id] = { ct: g.enc?.ct, v: { napaka: true } }; }
    }
  }
  if (pot.zavihek !== "gesla" || pot.mapa !== m.id || !el.isConnected) return;
  el.innerHTML = `<button class="btn" id="gn">Dodaj geslo ali informacijo</button>
    <div class="list" style="margin-top:14px">${M.gesla.length ? M.gesla.map((g) => {
      const v = M.odklenjena[g.id]?.v || {};
      return `<button class="item" data-g="${esc(g.id)}"><div class="grow"><div>${esc(g.naslov)}</div><small>${esc(v.napaka ? "Ni mogoče odkleniti" : v.uporabnik || v.opomba?.slice(0, 50) || "")}</small></div>${ico.chev}</button>`;
    }).join("") : `<div class="empty">Npr. Instagram, TikTok, domena, gostovanje, App Store ...</div>`}</div>`;
  $("gn").onclick = () => urediGeslo(m);
  el.querySelectorAll(".item[data-g]").forEach((b) => (b.onclick = () => pokaziGeslo(m, b.dataset.g)));
}

function pokaziGeslo(m, id) {
  const g = M.gesla.find((x) => x.id === id);
  const v = M.odklenjena[id]?.v || {};
  const polje = (k, n, skrito) => v[k] ? `<div class="field"><div class="grow"><small>${n}</small><span class="sel" ${skrito ? `data-skrito="1"` : ""}>${skrito ? "••••••••" : esc(v[k])}</span></div>
    ${skrito ? `<button data-pokazi>Pokaži</button>` : ""}<button data-kop="${k}">Kopiraj</button></div>` : "";
  openSheet(`<h3>${esc(g.naslov)}</h3>
    ${polje("uporabnik", "Uporabnik ali e-pošta")}${polje("geslo", "Geslo", true)}${polje("povezava", "Povezava")}
    ${v.opomba ? `<div class="field"><div class="grow"><small>Opomba</small><span class="sel" style="white-space:pre-wrap">${esc(v.opomba)}</span></div></div>` : ""}
    <div class="row"><button class="btn ghost" id="gu">Uredi</button><button class="btn danger" id="gb">Izbriši</button></div>`, (box) => {
    box.querySelectorAll("[data-kop]").forEach((b) => (b.onclick = () => kopiraj(v[b.dataset.kop])));
    box.querySelector("[data-pokazi]")?.addEventListener("click", (e) => {
      const s = box.querySelector("[data-skrito]");
      const skrij = s.textContent !== "••••••••";
      s.textContent = skrij ? "••••••••" : v.geslo; e.target.textContent = skrij ? "Pokaži" : "Skrij";
    });
    $("gu").onclick = () => urediGeslo(m, g, v);
    $("gb").onclick = () => {
      if (!confirm(`Izbrišem ${g.naslov}?`)) return;
      deleteDoc(doc(db, "mape", m.id, "gesla", g.id)).catch(napaka); closeSheet();
    };
  });
}

function urediGeslo(m, g = null, v = {}) {
  openSheet(`<h3>${g ? "Uredi" : "Novo geslo ali informacija"}</h3>
    <label for="gn1">Naslov</label><input id="gn1" maxlength="80" value="${esc(g?.naslov || "")}" placeholder="npr. Instagram">
    <label for="gn2">Uporabnik ali e-pošta</label><input id="gn2" autocapitalize="off" autocomplete="off" value="${esc(v.uporabnik || "")}">
    <label for="gn3">Geslo</label><input id="gn3" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(v.geslo || "")}">
    <label for="gn4">Povezava</label><input id="gn4" type="url" inputmode="url" autocapitalize="off" value="${esc(v.povezava || "")}">
    <label for="gn5">Pomembne informacije</label><textarea id="gn5" maxlength="4000" placeholder="npr. 2FA koda je na Urškinem telefonu, račun plačan do ...">${esc(v.opomba || "")}</textarea>
    <p class="small muted">Vse razen naslova je šifrirano s skupnim geslom.</p>
    <button class="btn" id="gs">Shrani</button>`, () => {
    $("gs").onclick = async () => {
      const naslov = $("gn1").value.trim();
      if (!naslov) return toast("Vpiši naslov.");
      const vsebina = { uporabnik: $("gn2").value.trim(), geslo: $("gn3").value, povezava: $("gn4").value.trim(), opomba: $("gn5").value.trim() };
      $("gs").disabled = true;
      try {
        const data = { naslov, enc: await zakleni(S.kljuc, vsebina), uredil: jaz, ob: Date.now() };
        if (g) await updateDoc(doc(db, "mape", m.id, "gesla", g.id), data);
        else await addDoc(collection(db, "mape", m.id, "gesla"), data);
        closeSheet(); toast("Shranjeno");
      } catch (e) { $("gs").disabled = false; napaka(e); }
    };
  });
}

/* =================== NASTAVITVE =================== */
function renderNastavitve() {
  const clani = Object.keys({ ...Object.fromEntries(Object.keys(ZACETNI_CLANI).map((e) => [e, 1])), ...S.clani });
  view.innerHTML = `
  <div class="top"><button class="iconbtn" id="nazaj" aria-label="Nazaj">${ico.nazaj}</button><div class="grow"><h1>Nastavitve</h1></div></div>
  <h2>Ti</h2>
  <div class="list"><div class="item"><div class="grow"><div>${esc(imeClana(jaz))}</div><small>${esc(jaz)}</small></div><button class="link" id="ime">Spremeni ime</button></div></div>
  <h2>Ekipa</h2>
  <div class="list">${clani.map((e) => `<div class="item"><div class="grow"><div>${esc(imeClana(e))}</div><small>${esc(e)}</small></div>
    ${e !== jaz && !ZACETNI_CLANI[e] ? `<button class="link" data-odstrani="${esc(e)}">Odstrani</button>` : ""}</div>`).join("")}</div>
  <button class="btn ghost" id="dodaj">Dodaj člana</button>
  <p class="small muted">Novi član si v aplikaciji ustvari račun s to e-pošto. Za TestFlight ga mora Teo dodati še med testerje.</p>
  <h2>Moji opomniki za objave</h2>
  <div class="list" style="padding:4px 14px 14px">
    <label>Koliko prej</label>
    <div class="chips" id="nd">${[[7, "1 teden"], [3, "3 dni"], [2, "2 dni"], [1, "1 dan"], [0, "Na dan"]].map(([k, n]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${(prefs.opomniki.dni || []).includes(k)}">${n}</button>`).join("")}</div>
    <label for="nu">Ob kateri uri</label>
    <input id="nu" type="time" value="${esc(prefs.opomniki.ura || "09:00")}">
    <label>Še</label>
    <div class="chips"><button type="button" class="chip" id="nh" aria-pressed="${!!prefs.opomniki.uroPrej}">1 uro prej</button><button type="button" class="chip" id="no" aria-pressed="${!!prefs.opomniki.obUri}">Ob uri objave</button></div>
    <p class="small muted" id="nopis">${esc(opisOpomnikov(prefs.opomniki))}</p>
  </div>
  <button class="btn ghost" id="obv">Vklopi obvestila</button>
  <p class="small muted">Nastavitve veljajo samo za tvoj telefon. Če obvestila ne pridejo, jih vklopi v Nastavitve › Obvestila › Byurska.</p>
  <h2>Gesla</h2>
  <button class="btn ghost" id="pozabi">Zakleni gesla na tem telefonu</button>
  <button class="btn danger" id="odjava">Odjava</button>`;
  $("nazaj").onclick = nazaj;
  $("ime").onclick = () => {
    const ime = prompt("Tvoje ime", imeClana(jaz));
    if (ime && ime.trim()) setDoc(doc(db, "clani", jaz), { ime: ime.trim().slice(0, 40) }, { merge: true }).catch(napaka);
  };
  $("dodaj").onclick = () => openSheet(`<h3>Dodaj člana</h3>
    <label for="ce">E-pošta</label><input id="ce" type="email" inputmode="email" autocapitalize="off" placeholder="nives@gmail.com">
    <label for="ci">Ime</label><input id="ci" maxlength="40" placeholder="Nives">
    <button class="btn" id="cs">Dodaj</button>`, () => {
    $("cs").onclick = () => {
      const e = $("ce").value.trim().toLowerCase();
      if (!veljavenEmail(e)) return toast("Vpiši pravo e-pošto.");
      setDoc(doc(db, "clani", e), { ime: $("ci").value.trim() || e.split("@")[0], dodal: jaz, ob: Date.now() }, { merge: true })
        .then(() => { closeSheet(); toast("Dodano"); }).catch(napaka);
    };
  });
  view.querySelectorAll("[data-odstrani]").forEach((b) => (b.onclick = () => {
    const e = b.dataset.odstrani;
    if (confirm(`Odstranim ${imeClana(e)} iz ekipe? Izgubi dostop do vsega.`)) deleteDoc(doc(db, "clani", e)).catch(napaka);
  }));
  const shraniOp = () => { savePrefs(); planirajObvestila(); $("nopis").textContent = opisOpomnikov(prefs.opomniki); };
  view.querySelectorAll("#nd .chip").forEach((c) => (c.onclick = () => {
    const k = Number(c.dataset.k), d = prefs.opomniki.dni = [...(prefs.opomniki.dni || [])];
    const i = d.indexOf(k); i >= 0 ? d.splice(i, 1) : d.push(k);
    c.setAttribute("aria-pressed", d.includes(k)); shraniOp();
  }));
  $("nu").onchange = () => { prefs.opomniki.ura = $("nu").value || "09:00"; shraniOp(); };
  for (const [id, k] of [["nh", "uroPrej"], ["no", "obUri"]]) $(id).onclick = () => {
    prefs.opomniki[k] = !prefs.opomniki[k]; $(id).setAttribute("aria-pressed", prefs.opomniki[k]); shraniOp();
  };
  $("obv").onclick = async () => {
    if (!native) return toast("Deluje v aplikaciji na iPhonu.");
    const r = await Studio.dovoljenje().catch(() => ({}));
    toast(r.dovoljeno ? "Obvestila so vklopljena." : "Vklopi jih v Nastavitve › Obvestila › Byurska.");
    planirajObvestila();
  };
  $("pozabi").onclick = async () => { S.kljuc = null; S.kljucOk = false; M.odklenjena = {}; await kljucShramba.pisi(""); toast("Gesla so zaklenjena. Za ogled vpiši skupno geslo."); };
  $("odjava").onclick = async () => {
    if (!confirm("Odjava?")) return;
    if (native) Studio.obvestila({ seznam: [] }).catch(() => {});
    S.kljuc = null; S.kljucOk = false; M.odklenjena = {}; await kljucShramba.pisi("");
    signOut(auth);
  };
}

/* =================== ZAGON =================== */
(async function zagon() {
  await loadPrefs();
  if (!cfg) {
    view.innerHTML = `<div class="center"><h1>Byurska</h1><p class="muted">Strežnik še ni povezan.</p></div>`;
    return;
  }
  initFb();
  onAuthStateChanged(auth, (u) => {
    globalne.splice(0).forEach((f) => f()); odjaviMapo();
    jaz = ""; zgod.length = 0; Object.assign(pot, { zaslon: "domov", mapa: null, zavihek: "todo" }); closeSheet();
    if (!u) return renderPrijava();
    if (!u.emailVerified) return renderPotrdi(u);
    zacni(u);
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && jaz) { planirajObvestila(); osvezi(); } });
})();
