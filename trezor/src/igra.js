// REMAKO banka kot 3D igra: figurica v lobiju, pogled izza lika, oddelki ob stenah, dvigalo v nadstropja.
// Vse je narisano s kodo (three.js + platno za napise), brez zunanjih datotek, zato deluje s strogim CSP.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const SIRINA = 17, GLOBINA = 15; // pol širine in pol globine lobija (m)
const PISAVA = '"Inter Tight", system-ui, sans-serif';

// Napis na platnu → tekstura.
function platno(w, h, risi) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  risi(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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

// Tabla oddelka: ime, velika številka in podnapis.
function tablaOddelka(o) {
  return platno(768, 440, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, "rgba(22,18,40,.96)"); gr.addColorStop(1, "rgba(10,8,20,.96)");
    zaobljen(g, 6, 6, w - 12, h - 12, 36); g.fillStyle = gr; g.fill();
    g.lineWidth = 6; g.strokeStyle = o.barva; g.stroke();
    g.fillStyle = o.barva; g.fillRect(48, 64, 10, 54);
    g.fillStyle = "#f6f3ff"; prilagodi(g, o.ime, w - 140, 56); g.textBaseline = "middle"; g.fillText(o.ime, 76, 92);
    if (o.oznaka) { g.font = `700 30px ${PISAVA}`; g.fillStyle = "#fbbf24"; g.textAlign = "right"; g.fillText(o.oznaka, w - 48, 92); g.textAlign = "left"; }
    g.fillStyle = o.barvaGlavno || "#ffffff"; prilagodi(g, o.glavno, w - 96, 110, 850); g.fillText(o.glavno, 48, 236);
    g.fillStyle = "#c9c1de"; prilagodi(g, o.pod, w - 96, 36, 600); g.fillText(o.pod, 48, 340);
    if (o.napredek != null) {
      zaobljen(g, 48, 384, w - 96, 14, 7); g.fillStyle = "rgba(255,255,255,.1)"; g.fill();
      zaobljen(g, 48, 384, Math.max(14, (w - 96) * o.napredek), 14, 7); g.fillStyle = o.barva; g.fill();
    }
  });
}

