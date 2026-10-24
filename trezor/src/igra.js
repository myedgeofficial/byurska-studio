// REMAKO banka kot 3D igra: figurica v lobiju sodobne banke, pogled izza lika, oddelki ob stenah, dvigalo v nadstropja.
// Vse je narisano s kodo (three.js + platno za teksture in napise), brez zunanjih datotek, zato deluje s strogim CSP.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

const SIRINA = 17, GLOBINA = 15, VISINA = 7.5; // pol širine, pol globine in višina lobija (m)
const PISAVA = '"Inter Tight", system-ui, sans-serif';

// Kje je figurica stala, ko je šla v oddelek (da se vrne na isto mesto).
let shranjeno = null;

// Ponovljiva naključja za teksture.
function nakljucje(seme) {
  let s = seme >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function platno(w, h, risi) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  risi(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function zaobljen(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function prilagodi(g, besedilo, najvec, velikost, debelina = 800) {
  let v = velikost;
  do { g.font = `${debelina} ${v}px ${PISAVA}`; v -= 2; } while (g.measureText(besedilo).width > najvec && v > 12);
}

// Svetel marmor z žilami in fugami med ploščami.
function marmor() {
  const r = nakljucje(7);
  return platno(1024, 1024, (g, w) => {
    g.fillStyle = "#e9e5de"; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${150 + r() * 60},${140 + r() * 60},${130 + r() * 60},.05)`; g.fillRect(r() * w, r() * w, 3 + r() * 30, 3 + r() * 30); }
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(120,112,104,${0.08 + r() * 0.18})`; g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath(); let x = r() * w, y = r() * w; g.moveTo(x, y);
      for (let j = 0; j < 6; j++) { const nx = x + (r() - 0.3) * 260, ny = y + (r() - 0.5) * 200; g.quadraticCurveTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 120, nx, ny); x = nx; y = ny; }
      g.stroke();
    }
    g.strokeStyle = "rgba(90,84,78,.35)"; g.lineWidth = 2; g.strokeRect(0, 0, w, w);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, w); g.moveTo(0, w / 2); g.lineTo(w, w / 2); g.stroke();
  });
}
// Oreh: navpične letnice.
function les(svetel = false) {
  const r = nakljucje(svetel ? 3 : 11);
  return platno(512, 512, (g, w, h) => {
    g.fillStyle = svetel ? "#b88a5c" : "#6b4428"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = r() * w;
      g.strokeStyle = svetel ? `rgba(${90 + r() * 50},${55 + r() * 30},${25 + r() * 20},${0.12 + r() * 0.2})` : `rgba(${40 + r() * 30},${22 + r() * 18},${10 + r() * 10},${0.15 + r() * 0.25})`;
      g.lineWidth = 0.5 + r() * 2.5; g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + (r() - 0.5) * 18, h * 0.33, x + (r() - 0.5) * 18, h * 0.66, x + (r() - 0.5) * 10, h); g.stroke();
    }
  });
}
// Mesto za steklom: stavbe z okni.
function fasada(seme) {
  const r = nakljucje(seme);
  return platno(256, 512, (g, w, h) => {
    g.fillStyle = ["#c9ced6", "#b7bec8", "#d8d6d0", "#a9b2bd"][seme % 4]; g.fillRect(0, 0, w, h);
    for (let y = 16; y < h - 10; y += 30) for (let x = 12; x < w - 12; x += 26) {
      g.fillStyle = r() > 0.25 ? `rgba(60,80,105,${0.55 + r() * 0.3})` : "rgba(255,240,210,.8)"; g.fillRect(x, y, 16, 20);
    }
  });
}

// Zaslon oddelka na steni: ime, velika številka in podnapis.
function tablaOddelka(o) {
  return platno(768, 440, (g, w, h) => {
    zaobljen(g, 0, 0, w, h, 22); g.fillStyle = "#121318"; g.fill();
    g.fillStyle = o.barva; g.fillRect(44, 62, 8, 52);
    g.fillStyle = "#f4f4f6"; prilagodi(g, o.ime, w - 130, 54); g.textBaseline = "middle"; g.fillText(o.ime, 68, 90);
    if (o.oznaka) { g.font = `700 30px ${PISAVA}`; g.fillStyle = "#e8c47a"; g.textAlign = "right"; g.fillText(o.oznaka, w - 44, 90); g.textAlign = "left"; }
    g.fillStyle = o.barvaGlavno || "#ffffff"; prilagodi(g, o.glavno, w - 88, 104, 800); g.fillText(o.glavno, 44, 232);
    g.fillStyle = "#a9adb8"; prilagodi(g, o.pod, w - 88, 34, 600); g.fillText(o.pod, 44, 336);
    if (o.napredek != null) {
      zaobljen(g, 44, 382, w - 88, 12, 6); g.fillStyle = "rgba(255,255,255,.1)"; g.fill();
      zaobljen(g, 44, 382, Math.max(12, (w - 88) * o.napredek), 12, 6); g.fillStyle = o.barva; g.fill();
    }
  });
}

function oznakaImena(ime) {
  const t = platno(256, 72, (g, w, h) => {
    zaobljen(g, 8, 10, w - 16, h - 20, 26); g.fillStyle = "rgba(255,255,255,.88)"; g.fill();
    g.fillStyle = "#1a1b22"; g.font = `750 32px ${PISAVA}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ime, w / 2, h / 2 + 1);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }));
  s.scale.set(0.95, 0.27, 1); s.renderOrder = 10;
  return s;
}

// Človeček: obleka, koža, lasje, roke in noge na zglobih (za hojo). Spredaj je smer -z.
function figurica(obleka, lasje, ime, zNapisom = true) {
  const g = new THREE.Group();
  const blago = new THREE.MeshStandardMaterial({ color: obleka, roughness: 0.75 });
  const hlace = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.8 });
  const koza = new THREE.MeshStandardMaterial({ color: 0xe2b597, roughness: 0.6 });
  const las = new THREE.MeshStandardMaterial({ color: lasje, roughness: 0.9 });
  const cevlji = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.35, metalness: 0.2 });
  const srajca = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
  const trup = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.5, 6, 16), blago); trup.scale.set(1.12, 1, 0.78); trup.position.y = 1.08; g.add(trup);
  const ovratnik = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 14), srajca); ovratnik.position.y = 1.5; g.add(ovratnik);
  const vrat = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 12), koza); vrat.position.y = 1.56; g.add(vrat);
  const glava = new THREE.Group(); glava.position.y = 1.76; g.add(glava);
  const lobanja = new THREE.Mesh(new THREE.SphereGeometry(0.19, 28, 20), koza); lobanja.scale.set(0.95, 1.08, 1); glava.add(lobanja);
  const priceska = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), las); priceska.position.set(0, 0.03, 0.015); priceska.rotation.x = -0.25; glava.add(priceska);
  for (const x of [-0.065, 0.065]) { const oko = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.3 })); oko.position.set(x, 0.01, -0.175); glava.add(oko); }
  for (const x of [-0.19, 0.19]) { const uho = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), koza); uho.position.set(x, 0, 0); glava.add(uho); }
  const ud = (x, y, dol, debel, mat, konec) => {
    const zglob = new THREE.Group(); zglob.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(debel, dol, 4, 12), mat); m.position.y = -dol / 2 - debel; zglob.add(m);
    if (konec) { konec.position.y = -dol - debel * 2; zglob.add(konec); }
    g.add(zglob); return zglob;
  };
  const dlan = () => new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), koza);
  const cevelj = () => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.28), cevlji); c.position.z = -0.05; return c; };
  const roka = [ud(-0.36, 1.42, 0.46, 0.075, blago, dlan()), ud(0.36, 1.42, 0.46, 0.075, blago, dlan())];
  const noga = [ud(-0.13, 0.84, 0.56, 0.095, hlace, cevelj()), ud(0.13, 0.84, 0.56, 0.095, hlace, cevelj())];
  noga.forEach((n) => (n.children[1].position.y += 0.06));
  if (zNapisom) { const ozn = oznakaImena(ime); ozn.position.y = 2.2; g.add(ozn); }
  let faza = 0;
  g.userData.animiraj = (dt, hitrost) => {
    const k = Math.min(1, hitrost / 4);
    faza += dt * (4 + hitrost * 1.5);
    const zamah = Math.sin(faza) * 0.6 * k;
    noga[0].rotation.x = zamah; noga[1].rotation.x = -zamah;
    roka[0].rotation.x = -zamah * 0.7; roka[1].rotation.x = zamah * 0.7;
    roka[0].rotation.z = -0.06; roka[1].rotation.z = 0.06;
    const dih = Math.sin(performance.now() / 700) * 0.008;
    const poskok = Math.abs(Math.sin(faza)) * 0.035 * k;
    trup.position.y = 1.08 + poskok + dih;
    glava.position.y = 1.76 + poskok + dih * 1.2;
    ovratnik.position.y = 1.5 + poskok + dih; vrat.position.y = 1.56 + poskok + dih;
  };
  g.traverse((m) => m.isMesh && (m.castShadow = true));
  return g;
}

export function zazeni(ovoj, { igralec, partner, nivo, oddelki, nadstropja, trak, klasicno }) {
  const naDotik = matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  let razmerje = Math.min(devicePixelRatio, naDotik ? 1.75 : 2);
  renderer.setPixelRatio(razmerje);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "igra-platno";
  ovoj.append(renderer.domElement);
  ovoj.classList.toggle("dotik", naDotik);

  const scena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scena.environmentIntensity = 0.55;
  pmrem.dispose();
  // Nebo: mehak prehod od svetlo modre do skoraj bele.
  const nebo = platno(16, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#8fb4dc"); gr.addColorStop(0.6, "#d9e5f0"); gr.addColorStop(1, "#eef0ee"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scena.background = nebo;
  const kamera = new THREE.PerspectiveCamera(56, 1, 0.1, 160);

  scena.add(new THREE.HemisphereLight(0xfff8ee, 0x8a7a6a, 0.95));
  const sonce = new THREE.DirectionalLight(0xfff0dc, 2.4);
  sonce.position.set(-10, 16, 26); sonce.castShadow = true;
  const ss = naDotik ? 1024 : 2048;
  sonce.shadow.mapSize.set(ss, ss);
  sonce.shadow.bias = -0.0004; sonce.shadow.normalBias = 0.02;
  Object.assign(sonce.shadow.camera, { left: -SIRINA - 2, right: SIRINA + 2, top: GLOBINA + 6, bottom: -GLOBINA - 6, near: 1, far: 70 });
  scena.add(sonce);

  const ovire = [];
  const ovira = (x, z, sx, sz) => ovire.push({ x1: x - sx / 2, x2: x + sx / 2, z1: z - sz / 2, z2: z + sz / 2 });
  const mat = (barva, o = {}) => new THREE.MeshStandardMaterial({ color: barva, roughness: 0.6, metalness: 0, ...o });
  const svetilo = (barva, moc = 1.6) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(barva), emissiveIntensity: moc });
  const skatla = (sx, sy, sz, m, x, y, z, senca = true, stars = scena) => {
    const k = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    k.position.set(x, y, z); k.castShadow = senca; k.receiveShadow = true; stars.add(k); return k;
  };
  const texLes = les(), texLesSv = les(true);
  const orehMat = (rx, ry) => { const t = texLes.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; return mat(0xffffff, { map: t, roughness: 0.55 }); };
  const medenina = mat(0xc9a36a, { metalness: 1, roughness: 0.28 });
  const jeklo = mat(0xb9bdc4, { metalness: 1, roughness: 0.32 });
  const belo = mat(0xf3f1ec, { roughness: 0.5 });
  const omet = mat(0xe7e2da, { roughness: 0.9 });

  // Tla: marmor s ploščami 2 × 2 m.
  const texMarmor = marmor();
  texMarmor.wrapS = texMarmor.wrapT = THREE.RepeatWrapping; texMarmor.repeat.set(SIRINA / 2, GLOBINA / 2);
  const tla = new THREE.Mesh(new THREE.PlaneGeometry(SIRINA * 2, GLOBINA * 2), mat(0xffffff, { map: texMarmor, roughness: 0.12, metalness: 0.05 }));
  tla.rotation.x = -Math.PI / 2; tla.receiveShadow = true; scena.add(tla);
  // Temna preproga od vhoda z robovi iz medenine.
  const preproga = new THREE.Mesh(new THREE.PlaneGeometry(3, 9), mat(0x2b2d33, { roughness: 0.95 }));
  preproga.rotation.x = -Math.PI / 2; preproga.position.set(0, 0.006, GLOBINA - 4.5); preproga.receiveShadow = true; scena.add(preproga);
  for (const x of [-1.52, 1.52]) skatla(0.05, 0.012, 9, medenina, x, 0.008, GLOBINA - 4.5, false);

  // Stene: omet, spodaj lesene obloge, strop z linijskimi lučmi.
  skatla(SIRINA * 2, VISINA, 0.4, omet, 0, VISINA / 2, -GLOBINA - 0.2, false);
  skatla(0.4, VISINA, GLOBINA * 2, omet, -SIRINA - 0.2, VISINA / 2, 0, false);
  skatla(0.4, VISINA, GLOBINA * 2, omet, SIRINA + 0.2, VISINA / 2, 0, false);
  skatla(SIRINA * 2, 1.1, 0.06, orehMat(12, 1), 0, 0.55, -GLOBINA + 0.03, false);
  skatla(0.06, 1.1, GLOBINA * 2, orehMat(10, 1), -SIRINA + 0.03, 0.55, 0, false);
  skatla(0.06, 1.1, GLOBINA * 2, orehMat(10, 1), SIRINA - 0.03, 0.55, 0, false);
  const strop = new THREE.Mesh(new THREE.PlaneGeometry(SIRINA * 2, GLOBINA * 2), mat(0xf4f2ee, { roughness: 0.95 }));
  strop.rotation.x = Math.PI / 2; strop.position.y = VISINA; scena.add(strop);
  for (let z = -GLOBINA + 3; z < GLOBINA; z += 4) for (const x of [-10, 0, 10]) skatla(6, 0.04, 0.22, svetilo(0xfff4e2, 1.3), x, VISINA - 0.02, z, false);

  // Steklena fasada z jeklenimi okvirji in vrati; zunaj ulica in mesto.
  const steklo = new THREE.MeshPhysicalMaterial({ color: 0xdfe9f2, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, envMapIntensity: 1.2 });
  for (const x of [-SIRINA / 2 - 1.5, SIRINA / 2 + 1.5]) skatla(SIRINA - 3, VISINA, 0.05, steklo, x, VISINA / 2, GLOBINA, false);
  for (let x = -SIRINA; x <= SIRINA + 0.01; x += 3.4) if (Math.abs(x) > 2) skatla(0.1, VISINA, 0.14, jeklo, x, VISINA / 2, GLOBINA, false);
  skatla(SIRINA * 2, 0.14, 0.16, jeklo, 0, VISINA - 0.07, GLOBINA, false);
  skatla(SIRINA * 2, 0.1, 0.16, jeklo, 0, 3.2, GLOBINA, false);
  for (const x of [-3, 3]) skatla(0.16, VISINA, 0.18, jeklo, x, VISINA / 2, GLOBINA, false);
  ovira(-SIRINA / 2 - 1.5, GLOBINA, SIRINA - 3, 0.4); ovira(SIRINA / 2 + 1.5, GLOBINA, SIRINA - 3, 0.4);
  ovira(0, GLOBINA + 0.4, 6, 0.3);
  const ulica = new THREE.Mesh(new THREE.PlaneGeometry(200, 80), mat(0x8e9096, { roughness: 0.95 }));
  ulica.rotation.x = -Math.PI / 2; ulica.position.set(0, -0.02, GLOBINA + 40); ulica.receiveShadow = true; scena.add(ulica);
  const fasade = [0, 1, 2, 3].map(fasada);
  for (let i = 0; i < 14; i++) {
    const v = 14 + ((i * 37) % 26), s = 7 + ((i * 13) % 4) * 1.5;
    const t = fasade[i % 4].clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(s / 7, v / 14); t.needsUpdate = true;
    skatla(s, v, s, mat(0xffffff, { map: t, roughness: 0.7 }), -62 + i * 9.5, v / 2, GLOBINA + 34 + ((i * 7) % 9), false);
  }
  for (const x of [-12, -4, 6, 13]) drevo(scena, mat, x, GLOBINA + 6);

  // Kamnite stebri.
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, VISINA, 32), mat(0xefebe4, { roughness: 0.35 }));
    st.position.set(x, VISINA / 2, z); st.castShadow = true; st.receiveShadow = true; scena.add(st);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32), medenina); pod.position.set(x, 0.06, z); scena.add(pod);
    ovira(x, z, 1, 1);
  }

  // Recepcija na sredini: bel pult z lesenim vrhom, nad njo viseči zaslon z nivojem REMAKO.
  const recepcija = new THREE.Group(); recepcija.position.set(0, 0, -1); scena.add(recepcija);
  skatla(5.2, 1.08, 1.1, belo, 0, 0.54, 0, true, recepcija);
  skatla(5.4, 0.06, 1.24, orehMat(3, 1), 0, 1.11, 0, true, recepcija);
  skatla(5.22, 0.04, 0.02, medenina, 0, 0.2, 0.56, false, recepcija);
  const logo = platno(1024, 160, (g, w, h) => { g.fillStyle = "#f3f1ec"; g.fillRect(0, 0, w, h); g.fillStyle = "#23242b"; g.font = `800 92px ${PISAVA}`; g.textAlign = "center"; g.textBaseline = "middle"; g.letterSpacing = "18px"; g.fillText("REMAKO", w / 2, h / 2 + 4); });
  const logoM = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.5 }));
  logoM.position.set(0, 0.68, 0.552); recepcija.add(logoM);
  for (const x of [-1.4, 1.4]) { skatla(0.5, 0.32, 0.03, mat(0x1a1b20, { roughness: 0.3 }), x, 1.32, -0.25, true, recepcija).rotation.x = -0.2; }
  ovira(0, -1, 5.6, 1.5);
  const zaslonNivo = platno(1600, 400, (g, w, h) => {
    zaobljen(g, 0, 0, w, h, 26); g.fillStyle = "#14151a"; g.fill();
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff"; g.font = `800 110px ${PISAVA}`; g.fillText("REMAKO", 70, 120);
    g.fillStyle = "#e8c47a"; g.font = `750 64px ${PISAVA}`; g.textAlign = "right"; g.fillText(`Nivo ${nivo.n}`, w - 70, 120); g.textAlign = "left";
    g.fillStyle = "#c7cad3"; prilagodi(g, nivo.opis, w - 140, 54, 650); g.fillText(nivo.opis, 70, 240);
    zaobljen(g, 70, 320, w - 140, 20, 10); g.fillStyle = "rgba(255,255,255,.12)"; g.fill();
    zaobljen(g, 70, 320, Math.max(20, (w - 140) * nivo.napredek), 20, 10); g.fillStyle = "#e8c47a"; g.fill();
  });
  const visZaslon = new THREE.Group(); visZaslon.position.set(0, 5.3, -1.2); scena.add(visZaslon);
  const zm = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: zaslonNivo, toneMapped: false }));
  zm.position.z = 0.04; visZaslon.add(zm);
  skatla(6.15, 1.62, 0.08, mat(0x1d1e24, { metalness: 0.6, roughness: 0.3 }), 0, 0, 0, false, visZaslon);
  for (const x of [-2.6, 2.6]) skatla(0.025, VISINA - 5.3 - 0.8, 0.025, jeklo, x, (VISINA - 5.3) / 2 + 0.4, 0, false, visZaslon);

  // Čakalnica pri vhodu: kavča, mizica in rastline.
  for (const x of [-7, 7]) kavc(scena, skatla, mat, x, GLOBINA - 4, x < 0 ? Math.PI / 2 : -Math.PI / 2, ovira);
  for (const x of [-5.6, 5.6]) { skatla(0.9, 0.4, 1.6, orehMat(1, 1), x, 0.2, GLOBINA - 4); ovira(x, GLOBINA - 4, 0.9, 1.6); }
  for (const [x, z] of [[-15.6, 13.6], [15.6, 13.6], [-15.6, -13.6], [15.6, -13.6], [-3.4, -13.9], [3.4, -13.9], [-9, 3.4], [9, 3.4]]) { rastlina(scena, mat, x, z); ovire.push({ krog: true, x, z, r: 0.5 }); }

  // Dvigalo na sredini zadnje stene, nad njim LED trak zadnjih trejdov.
  const dvigalo = new THREE.Group(); dvigalo.position.set(0, 0, -GLOBINA + 0.05); scena.add(dvigalo);
  skatla(4.2, 4.6, 0.2, mat(0x2a2b31, { metalness: 0.5, roughness: 0.4 }), 0, 2.3, 0.05, false, dvigalo);
  const vrataMat = mat(0xc4c8ce, { metalness: 1, roughness: 0.22 });
  const vrata = [-0.8, 0.8].map((x) => skatla(1.6, 4.1, 0.06, vrataMat, x, 2.05, 0.2, false, dvigalo));
  const kabina = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.1), mat(0xd9c7a8, { roughness: 0.5, emissive: new THREE.Color(0x3a3020), emissiveIntensity: 0.6 }));
  kabina.position.set(0, 2.05, 0.16); dvigalo.add(kabina);
  const tipka = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), svetilo(0xffcf7a, 2)); tipka.position.set(2.35, 1.3, 0.16); dvigalo.add(tipka);
  skatla(0.2, 0.4, 0.04, jeklo, 2.35, 1.3, 0.13, false, dvigalo);
  const napisDvigalo = platno(512, 96, (g, w, h) => { g.fillStyle = "#e8c47a"; g.font = `700 50px ${PISAVA}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("▲  DVIGALO", w / 2, h / 2); });
  const tablaDv = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), new THREE.MeshBasicMaterial({ map: napisDvigalo, transparent: true }));
  tablaDv.position.set(0, 4.85, 0.17); dvigalo.add(tablaDv);
  ovira(0, -GLOBINA + 0.3, 4.4, 0.6);

  const besedilaTraku = trak.length ? trak : [{ t: "REMAKO d.o.o. · trading desk · naloži prvo zgodovino trejdov", plus: true }];
  const trakTex = platno(4096, 112, (g, w, h) => {
    g.fillStyle = "#0b0c0f"; g.fillRect(0, 0, w, h);
    g.font = `700 54px ${PISAVA}`; g.textBaseline = "middle";
    let x = 30;
    while (x < w) for (const b of besedilaTraku) {
      g.fillStyle = b.plus ? "#4ade80" : "#f87171"; g.fillText(b.t, x, h / 2); x += g.measureText(b.t).width + 90;
      if (x >= w) break;
    }
  });
  trakTex.wrapS = THREE.RepeatWrapping; trakTex.repeat.set(0.45, 1);
  const trakMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.5), new THREE.MeshBasicMaterial({ map: trakTex, toneMapped: false }));
  trakMesh.position.set(0, 5.75, -GLOBINA + 0.04); scena.add(trakMesh);
  skatla(14.2, 0.62, 0.06, mat(0x1d1e24, { metalness: 0.6, roughness: 0.3 }), 0, 5.75, -GLOBINA + 0.01, false);

  // Oddelki: štirje ob levi, štirje ob desni steni. Lesena stena z zaslonom, pult z rekviziti, krog na tleh za vstop.
  const MESTA = [[-1, -9], [-1, -3], [-1, 3], [-1, 9], [1, -9], [1, -3], [1, 3], [1, 9]];
  const cone = [];
  oddelki.slice(0, MESTA.length).forEach((o, i) => {
    const [stran, z] = MESTA[i];
    const x = stran * (SIRINA - 0.05);
    const skupina = new THREE.Group(); skupina.position.set(x, 0, z); skupina.rotation.y = -stran * Math.PI / 2; scena.add(skupina);
    const barva = new THREE.Color(o.barva);
    skatla(4.8, VISINA - 1.1, 0.08, orehMat(3, 4), 0, 1.1 + (VISINA - 1.1) / 2, 0.06, false, skupina);
    const zaslon = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.24), new THREE.MeshBasicMaterial({ map: tablaOddelka(o), transparent: true, toneMapped: false }));
    zaslon.position.set(0, 3.9, 0.16); skupina.add(zaslon);
    skatla(4.0, 2.34, 0.06, mat(0x15161b, { metalness: 0.5, roughness: 0.3 }), 0, 3.9, 0.12, false, skupina);
    skatla(4.8, 0.03, 0.03, svetilo(barva, 1.4), 0, 1.12, 0.12, false, skupina);
    // Pult: bel z lesenim vrhom.
    skatla(3.4, 1.0, 1.0, belo, 0, 0.5, 1.05, true, skupina);
    skatla(3.5, 0.05, 1.1, orehMat(2, 1), 0, 1.025, 1.05, true, skupina);
    skupina.add(rekvizit(o.vrsta, barva, mat, svetilo, jeklo));
    // Krog na tleh.
    const plosca = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.74, 64), new THREE.MeshBasicMaterial({ color: barva, transparent: true, opacity: 0.7 }));
    plosca.rotation.x = -Math.PI / 2; plosca.position.set(0, 0.012, 2.9); skupina.add(plosca);
    skupina.updateMatrixWorld();
    const p = new THREE.Vector3(0, 0, 2.9).applyMatrix4(skupina.matrixWorld);
    cone.push({ x: p.x, z: p.z, o, plosca });
    ovira(x - stran * 1.0, z, 1.3, 3.6);
  });
  const ploscaDv = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.86, 64), new THREE.MeshBasicMaterial({ color: 0xc9a36a, transparent: true, opacity: 0.8 }));
  ploscaDv.rotation.x = -Math.PI / 2; ploscaDv.position.set(0, 0.012, -GLOBINA + 2.4); scena.add(ploscaDv);
  cone.push({ x: 0, z: -GLOBINA + 2.4, dvigalo: true, o: { ime: "Dvigalo", barva: "#c9a36a" }, plosca: ploscaDv });

  // Odsev lobija v marmorju: enkrat posnamemo prostor s kocko kamer.
  const kocka = new THREE.WebGLCubeRenderTarget(naDotik ? 256 : 512, { type: THREE.HalfFloatType });
  const kockaKam = new THREE.CubeCamera(0.1, 120, kocka);
  kockaKam.position.set(0, 1.4, 2);
  tla.visible = false; kockaKam.update(renderer, scena); tla.visible = true;
  tla.material.envMap = kocka.texture; tla.material.envMapIntensity = 0.9; tla.material.needsUpdate = true;

  // Igralec in partner (stoji pri svoji mizi).
  const OBLEKA = { Teo: [0x2f3b5c, 0x2b1d14], Tim: [0x5a2a35, 0x14110f] };
  const [ob, la] = OBLEKA[igralec] || OBLEKA.Teo;
  const jaz = figurica(ob, la, igralec || "Ti", false);
  jaz.position.set(0, 0, GLOBINA - 7.5); jaz.rotation.y = 0;
  scena.add(jaz);
  if (location.hostname === "localhost") window.__igraJaz = jaz; // samo za preizkus
  let drugi = null;
  if (partner) {
    const [pb, pl] = OBLEKA[partner] || OBLEKA.Tim;
    drugi = figurica(pb, pl, partner);
    const miza = cone.find((c) => c.o.oseba === partner);
    if (miza) { drugi.position.set(miza.x + (miza.x > 0 ? 0.6 : -0.6), 0, miza.z + 1.3); drugi.rotation.y = miza.x > 0 ? -Math.PI / 2 : Math.PI / 2; }
    else drugi.position.set(4, 0, 2);
    scena.add(drugi);
    ovire.push({ krog: true, x: drugi.position.x, z: drugi.position.z, r: 0.45 });
  }

  // Vmesnik nad platnom.
  const div = (cls, ...otroci) => { const e = document.createElement("div"); e.className = cls; otroci.forEach((o) => o && e.append(o)); return e; };
  const el = (tag, cls, besedilo) => { const e = document.createElement(tag); if (cls) e.className = cls; if (besedilo != null) e.textContent = besedilo; return e; };
  const gumb = (cls, besedilo, klik) => { const b = el("button", cls, besedilo); b.type = "button"; b.addEventListener("click", klik); return b; };
  const hud = div("igra-hud");
  const nX = div("igra-xp", div("")); nX.firstChild.style.width = Math.round(nivo.napredek * 100) + "%";
  hud.append(div("igra-nivo", el("b", "", `Nivo ${nivo.n}`), el("span", "", nivo.opis), nX), gumb("igra-gumb", "Klasičen pogled", klasicno));
  const pomoc = el("div", "igra-pomoc", naDotik ? "Joystick levo za hojo · povleci za pogled" : "WASD ali puščice za hojo · Shift tek · povleci z miško za pogled · E za vstop");
  const poziv = div("igra-poziv");
  const pozivIme = el("b");
  const pozivGumb = gumb("igra-vstop", "Vstopi", () => vstopi());
  poziv.append(pozivIme, pozivGumb);
  const panel = div("igra-dvigalo");
  const soba = div("igra-soba");
  const zatemni = div("igra-zatemni");
  const joy = div("igra-joy", div("igra-joy-g"));
  ovoj.append(hud, pomoc, poziv, panel, soba, zatemni);
  if (naDotik) ovoj.append(joy);
  const skrijPomoc = setTimeout(() => pomoc.classList.add("skrij"), shranjeno ? 10 : 7000);

  // Vhodi: tipke, vlečenje za pogled, joystick.
  const tipke = new Set();
  let yaw = 0, pitch = 0.32, razdalja = naDotik ? 6.6 : 5.8;
  if (shranjeno) { jaz.position.set(shranjeno.x, 0, shranjeno.z); jaz.rotation.y = shranjeno.ry; yaw = shranjeno.yaw; pitch = shranjeno.pitch; }
  let vleka = null;
  const joyV = { x: 0, y: 0 }; let joyId = null;
  const odprto = () => soba.classList.contains("on") || panel.classList.contains("on");
  const naTipko = (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase();
    if (k === "escape") { zapriVse(); return; }
    if (odprto()) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) { tipke.add(k); e.preventDefault(); }
    if ((k === "e" || k === "enter" || k === " ") && aktivna) { e.preventDefault(); vstopi(); }
  };
  const spustiTipko = (e) => tipke.delete(e.key.toLowerCase());
  const izgubaFokusa = () => tipke.clear();
  const platnoEl = renderer.domElement;
  const dol = (e) => { if (vleka == null) { vleka = { id: e.pointerId, x: e.clientX, y: e.clientY }; platnoEl.setPointerCapture(e.pointerId); } };
  const premik = (e) => {
    if (!vleka || vleka.id !== e.pointerId) return;
    yaw -= (e.clientX - vleka.x) * 0.006; pitch = Math.max(0.08, Math.min(0.95, pitch + (e.clientY - vleka.y) * 0.004));
    vleka.x = e.clientX; vleka.y = e.clientY;
  };
  const gor = (e) => { if (vleka && vleka.id === e.pointerId) vleka = null; };
  const kolo = (e) => { e.preventDefault(); razdalja = Math.max(3, Math.min(10, razdalja + e.deltaY * 0.005)); };
  platnoEl.addEventListener("pointerdown", dol);
  platnoEl.addEventListener("pointermove", premik);
  platnoEl.addEventListener("pointerup", gor);
  platnoEl.addEventListener("pointercancel", gor);
  platnoEl.addEventListener("wheel", kolo, { passive: false });
  addEventListener("keydown", naTipko);
  addEventListener("keyup", spustiTipko);
  addEventListener("blur", izgubaFokusa);
  const joyG = joy.firstChild;
  const joyPostavi = (e) => {
    const r = joy.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    joyV.x = dx / R; joyV.y = dy / R;
    joyG.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  joy.addEventListener("pointerdown", (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyPostavi(e); });
  joy.addEventListener("pointermove", (e) => e.pointerId === joyId && joyPostavi(e));
  const joySpusti = (e) => { if (e.pointerId !== joyId) return; joyId = null; joyV.x = joyV.y = 0; joyG.style.transform = ""; };
  joy.addEventListener("pointerup", joySpusti);
  joy.addEventListener("pointercancel", joySpusti);

  // Vstop: kartica oddelka (ostaneš v banki) ali dvigalo.
  let aktivna = null, odhod = false;
  function vstopi() {
    if (!aktivna || odhod) return;
    tipke.clear();
    if (aktivna.dvigalo) return odpriPanel();
    odpriSobo(aktivna.o);
  }
  function odidi(klik) {
    odhod = true;
    shranjeno = { x: jaz.position.x, z: jaz.position.z, ry: jaz.rotation.y, yaw, pitch };
    zatemni.classList.add("on");
    setTimeout(() => klik(), 320);
  }
  function odpriSobo(o) {
    soba.style.setProperty("--b", o.barva);
    const ploscice = div("igra-soba-mreza", ...(o.povzetek || []).map(([lbl, vr, ton]) => div("igra-soba-pl", el("span", "", lbl), el("b", ton || "", vr))));
    soba.replaceChildren(
      div("igra-soba-glava", el("h3", "", o.ime), gumb("igra-x", "✕", zapriVse)),
      ploscice,
      o.opomba ? el("p", "igra-soba-op", o.opomba) : null,
      div("igra-soba-gumbi", gumb("igra-gumb", "← Nazaj v lobi", zapriVse), gumb("igra-vstop", o.gumb || "Odpri podrobno →", () => odidi(o.klik))));
    [...soba.children].forEach((c) => c == null && c.remove());
    zapriPanel();
    soba.classList.add("on");
  }
  function odpriPanel() {
    panel.replaceChildren(div("igra-soba-glava", el("h3", "", "Dvigalo"), gumb("igra-x", "✕", zapriVse)));
    for (const n of [...nadstropja].reverse()) {
      const b = el("button", "igra-nad" + (n.odklenjeno ? "" : " zaklenjeno")); b.type = "button";
      b.append(el("b", "", n.ime), el("span", "", n.opis));
      if (n.odklenjeno) b.addEventListener("click", () => { zapriPanel(); odpiranjeVrat = 1; setTimeout(() => odidi(n.klik), 450); });
      else b.disabled = true;
      panel.append(b);
    }
    soba.classList.remove("on");
    panel.classList.add("on");
  }
  function zapriPanel() { panel.classList.remove("on"); }
  function zapriVse() { panel.classList.remove("on"); soba.classList.remove("on"); }

  // Trki: pravokotniki in krogi, ločeno po oseh, da drsiš ob ovirah.
  const R = 0.36;
  const trk = (x, z) => {
    if (x < -SIRINA + R + 0.2 || x > SIRINA - R - 0.2 || z < -GLOBINA + R + 0.2 || z > GLOBINA - R) return true;
    for (const o of ovire) {
      if (o.krog) { if (Math.hypot(x - o.x, z - o.z) < o.r + R) return true; }
      else if (x > o.x1 - R && x < o.x2 + R && z > o.z1 - R && z < o.z2 + R) return true;
    }
    return false;
  };

  // Mehak sij le na lučeh in zaslonih.
  const cilj4 = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: naDotik ? 2 : 4 });
  const komp = new EffectComposer(renderer, cilj4);
  komp.addPass(new RenderPass(scena, kamera));
  // Senčenje v kotih in ob predmetih (ambient occlusion), da prostor deluje kot fotografija. Samo na računalniku.
  let ao = null;
  if (!naDotik) { ao = new GTAOPass(scena, kamera, 1, 1); ao.blendIntensity = 0.85; ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1 }); komp.addPass(ao); }
  const sij = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.18, 0.35, 0.92);
  komp.addPass(sij);
  komp.addPass(new OutputPass());

  const ura = new THREE.Clock();
  const cilj = new THREE.Vector3(), zelena = new THREE.Vector3();
  const meritev = { cas: 0, n: 0 };
  let hitrost = 0, odpiranjeVrat = 0, vrataOdprta = 0, tek = true, raf = 0;
  kamera.position.set(jaz.position.x + Math.sin(yaw) * razdalja, 3, jaz.position.z + Math.cos(yaw) * razdalja);

  function korak() {
    raf = requestAnimationFrame(korak);
    const dt = Math.min(0.05, ura.getDelta());
    const t = ura.elapsedTime;
    // Če naprava ne zmore ~45 sličic, malo znižamo ločljivost, da ostane gladko.
    meritev.cas += dt; meritev.n++;
    if (meritev.cas > 2) {
      if (meritev.cas / meritev.n > 0.022 && razmerje > 1) { razmerje = Math.max(1, razmerje - 0.25); renderer.setPixelRatio(razmerje); velikost(); }
      meritev.cas = 0; meritev.n = 0;
    }
    let vx = 0, vz = 0;
    if (!odprto()) {
      if (tipke.has("w") || tipke.has("arrowup")) vz -= 1;
      if (tipke.has("s") || tipke.has("arrowdown")) vz += 1;
      if (tipke.has("a") || tipke.has("arrowleft")) vx -= 1;
      if (tipke.has("d") || tipke.has("arrowright")) vx += 1;
      vx += joyV.x; vz += joyV.y;
    }
    const dolzina = Math.hypot(vx, vz);
    const zelenaHitrost = odhod ? 0 : Math.min(1, dolzina) * (tipke.has("shift") || Math.hypot(joyV.x, joyV.y) > 0.92 ? 6.5 : 3.6);
    hitrost += (zelenaHitrost - hitrost) * Math.min(1, dt * 9);
    if (dolzina > 0.05 && !odhod) {
      const sx = vx / dolzina, sz = vz / dolzina;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const dx = sx * c + sz * s, dz = -sx * s + sz * c;
      const nx = jaz.position.x + dx * hitrost * dt, nz = jaz.position.z + dz * hitrost * dt;
      if (!trk(nx, jaz.position.z)) jaz.position.x = nx;
      if (!trk(jaz.position.x, nz)) jaz.position.z = nz;
      const kot = Math.atan2(-dx, -dz);
      let razlika = kot - jaz.rotation.y; razlika = Math.atan2(Math.sin(razlika), Math.cos(razlika));
      jaz.rotation.y += razlika * Math.min(1, dt * 11);
    }
    jaz.userData.animiraj(dt, hitrost);
    if (drugi) drugi.userData.animiraj(dt, 0);

    // Kamera za likom, ostane v prostoru.
    cilj.set(jaz.position.x, 1.45, jaz.position.z);
    zelena.set(cilj.x + Math.sin(yaw) * Math.cos(pitch) * razdalja, cilj.y + Math.sin(pitch) * razdalja, cilj.z + Math.cos(yaw) * Math.cos(pitch) * razdalja);
    zelena.x = Math.max(-SIRINA + 0.5, Math.min(SIRINA - 0.5, zelena.x));
    zelena.z = Math.max(-GLOBINA + 0.5, Math.min(GLOBINA - 0.6, zelena.z));
    zelena.y = Math.min(VISINA - 0.5, Math.max(0.6, zelena.y));
    kamera.position.lerp(zelena, Math.min(1, dt * 7));
    kamera.lookAt(cilj);

    let najblizja = null, najm = 1.1;
    for (const c of cone) {
      const d = Math.hypot(jaz.position.x - c.x, jaz.position.z - c.z);
      c.plosca.material.opacity = d < 1.1 ? 1 : 0.45 + Math.sin(t * 2.2 + c.z) * 0.2;
      if (d < najm) { najm = d; najblizja = c; }
    }
    if (najblizja !== aktivna) {
      aktivna = najblizja;
      if (aktivna) {
        pozivIme.textContent = aktivna.o.ime;
        pozivGumb.textContent = aktivna.dvigalo ? "Pokliči dvigalo" : "Vstopi";
        poziv.style.setProperty("--b", aktivna.o.barva);
        poziv.classList.add("on");
        odpiranjeVrat = aktivna.dvigalo ? 1 : 0;
      } else { poziv.classList.remove("on"); zapriVse(); odpiranjeVrat = 0; }
    }

    trakTex.offset.x = (t * 0.02) % 1;
    vrataOdprta += (odpiranjeVrat - vrataOdprta) * Math.min(1, dt * 3.5);
    vrata[0].position.x = -0.8 - vrataOdprta * 1.5; vrata[1].position.x = 0.8 + vrataOdprta * 1.5;
    komp.render(dt);
  }

  function velikost() {
    const w = ovoj.clientWidth, h = ovoj.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    komp.setPixelRatio(renderer.getPixelRatio()); komp.setSize(w, h);
    sij.resolution.set(w / 2, h / 2);
    kamera.aspect = w / h;
    kamera.fov = w < h ? 68 : 56;
    kamera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(velikost); ro.observe(ovoj); velikost();
  const vidnost = () => {
    if (document.hidden && tek) { cancelAnimationFrame(raf); tek = false; }
    else if (!document.hidden && !tek) { tek = true; ura.getDelta(); korak(); }
  };
  document.addEventListener("visibilitychange", vidnost);
  korak();

  return {
    ustavi() {
      cancelAnimationFrame(raf);
      clearTimeout(skrijPomoc);
      ro.disconnect();
      removeEventListener("keydown", naTipko);
      removeEventListener("keyup", spustiTipko);
      removeEventListener("blur", izgubaFokusa);
      document.removeEventListener("visibilitychange", vidnost);
      scena.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
      });
      scena.environment?.dispose(); nebo.dispose();
      kocka.dispose(); ao?.dispose(); komp.dispose(); cilj4.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function kavc(scena, skatla, mat, x, z, ry, ovira) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scena.add(g);
  const usnje = mat(0x6b4a36, { roughness: 0.55 });
  skatla(2.4, 0.42, 0.9, usnje, 0, 0.3, 0, true, g);
  skatla(2.4, 0.5, 0.22, usnje, 0, 0.72, 0.36, true, g);
  for (const sx of [-1.25, 1.25]) skatla(0.18, 0.62, 0.9, usnje, sx, 0.4, 0, true, g);
  for (const sx of [-1.1, 1.1]) for (const sz of [-0.35, 0.35]) skatla(0.05, 0.1, 0.05, mat(0x1a1a1a), sx, 0.05, sz, false, g);
  ovira(x, z, Math.abs(Math.sin(ry)) > 0.5 ? 0.9 : 2.6, Math.abs(Math.sin(ry)) > 0.5 ? 2.6 : 0.9);
}