function oznakaImena(ime, barva) {
  const t = platno(256, 80, (g, w, h) => {
    zaobljen(g, 4, 8, w - 8, h - 16, 30); g.fillStyle = "rgba(8,6,16,.78)"; g.fill();
    g.lineWidth = 4; g.strokeStyle = barva; g.stroke();
    g.fillStyle = "#fff"; g.font = `800 38px ${PISAVA}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ime, w / 2, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(1.3, 0.4, 1); s.renderOrder = 10;
  return s;
}

// Figurica: trup, glava z vizirjem, roke in noge na zglobih (za hojo).
function figurica(barva, ime) {
  const g = new THREE.Group();
  const telo = new THREE.MeshStandardMaterial({ color: barva, roughness: 0.35, metalness: 0.25 });
  const temno = new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.5, metalness: 0.4 });
  const sij = new THREE.MeshStandardMaterial({ color: 0x0b0a12, emissive: new THREE.Color(barva).multiplyScalar(0.9), roughness: 0.2 });
  const trup = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 6, 14), telo); trup.position.y = 1.05; g.add(trup);
  const pas = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.07, 20), sij); pas.position.y = 0.86; g.add(pas);
  const glava = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 18), telo); glava.position.y = 1.72; g.add(glava);
  const vizir = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.24, 4, 10), sij); vizir.rotation.z = Math.PI / 2; vizir.position.set(0, 1.74, -0.2); g.add(vizir);
  const ud = (x, y, dol, debel, mat) => {
    const zglob = new THREE.Group(); zglob.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(debel, dol, 4, 10), mat); m.position.y = -dol / 2 - debel; zglob.add(m);
    g.add(zglob); return zglob;
  };
  const roka = [ud(-0.42, 1.36, 0.42, 0.09, telo), ud(0.42, 1.36, 0.42, 0.09, telo)];
  const noga = [ud(-0.15, 0.78, 0.48, 0.11, temno), ud(0.15, 0.78, 0.48, 0.11, temno)];
  const senca = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  senca.rotation.x = -Math.PI / 2; senca.position.y = 0.012; g.add(senca);
  const ozn = oznakaImena(ime, "#" + new THREE.Color(barva).getHexString()); ozn.position.y = 2.25; g.add(ozn);
  let faza = 0;
  g.userData.animiraj = (dt, hitrost) => {
    const k = Math.min(1, hitrost / 4);
    faza += dt * (5 + hitrost * 1.6);
    const zamah = Math.sin(faza) * 0.75 * k;
    noga[0].rotation.x = zamah; noga[1].rotation.x = -zamah;
    roka[0].rotation.x = -zamah * 0.8; roka[1].rotation.x = zamah * 0.8;
    const dih = Math.sin(performance.now() / 600) * 0.012;
    trup.position.y = 1.05 + Math.abs(Math.sin(faza)) * 0.05 * k + dih;
    glava.position.y = 1.72 + Math.abs(Math.sin(faza)) * 0.05 * k + dih;
    vizir.position.y = glava.position.y + 0.02;
  };
  return g;
}

export function zazeni(ovoj, { igralec, partner, nivo, oddelki, nadstropja, trak, klasicno }) {
  const naDotik = matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, naDotik ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "igra-platno";
  ovoj.append(renderer.domElement);
  ovoj.classList.toggle("dotik", naDotik);
  let razmerje = renderer.getPixelRatio();

  const scena = new THREE.Scene();
  scena.background = new THREE.Color(0x07060d);
  scena.fog = new THREE.Fog(0x07060d, 26, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const kamera = new THREE.PerspectiveCamera(58, 1, 0.1, 120);

  scena.add(new THREE.HemisphereLight(0xb9a7ff, 0x120c1e, 0.55));
  const sonce = new THREE.DirectionalLight(0xfff1e6, 1.1);
  sonce.position.set(6, 14, 8); sonce.castShadow = true;
  sonce.shadow.mapSize.set(naDotik ? 512 : 1024, naDotik ? 512 : 1024);
  Object.assign(sonce.shadow.camera, { left: -SIRINA, right: SIRINA, top: GLOBINA, bottom: -GLOBINA, near: 1, far: 40 });
  scena.add(sonce);

  const ovire = []; // pravokotniki {x1,x2,z1,z2}
  const ovira = (x, z, sx, sz) => ovire.push({ x1: x - sx / 2, x2: x + sx / 2, z1: z - sz / 2, z2: z + sz / 2 });
  const mat = (barva, o = {}) => new THREE.MeshStandardMaterial({ color: barva, roughness: 0.5, metalness: 0.2, ...o });
  const neon = (barva, moc = 2.2) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(barva), emissiveIntensity: moc });
  const skatla = (sx, sy, sz, m, x, y, z, senca = true) => {
    const k = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    k.position.set(x, y, z); k.castShadow = senca; k.receiveShadow = true; scena.add(k); return k;
  };

  // Tla: temen sijoč kamen s ploščicami.
  const ploscice = platno(512, 512, (g, w) => {
    g.fillStyle = "#16121f"; g.fillRect(0, 0, w, w);
    g.strokeStyle = "rgba(167,139,250,.16)"; g.lineWidth = 3; g.strokeRect(0, 0, w, w);
    g.strokeStyle = "rgba(255,255,255,.04)"; g.lineWidth = 1; g.strokeRect(w / 4, w / 4, w / 2, w / 2);
  });
  ploscice.wrapS = ploscice.wrapT = THREE.RepeatWrapping; ploscice.repeat.set(SIRINA / 2, GLOBINA / 2);
  const tla = new THREE.Mesh(new THREE.PlaneGeometry(SIRINA * 2, GLOBINA * 2), mat(0xffffff, { map: ploscice, roughness: 0.18, metalness: 0.55 }));
  tla.rotation.x = -Math.PI / 2; tla.receiveShadow = true; scena.add(tla);
  // Svetleča preproga od vhoda do sredine.
  const preproga = new THREE.Mesh(new THREE.PlaneGeometry(3, GLOBINA - 3), mat(0x1c1330, { roughness: 0.55, metalness: 0.1 }));
  preproga.rotation.x = -Math.PI / 2; preproga.position.set(0, 0.006, GLOBINA / 2 + 1.5); preproga.receiveShadow = true; scena.add(preproga);
  for (const x of [-1.55, 1.55]) skatla(0.06, 0.02, GLOBINA - 3, neon(0xa78bfa, 1.6), x, 0.012, GLOBINA / 2 + 1.5, false);

  // Stene, strop in neonski robovi.
  const VISINA = 7.5;
  const stena = mat(0x100d19, { roughness: 0.7, metalness: 0.3 });
  skatla(SIRINA * 2, VISINA, 0.4, stena, 0, VISINA / 2, -GLOBINA - 0.2, false);
  skatla(0.4, VISINA, GLOBINA * 2, stena, -SIRINA - 0.2, VISINA / 2, 0, false);
  skatla(0.4, VISINA, GLOBINA * 2, stena, SIRINA + 0.2, VISINA / 2, 0, false);
  const strop = new THREE.Mesh(new THREE.PlaneGeometry(SIRINA * 2, GLOBINA * 2), mat(0x0c0a14, { roughness: 0.9 }));
  strop.rotation.x = Math.PI / 2; strop.position.y = VISINA; scena.add(strop);
  for (const [x, z, sx, sz] of [[0, -GLOBINA + 0.02, SIRINA * 2, 0.06], [-SIRINA + 0.02, 0, 0.06, GLOBINA * 2], [SIRINA - 0.02, 0, 0.06, GLOBINA * 2]]) {
    skatla(sx, 0.06, sz, neon(0xf472b6, 1.4), x, 0.05, z, false);
    skatla(sx, 0.08, sz, neon(0xa78bfa, 2), x, VISINA - 0.3, z, false);
  }
  // Steklena sprednja stena z vrati, za njo mesto ponoči.
  const steklo = new THREE.MeshPhysicalMaterial({ color: 0x8f7cff, metalness: 0, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.12 });
  for (const x of [-SIRINA / 2 - 1.2, SIRINA / 2 + 1.2]) skatla(SIRINA - 2.4, VISINA, 0.08, steklo, x, VISINA / 2, GLOBINA, false);
  skatla(SIRINA * 2, 0.12, 0.14, neon(0xa78bfa, 2), 0, VISINA - 0.06, GLOBINA, false);
  for (const x of [-2.4, 2.4]) skatla(0.14, VISINA, 0.14, mat(0x2a2340, { metalness: 0.8, roughness: 0.25 }), x, VISINA / 2, GLOBINA, false);
  ovira(-SIRINA / 2 - 1.2, GLOBINA, SIRINA - 2.4, 0.4); ovira(SIRINA / 2 + 1.2, GLOBINA, SIRINA - 2.4, 0.4);
  ovira(0, GLOBINA + 0.6, 6, 0.4); // vrata so odprta, a ven ne moreš
  const mesto = new THREE.Group();
  for (let i = 0; i < 46; i++) {
    const v = 4 + ((i * 37) % 23), s = 1.6 + ((i * 13) % 5) * 0.5;
    const st = new THREE.Mesh(new THREE.BoxGeometry(s, v, s), mat(0x0d0b16, { roughness: 0.9 }));
    st.position.set(-38 + i * 1.7, v / 2, GLOBINA + 14 + ((i * 29) % 11)); mesto.add(st);
    if (i % 3 === 0) { const l = new THREE.Mesh(new THREE.BoxGeometry(s * 0.9, 0.1, 0.02), neon(i % 2 ? 0xf472b6 : 0xa78bfa, 1.2)); l.position.set(st.position.x, v * 0.7, st.position.z - s / 2 - 0.02); mesto.add(l); }
  }
  scena.add(mesto);

  // Steklene kolone z neonom.
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) {
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, VISINA, 24), mat(0x1c1730, { metalness: 0.7, roughness: 0.2 }));
    st.position.set(x, VISINA / 2, z); st.castShadow = true; scena.add(st);
    for (const y of [0.6, VISINA - 0.6]) { const o = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 8, 32), neon(0xf472b6, 2)); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); scena.add(o); }
    ovira(x, z, 1, 1);
  }

  // Sredina: recepcija in hologram nivoja REMAKO.
  const holo = new THREE.Group(); holo.position.set(0, 0, -1); scena.add(holo);
  const podstavek = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 1, 48), mat(0x1a1528, { metalness: 0.75, roughness: 0.18 }));
  podstavek.position.y = 0.5; podstavek.castShadow = true; podstavek.receiveShadow = true; holo.add(podstavek);
  const rob = new THREE.Mesh(new THREE.TorusGeometry(2.12, 0.04, 8, 64), neon(0xa78bfa, 2.6)); rob.rotation.x = Math.PI / 2; rob.position.y = 1.0; holo.add(rob);
  const xp = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.42, 64, 1, Math.PI / 2, -Math.PI * 2 * Math.max(0.02, nivo.napredek)), neon(0xfbbf24, 2.4));
  xp.rotation.x = -Math.PI / 2; xp.position.y = 1.02; holo.add(xp);
  const ozadjeXp = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.42, 64), new THREE.MeshBasicMaterial({ color: 0x2a2240 }));
  ozadjeXp.rotation.x = -Math.PI / 2; ozadjeXp.position.y = 1.015; holo.add(ozadjeXp);
  const obroci = [];
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Mesh(new THREE.TorusGeometry(1.1 - i * 0.22, 0.025, 8, 64), neon([0xa78bfa, 0xf472b6, 0xfbbf24][i], 2.4));
    o.position.y = 1.9; obroci.push(o); holo.add(o);
  }
  const napisNivo = platno(512, 300, (g, w, h) => {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "#c084fc"; g.shadowBlur = 24;
    g.fillStyle = "#fff"; g.font = `900 92px ${PISAVA}`; g.fillText("REMAKO", w / 2, 90);
    g.shadowBlur = 0; g.fillStyle = "#fbbf24"; g.font = `800 58px ${PISAVA}`; g.fillText(`NIVO ${nivo.n}`, w / 2, 176);
    g.fillStyle = "#e9e3ff"; prilagodi(g, nivo.opis, w - 40, 38, 700); g.fillText(nivo.opis, w / 2, 248);
  });
  const holoTabla = new THREE.Sprite(new THREE.SpriteMaterial({ map: napisNivo, transparent: true }));
  holoTabla.scale.set(3.4, 2, 1); holoTabla.position.y = 3.9; holo.add(holoTabla);
  const zarek = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 3.4, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  zarek.position.y = 2.6; holo.add(zarek);
  ovire.push({ krog: true, x: 0, z: -1, r: 2.35 });

  // Dvigalo na sredini zadnje stene in tekoči trak trejdov nad njim.
  const dvigalo = new THREE.Group(); dvigalo.position.set(0, 0, -GLOBINA + 0.05); scena.add(dvigalo);
  const okvir = mat(0x2a2340, { metalness: 0.85, roughness: 0.2 });
  for (const x of [-1.75, 1.75]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 0.5), okvir); k.position.set(x, 2.1, 0.2); dvigalo.add(k); }
  const preklada = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.4, 0.5), okvir); preklada.position.set(0, 4.3, 0.2); dvigalo.add(preklada);
  const vrataMat = mat(0x3a3355, { metalness: 0.9, roughness: 0.15 });
  const vrata = [-0.8, 0.8].map((x) => { const v = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.1, 0.1), vrataMat); v.position.set(x, 2.05, 0.1); dvigalo.add(v); return v; });
  const notranjost = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.1), neon(0xa78bfa, 0.9)); notranjost.position.set(0, 2.05, 0.02); dvigalo.add(notranjost);
  const lucDvigala = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.04), neon(0xfbbf24, 2.4)); lucDvigala.position.set(0, 4.6, 0.46); dvigalo.add(lucDvigala);
  const napisDvigalo = platno(512, 96, (g, w, h) => {
    g.fillStyle = "#e9e3ff"; g.font = `800 52px ${PISAVA}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("DVIGALO ▲", w / 2, h / 2);
  });
  const tablaDv = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: napisDvigalo, transparent: true }));
  tablaDv.position.set(0, 4.95, 0.47); dvigalo.add(tablaDv);
  ovira(0, -GLOBINA + 0.3, 4, 0.6);

  const besedilaTraku = trak.length ? trak : [{ t: "REMAKO · trading desk · naloži prvo zgodovino trejdov", plus: true }];
  const trakTex = platno(4096, 128, (g, w, h) => {
    g.fillStyle = "#07060d"; g.fillRect(0, 0, w, h);
    g.font = `800 60px ${PISAVA}`; g.textBaseline = "middle";
    let x = 30;
    while (x < w) for (const b of besedilaTraku) {
      g.fillStyle = b.plus ? "#6ee7b7" : "#fda4af"; g.fillText(b.t, x, h / 2); x += g.measureText(b.t).width + 80;
      if (x >= w) break;
    }
  });
  trakTex.wrapS = THREE.RepeatWrapping; trakTex.repeat.set(0.5, 1);
  const trakMesh = new THREE.Mesh(new THREE.PlaneGeometry(SIRINA * 1.6, 0.7), new THREE.MeshBasicMaterial({ map: trakTex }));
  trakMesh.position.set(0, 6.1, -GLOBINA + 0.03); scena.add(trakMesh);

  // Oddelki: štirje ob levi, štirje ob desni steni. Vsak ima tablo, rekvizit in svetlečo ploščo za vstop.
  const MESTA = [
    [-1, -9], [-1, -3], [-1, 3], [-1, 9],
    [1, -9], [1, -3], [1, 3], [1, 9],
  ];
  const cone = [];
  const table = [];
  oddelki.slice(0, MESTA.length).forEach((o, i) => {
    const [stran, z] = MESTA[i];
    const x = stran * (SIRINA - 0.05);
    const skupina = new THREE.Group(); skupina.position.set(x, 0, z); skupina.rotation.y = -stran * Math.PI / 2; scena.add(skupina);
    const barva = new THREE.Color(o.barva);
    // Tabla na steni.
    const tabla = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), new THREE.MeshBasicMaterial({ map: tablaOddelka(o), transparent: true }));
    tabla.position.set(0, 3.9, 0.08); skupina.add(tabla); table.push(tabla);
    const okvirTable = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.7), neon(barva, 0.6)); okvirTable.position.set(0, 3.9, 0.06); skupina.add(okvirTable);
    // Pult.
    const pult = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.05, 1.1), mat(0x1d1830, { metalness: 0.6, roughness: 0.25 }));
    pult.position.set(0, 0.525, 1.0); pult.castShadow = true; pult.receiveShadow = true; skupina.add(pult);
    const pas = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.05, 1.12), neon(barva, 2.2)); pas.position.set(0, 1.0, 1.0); skupina.add(pas);
    skupina.add(rekvizit(o.vrsta, barva, mat, neon));
    // Ploščica za vstop.
    const plosca = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 48), new THREE.MeshBasicMaterial({ color: barva, transparent: true, opacity: 0.85 }));
    plosca.rotation.x = -Math.PI / 2; plosca.position.set(0, 0.02, 2.9); skupina.add(plosca);
    const plosca2 = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ color: barva, transparent: true, opacity: 0.12 }));
    plosca2.rotation.x = -Math.PI / 2; plosca2.position.set(0, 0.018, 2.9); skupina.add(plosca2);
    if (!naDotik) { const svetloba = new THREE.PointLight(barva, 6, 7, 2); svetloba.position.set(0, 2.6, 1.8); skupina.add(svetloba); }
    const p = new THREE.Vector3(0, 0, 2.9).applyMatrix4(skupina.updateMatrixWorld() || skupina.matrixWorld);
    cone.push({ x: p.x, z: p.z, o, plosca, plosca2 });
    ovira(x - stran * 1.0, z, 1.3, 3.6);
  });
  const conaDvigala = { x: 0, z: -GLOBINA + 2.4, dvigalo: true, o: { ime: "Dvigalo", barva: "#fbbf24" } };
  const ploscaDv = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 48), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 }));
  ploscaDv.rotation.x = -Math.PI / 2; ploscaDv.position.set(conaDvigala.x, 0.02, conaDvigala.z); scena.add(ploscaDv);
  conaDvigala.plosca = ploscaDv;
  cone.push(conaDvigala);

  // Odsev lobija v tleh in kovini: enkrat posnamemo prostor s kocko kamer.
  const kocka = new THREE.WebGLCubeRenderTarget(naDotik ? 256 : 512, { type: THREE.HalfFloatType });
  const kockaKam = new THREE.CubeCamera(0.1, 80, kocka);
  kockaKam.position.set(0, 1.6, 2);
  tla.visible = false; kockaKam.update(renderer, scena); tla.visible = true;
  tla.material.envMap = kocka.texture; tla.material.envMapIntensity = 1.4; tla.material.needsUpdate = true;

  // Igralec in partner (stoji pri svoji mizi).
  const BARVE = { Teo: 0x8b5cf6, Tim: 0xec4899 };
  const jaz = figurica(BARVE[igralec] ?? 0x8b5cf6, igralec || "Ti");
  jaz.position.set(0, 0, GLOBINA - 7.5); jaz.rotation.y = Math.PI;
  jaz.traverse((m) => m.isMesh && (m.castShadow = true));
  scena.add(jaz);
  if (location.hostname === "localhost") window.__igraJaz = jaz; // samo za preizkus
  let drugi = null;
  if (partner) {
    drugi = figurica(BARVE[partner] ?? 0xec4899, partner);
    const miza = cone.find((c) => c.o.oseba === partner);
    if (miza) { drugi.position.set(miza.x * 0.9 + (miza.x > 0 ? -0.6 : 0.6), 0, miza.z + 1.2); drugi.lookAt(miza.x * 2, 0, miza.z); }
    else drugi.position.set(4, 0, 2);
    drugi.traverse((m) => m.isMesh && (m.castShadow = true));
    scena.add(drugi);
    ovire.push({ krog: true, x: drugi.position.x, z: drugi.position.z, r: 0.5 });
  }

  // Vmesnik nad platnom.
  const div = (cls, ...otroci) => { const e = document.createElement("div"); e.className = cls; otroci.forEach((o) => o && e.append(o)); return e; };
  const gumb = (cls, besedilo, klik) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = besedilo; b.addEventListener("click", klik); return b; };
  const hud = div("igra-hud");
  const nivoEl = div("igra-nivo");
  nivoEl.innerHTML = "";
  const nB = document.createElement("b"); nB.textContent = `Nivo ${nivo.n}`;
  const nS = document.createElement("span"); nS.textContent = nivo.opis;
  const nX = div("igra-xp", div("")); nX.firstChild.style.width = Math.round(nivo.napredek * 100) + "%";
  nivoEl.append(nB, nS, nX);
  hud.append(nivoEl, gumb("igra-gumb", "Klasičen pogled", klasicno));
  const pomoc = div("igra-pomoc"); pomoc.textContent = naDotik ? "Joystick levo za hojo · povleci za pogled" : "WASD ali puščice za hojo · Shift tek · povleci z miško za pogled · E za vstop";
  const poziv = div("igra-poziv");
  const pozivIme = document.createElement("b");
  const pozivGumb = gumb("igra-vstop", "Vstopi", () => vstopi());
  poziv.append(pozivIme, pozivGumb);
  const panel = div("igra-dvigalo");
  const zatemni = div("igra-zatemni");
  const joy = div("igra-joy", div("igra-joy-g"));
  ovoj.append(hud, pomoc, poziv, panel, zatemni);
  if (naDotik) ovoj.append(joy);
  setTimeout(() => pomoc.classList.add("skrij"), 7000);

  // Vhodi: tipke, vlečenje za pogled, joystick.
  const tipke = new Set();
  let yaw = 0, pitch = 0.36, razdalja = naDotik ? 7.2 : 6.4;
  let vleka = null;
  const joyV = { x: 0, y: 0 }; let joyId = null;
  const naTipko = (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) { tipke.add(k); e.preventDefault(); }
    if ((k === "e" || k === "enter" || k === " ") && aktivna) { e.preventDefault(); vstopi(); }
    if (k === "escape") zapriPanel();
  };
  const spustiTipko = (e) => tipke.delete(e.key.toLowerCase());
  const izgubaFokusa = () => tipke.clear();
  const platnoEl = renderer.domElement;
  const dol = (e) => { if (vleka == null) { vleka = { id: e.pointerId, x: e.clientX, y: e.clientY }; platnoEl.setPointerCapture(e.pointerId); } };
  const premik = (e) => {
    if (!vleka || vleka.id !== e.pointerId) return;
    yaw -= (e.clientX - vleka.x) * 0.006; pitch = Math.max(0.12, Math.min(1.05, pitch + (e.clientY - vleka.y) * 0.004));
    vleka.x = e.clientX; vleka.y = e.clientY;
  };
  const gor = (e) => { if (vleka && vleka.id === e.pointerId) vleka = null; };
  const kolo = (e) => { e.preventDefault(); razdalja = Math.max(3.5, Math.min(11, razdalja + e.deltaY * 0.005)); };
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

  // Vstop v oddelek ali dvigalo.
  let aktivna = null, odhod = false;
  function vstopi() {
    if (!aktivna || odhod) return;
    if (aktivna.dvigalo) return odpriPanel();
    odidi(aktivna.o.klik);
  }
  function odidi(klik) {
    odhod = true;
    zatemni.classList.add("on");
    setTimeout(() => klik(), 380);
  }
  function odpriPanel() {
    panel.replaceChildren();
    const naslov = document.createElement("h3"); naslov.textContent = "Dvigalo";
    panel.append(naslov);
    for (const n of [...nadstropja].reverse()) {
      const b = document.createElement("button"); b.type = "button";
      b.className = "igra-nad" + (n.odklenjeno ? "" : " zaklenjeno");
      const i = document.createElement("b"); i.textContent = n.ime;
      const s = document.createElement("span"); s.textContent = n.opis;
      b.append(i, s);
      if (n.odklenjeno) b.addEventListener("click", () => { zapriPanel(); odpiranjeVrat = 1; setTimeout(() => odidi(n.klik), 500); });
      else b.disabled = true;
      panel.append(b);
    }
    panel.append(gumb("igra-gumb", "Zapri", zapriPanel));
    panel.classList.add("on");
  }
  function zapriPanel() { panel.classList.remove("on"); }

  // Trki: pravokotniki in krogi, ločeno po oseh, da drsiš ob ovirah.
  const R = 0.38;
  const trk = (x, z) => {
    if (x < -SIRINA + R + 0.2 || x > SIRINA - R - 0.2 || z < -GLOBINA + R + 0.2 || z > GLOBINA - R) return true;
    for (const o of ovire) {
      if (o.krog) { if (Math.hypot(x - o.x, z - o.z) < o.r + R) return true; }
      else if (x > o.x1 - R && x < o.x2 + R && z > o.z1 - R && z < o.z2 + R) return true;
    }
    return false;
  };

  // Sij neonov (bloom) in mehki robovi.
  const cilj4 = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: naDotik ? 2 : 4 });
  const komp = new EffectComposer(renderer, cilj4);
  komp.addPass(new RenderPass(scena, kamera));
  const sij = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.82);
  komp.addPass(sij);
  komp.addPass(new OutputPass());

  const ura = new THREE.Clock();
  const cilj = new THREE.Vector3(), zelena = new THREE.Vector3();
  const meritev = { cas: 0, n: 0 };
  let hitrost = 0, odpiranjeVrat = 0, vrataOdprta = 0, tek = true, raf = 0;
  kamera.position.set(0, 4, GLOBINA - 1);

  function korak() {
    raf = requestAnimationFrame(korak);
    const dt = Math.min(0.05, ura.getDelta());
    // Če naprava ne zmore 60 sličic, malo znižamo ločljivost, da ostane gladko.
    meritev.cas += dt; meritev.n++;
    if (meritev.cas > 2) {
      const povp = meritev.cas / meritev.n;
      if (povp > 0.022 && razmerje > 1) { razmerje = Math.max(1, razmerje - 0.25); renderer.setPixelRatio(razmerje); velikost(); }
      meritev.cas = 0; meritev.n = 0;
    }
    const t = ura.elapsedTime;
    // Smer iz tipk ali joysticka, glede na kamero.
    let vx = 0, vz = 0;
    if (tipke.has("w") || tipke.has("arrowup")) vz -= 1;
    if (tipke.has("s") || tipke.has("arrowdown")) vz += 1;
    if (tipke.has("a") || tipke.has("arrowleft")) vx -= 1;
    if (tipke.has("d") || tipke.has("arrowright")) vx += 1;
    vx += joyV.x; vz += joyV.y;
    const dolzina = Math.hypot(vx, vz);
    const zelenaHitrost = odhod ? 0 : Math.min(1, dolzina) * (tipke.has("shift") || Math.hypot(joyV.x, joyV.y) > 0.92 ? 7 : 4.2);
    hitrost += (zelenaHitrost - hitrost) * Math.min(1, dt * 10);
    if (dolzina > 0.05 && !odhod) {
      const sx = vx / dolzina, sz = vz / dolzina;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const dx = sx * c + sz * s, dz = -sx * s + sz * c;
      const nx = jaz.position.x + dx * hitrost * dt, nz = jaz.position.z + dz * hitrost * dt;
      if (!trk(nx, jaz.position.z)) jaz.position.x = nx;
      if (!trk(jaz.position.x, nz)) jaz.position.z = nz;
      const kot = Math.atan2(-dx, -dz);
      let razlika = kot - jaz.rotation.y; razlika = Math.atan2(Math.sin(razlika), Math.cos(razlika));
      jaz.rotation.y += razlika * Math.min(1, dt * 12);
    }
    jaz.userData.animiraj(dt, hitrost);
    if (drugi) drugi.userData.animiraj(dt, 0);

    // Kamera za likom, ne gre skozi stene.
    cilj.set(jaz.position.x, 1.5, jaz.position.z);
    zelena.set(cilj.x + Math.sin(yaw) * Math.cos(pitch) * razdalja, cilj.y + Math.sin(pitch) * razdalja, cilj.z + Math.cos(yaw) * Math.cos(pitch) * razdalja);
    zelena.x = Math.max(-SIRINA + 0.5, Math.min(SIRINA - 0.5, zelena.x));
    zelena.z = Math.max(-GLOBINA + 0.5, Math.min(GLOBINA - 0.6, zelena.z));
    zelena.y = Math.min(VISINA - 0.4, zelena.y);
    kamera.position.lerp(zelena, Math.min(1, dt * 7));
    kamera.lookAt(cilj);

    // Najbližja cona.
    let najblizja = null, najm = 1.15;
    for (const c of cone) {
      const d = Math.hypot(jaz.position.x - c.x, jaz.position.z - c.z);
      const utrip = 0.6 + Math.sin(t * 3 + c.x) * 0.25;
      c.plosca.material.opacity = d < najm ? 1 : utrip;
      c.plosca.scale.setScalar(d < 1.15 ? 1.12 : 1);
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
      } else { poziv.classList.remove("on"); zapriPanel(); odpiranjeVrat = 0; }
    }

    // Animacije: hologram, trak, vrata dvigala.
    obroci.forEach((o, i) => { o.rotation.x = t * (0.5 + i * 0.2) + i; o.rotation.y = t * (0.7 - i * 0.15); });
    holoTabla.position.y = 3.9 + Math.sin(t * 1.4) * 0.08;
    trakTex.offset.x = (t * 0.025) % 1;
    vrataOdprta += (odpiranjeVrat - vrataOdprta) * Math.min(1, dt * 4);
    vrata[0].position.x = -0.8 - vrataOdprta * 1.45; vrata[1].position.x = 0.8 + vrataOdprta * 1.45;
    komp.render(dt);
  }

  const velikost = () => {
    const w = ovoj.clientWidth, h = ovoj.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    komp.setPixelRatio(renderer.getPixelRatio()); komp.setSize(w, h);
    sij.resolution.set(w / 2, h / 2);
    kamera.aspect = w / h;
    kamera.fov = w < h ? 70 : 58;
    kamera.updateProjectionMatrix();
  };
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
      ro.disconnect();
      removeEventListener("keydown", naTipko);
      removeEventListener("keyup", spustiTipko);
      removeEventListener("blur", izgubaFokusa);
      document.removeEventListener("visibilitychange", vidnost);
      scena.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
      });
      scena.environment?.dispose();
      kocka.dispose(); komp.dispose(); cilj4.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// Rekviziti na pultih: zasloni, roboti, mape, kovanci, sef, strežnik, graf.