function rastlina(scena, mat, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); scena.add(g);
  const lonec = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.27, 0.62, 28), mat(0x2b2c30, { roughness: 0.4 }));
  lonec.position.y = 0.31; lonec.castShadow = true; g.add(lonec);
  const listi = mat(0x3f6b3a, { roughness: 0.7, side: THREE.DoubleSide });
  const r = nakljucje(Math.round(x * 31 + z * 17 + 99));
  for (let i = 0; i < 16; i++) {
    const list = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), listi);
    list.scale.set(0.45, 1.2, 0.12);
    const kot = r() * Math.PI * 2, v = 0.9 + r() * 0.9;
    list.position.set(Math.cos(kot) * (0.12 + r() * 0.25), v, Math.sin(kot) * (0.12 + r() * 0.25));
    list.rotation.set((r() - 0.5) * 1.2, kot, (r() - 0.5) * 1.2);
    list.castShadow = true; g.add(list);
  }
  const steblo = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.2, 8), mat(0x4a3a28)); steblo.position.y = 1.1; g.add(steblo);
}

function drevo(scena, mat, x, z) {
  const deblo = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3, 10), mat(0x5a4632)); deblo.position.set(x, 1.5, z); scena.add(deblo);
  const krosnja = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), mat(0x557a45, { roughness: 0.9 })); krosnja.scale.y = 1.2; krosnja.position.set(x, 4, z); krosnja.castShadow = true; scena.add(krosnja);
}