function rekvizit(vrsta, barva, mat, neon) {
  const g = new THREE.Group();
  const kovina = mat(0x2a2340, { metalness: 0.85, roughness: 0.2 });
  const dodaj = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); k.castShadow = true; g.add(k); return k; };
  if (vrsta === "miza") {
    for (const [x, ry] of [[-1, 0.25], [0, 0], [1, -0.25]]) {
      dodaj(new THREE.BoxGeometry(0.9, 0.56, 0.05), kovina, x, 1.55, 0.85, 0, ry);
      dodaj(new THREE.PlaneGeometry(0.84, 0.5), neon(barva, 1.3), x + Math.sin(ry) * 0.03, 1.55, 0.88 + Math.cos(ry) * 0.0, 0, ry);
      dodaj(new THREE.BoxGeometry(0.06, 0.25, 0.06), kovina, x, 1.15, 0.8);
    }
  } else if (vrsta === "algo") {
    for (const x of [-0.8, 0.8]) {
      dodaj(new THREE.BoxGeometry(0.55, 0.45, 0.45), kovina, x, 1.3, 1.0);
      dodaj(new THREE.BoxGeometry(0.7, 0.55, 0.5), kovina, x, 1.82, 1.0);
      for (const ox of [-0.15, 0.15]) dodaj(new THREE.SphereGeometry(0.07, 12, 10), neon(barva, 3), x + ox, 1.86, 1.26);
      dodaj(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), kovina, x, 2.22, 1.0);
      dodaj(new THREE.SphereGeometry(0.06, 10, 8), neon(0xfbbf24, 3), x, 2.4, 1.0);
    }
  } else if (vrsta === "analitika") {
    [0.4, 0.7, 0.55, 1.0, 0.85, 1.3].forEach((v, i) => dodaj(new THREE.BoxGeometry(0.28, v, 0.28), neon(i % 2 ? barva : 0xa78bfa, 1.4), -1.1 + i * 0.44, 1.05 + v / 2, 1.0));
  } else if (vrsta === "papir") {
    for (let i = 0; i < 7; i++) dodaj(new THREE.BoxGeometry(0.18, 0.62 - (i % 3) * 0.08, 0.5), mat(i % 2 ? 0x8b5cf6 : 0xf5d08a, { roughness: 0.6 }), -1.1 + i * 0.3, 1.36 - (i % 3) * 0.04, 1.0, 0, 0, i === 6 ? 0.3 : 0);
  } else if (vrsta === "blagajna") {
    const zlato = mat(0xf5c451, { metalness: 1, roughness: 0.25 });
    [5, 8, 3, 6].forEach((n, i) => { for (let j = 0; j < n; j++) dodaj(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 24), zlato, -0.9 + i * 0.6, 1.08 + j * 0.065, 1.0); });
  } else if (vrsta === "sef") {
    dodaj(new THREE.BoxGeometry(1.5, 1.5, 0.8), kovina, 0, 1.8, 0.75);
    dodaj(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 40), mat(0x4a4166, { metalness: 0.95, roughness: 0.15 }), 0, 1.8, 1.2, Math.PI / 2);
    for (let i = 0; i < 3; i++) dodaj(new THREE.BoxGeometry(0.9, 0.06, 0.06), neon(barva, 2), 0, 1.8, 1.28, 0, 0, (i * Math.PI) / 3);
  } else if (vrsta === "podatki") {
    for (const x of [-0.7, 0.7]) {
      dodaj(new THREE.BoxGeometry(0.8, 1.4, 0.7), kovina, x, 1.75, 0.9);
      for (let j = 0; j < 6; j++) dodaj(new THREE.BoxGeometry(0.6, 0.03, 0.02), neon(j % 2 ? barva : 0x6ee7b7, 2), x, 1.2 + j * 0.2, 1.26);
    }
  }
  return g;
}