// Rekviziti na pultih: zasloni, roboti, mape, kovanci, sef, strežnik, graf.
function rekvizit(vrsta, barva, mat, svetilo, jeklo) {
  const g = new THREE.Group();
  const crno = mat(0x17181d, { roughness: 0.35, metalness: 0.4 });
  const zaslon = () => mat(0x0e1420, { roughness: 0.2, emissive: new THREE.Color(0x1d3557), emissiveIntensity: 0.8 });
  const dodaj = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); k.castShadow = true; g.add(k); return k; };
  if (vrsta === "miza") {
    for (const [x, ry] of [[-0.95, 0.22], [0, 0], [0.95, -0.22]]) {
      dodaj(new THREE.BoxGeometry(0.88, 0.52, 0.04), crno, x, 1.5, 0.85, 0, ry);
      dodaj(new THREE.PlaneGeometry(0.84, 0.48), zaslon(), x + Math.sin(ry) * 0.022, 1.5, 0.85 + Math.cos(ry) * 0.022, 0, ry);
      dodaj(new THREE.BoxGeometry(0.05, 0.22, 0.05), jeklo, x, 1.15, 0.82);
    }
    dodaj(new THREE.BoxGeometry(0.9, 0.025, 0.3), crno, 0, 1.06, 1.3);
  } else if (vrsta === "algo") {
    for (const x of [-0.8, 0.8]) {
      dodaj(new THREE.BoxGeometry(0.5, 0.42, 0.42), mat(0xe9ebee, { roughness: 0.3, metalness: 0.2 }), x, 1.26, 1.0);
      dodaj(new THREE.BoxGeometry(0.62, 0.48, 0.46), mat(0xe9ebee, { roughness: 0.3, metalness: 0.2 }), x, 1.73, 1.0);
      dodaj(new THREE.PlaneGeometry(0.46, 0.18), crno, x, 1.76, 1.235);
      for (const ox of [-0.11, 0.11]) dodaj(new THREE.CircleGeometry(0.04, 16), svetilo(barva, 1.6), x + ox, 1.76, 1.237);
    }
  } else if (vrsta === "analitika") {
    dodaj(new THREE.BoxGeometry(1.9, 1.1, 0.05), crno, 0, 1.75, 0.8);
    [0.25, 0.45, 0.35, 0.65, 0.55, 0.85].forEach((v, i) => dodaj(new THREE.PlaneGeometry(0.18, v), mat(0x000000, { emissive: new THREE.Color(i === 5 ? 0x4ade80 : barva), emissiveIntensity: 0.9 }), -0.65 + i * 0.26, 1.27 + v / 2, 0.83));
  } else if (vrsta === "papir") {
    for (let i = 0; i < 7; i++) dodaj(new THREE.BoxGeometry(0.16, 0.56 - (i % 3) * 0.07, 0.42), mat([0x2f3b5c, 0xe8e2d4, 0x7a2e3a][i % 3], { roughness: 0.8 }), -0.9 + i * 0.22, 1.33 - (i % 3) * 0.035, 1.0, 0, 0, i === 6 ? 0.28 : 0);
    dodaj(new THREE.BoxGeometry(0.42, 0.012, 0.3), mat(0xfafafa), 0.9, 1.06, 1.15, 0, 0.2);
  } else if (vrsta === "blagajna") {
    const zlato = mat(0xd9b25c, { metalness: 1, roughness: 0.25 });
    [5, 8, 3, 6].forEach((n, i) => { for (let j = 0; j < n; j++) dodaj(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 28), zlato, -0.9 + i * 0.6, 1.075 + j * 0.052, 1.0); });
  } else if (vrsta === "sef") {
    dodaj(new THREE.BoxGeometry(1.4, 1.4, 0.8), mat(0x6d7178, { metalness: 0.9, roughness: 0.35 }), 0, 1.75, 0.75);
    dodaj(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 48), jeklo, 0, 1.75, 1.18, Math.PI / 2);
    for (let i = 0; i < 3; i++) dodaj(new THREE.BoxGeometry(0.8, 0.05, 0.05), jeklo, 0, 1.75, 1.25, 0, 0, (i * Math.PI) / 3);
  } else if (vrsta === "podatki") {
    for (const x of [-0.7, 0.7]) {
      dodaj(new THREE.BoxGeometry(0.78, 1.4, 0.7), crno, x, 1.75, 0.9);
      for (let j = 0; j < 6; j++) dodaj(new THREE.BoxGeometry(0.03, 0.03, 0.01), svetilo(j % 2 ? barva : 0x4ade80, 1.5), x + 0.28, 1.2 + j * 0.2, 1.255);
    }
  }
  return g;
}
