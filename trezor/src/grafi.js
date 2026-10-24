// Preprosti grafi v SVG (brez knjižnic): krivulja kapitala in stolpci z barvo za dobiček/izgubo.

const NS = "http://www.w3.org/2000/svg";
function s(tag, a = {}, ...otroci) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) if (v != null) el.setAttribute(k, v);
  otroci.flat(Infinity).forEach((o) => o != null && el.append(o instanceof Node ? o : document.createTextNode(String(o))));
  return el;
}
const kratko = (v) => {
  const a = Math.abs(v);
  const t = a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e4 ? Math.round(a / 1e3) + "k" : a >= 1e3 ? (a / 1e3).toFixed(1) + "k" : Math.round(a).toString();
  return (v < 0 ? "−" : "") + t;
};

export function krivulja(tocke, { visina = 200 } = {}) {
  const W = 640, H = visina, L = 44, R = 8, T = 10, B = 22;
  if (tocke.length < 2) return s("svg", { viewBox: `0 0 ${W} 60`, class: "graf" }, s("text", { x: W / 2, y: 34, "text-anchor": "middle", class: "g-os" }, "Premalo podatkov za graf"));
  const vals = [0, ...tocke.map((t) => t.v)];
  const min = Math.min(...vals), max = Math.max(...vals), raz = max - min || 1;
  const x = (i) => L + (i / (tocke.length - 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / raz) * (H - T - B);
  const pot = tocke.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t.v).toFixed(1)}`).join("");
  const zadnja = tocke[tocke.length - 1].v;
  const barva = zadnja >= 0 ? "plus" : "minus";
  const mreza = [min, (min + max) / 2, max].map((v) => [s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "g-mreza" }), s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "g-os" }, kratko(v))]);
  const d1 = new Date(tocke[0].t).toLocaleDateString("sl-SI"), d2 = new Date(tocke[tocke.length - 1].t).toLocaleDateString("sl-SI");
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf", role: "img", "aria-label": "Krivulja kapitala" },
    mreza,
    s("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), class: "g-nic" }),
    s("path", { d: `${pot}L${x(tocke.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, class: "g-povrsina " + barva }),
    s("path", { d: pot, class: "g-linija " + barva }),
    s("text", { x: L, y: H - 4, class: "g-os" }, d1),
    s("text", { x: W - R, y: H - 4, "text-anchor": "end", class: "g-os" }, d2));
}

// stolpci: [{ oznaka, v, opis }]
export function stolpci(podatki, { visina = 170, oznakeVsakih = 1 } = {}) {
  const W = 640, H = visina, L = 44, R = 6, T = 10, B = 22;
  if (!podatki.length) return s("svg", { viewBox: `0 0 ${W} 60`, class: "graf" }, s("text", { x: W / 2, y: 34, "text-anchor": "middle", class: "g-os" }, "Ni podatkov"));
  const vals = [0, ...podatki.map((p) => p.v)];
  const min = Math.min(...vals), max = Math.max(...vals), raz = max - min || 1;
  const y = (v) => T + (1 - (v - min) / raz) * (H - T - B);
  const sir = (W - L - R) / podatki.length;
  const st = Math.max(1, Math.min(sir * 0.72, 46));
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf", role: "img" },
    [min, max].filter((v, i, a) => a.indexOf(v) === i).map((v) => [s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "g-mreza" }), s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "g-os" }, kratko(v))]),
    s("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), class: "g-nic" }),
    podatki.map((p, i) => {
      const cx = L + sir * i + sir / 2;
      return s("g", {},
        s("rect", { x: cx - st / 2, y: Math.min(y(p.v), y(0)), width: st, height: Math.max(1, Math.abs(y(p.v) - y(0))), rx: Math.min(3, st / 3), class: p.v >= 0 ? "g-plus" : "g-minus" },
          s("title", {}, p.opis || `${p.oznaka}: ${p.v}`)),
        i % oznakeVsakih === 0 ? s("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "g-os" }, p.oznaka) : null);
    }));
}

// Toplotna karta dan v tednu × ura: celice [7][24] z { n, p }.
export function toplota(celice, dnevi) {
  const ure = [];
  for (let u = 0; u < 24; u++) if (celice.some((d) => d[u].n)) ure.push(u);
  if (!ure.length) return s("svg", { viewBox: "0 0 640 60", class: "graf" }, s("text", { x: 320, y: 34, "text-anchor": "middle", class: "g-os" }, "Ni podatkov"));
  const L = 34, T = 4, B = 20, W = 640, cw = (W - L - 4) / ure.length, ch = 24, H = T + 7 * ch + B;
  const max = Math.max(...celice.flat().map((c) => Math.abs(c.p)), 1);
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf", role: "img", "aria-label": "Toplotna karta" },
    dnevi.map((ime, d) => [
      s("text", { x: L - 6, y: T + d * ch + ch / 2 + 4, "text-anchor": "end", class: "g-os" }, ime),
      ure.map((u, i) => {
        const c = celice[d][u];
        const moc = c.n ? 0.18 + 0.82 * Math.sqrt(Math.abs(c.p) / max) : 0;
        return s("rect", { x: L + i * cw + 1, y: T + d * ch + 1, width: cw - 2, height: ch - 2, rx: 4, class: c.n ? (c.p >= 0 ? "g-plus" : "g-minus") : "g-prazno", "fill-opacity": c.n ? moc.toFixed(2) : null },
          s("title", {}, `${ime} ${u}:00 · ${c.n} trejdov · ${Math.round(c.p * 100) / 100}`));
      }),
    ]),
    ure.map((u, i) => (ure.length <= 14 || i % 2 === 0 ? s("text", { x: L + i * cw + cw / 2, y: H - 5, "text-anchor": "middle", class: "g-os" }, String(u)) : null)));
}

const meje = (vals) => { const min = Math.min(0, ...vals), max = Math.max(0, ...vals); return { min, max, raz: max - min || 1 }; };

// Več krivulj na enem grafu. serije: [{ ime, cls, tocke: [{ t, v }] }], vse z istimi ali različnimi časi.
export function vecKrivulj(serije, { visina = 220, enota = "" } = {}) {
  const W = 640, H = visina, L = 46, R = 8, T = 10, B = 22;
  const vse = serije.flatMap((x) => x.tocke);
  if (vse.length < 2) return s("svg", { viewBox: `0 0 ${W} 60`, class: "graf" }, s("text", { x: W / 2, y: 34, "text-anchor": "middle", class: "g-os" }, "Premalo podatkov za graf"));
  const casi = vse.map((p) => new Date(p.t).getTime());
  const t0 = Math.min(...casi), t1 = Math.max(...casi), traj = t1 - t0 || 1;
  const { min, max, raz } = meje(vse.map((p) => p.v));
  const x = (t) => L + ((new Date(t).getTime() - t0) / traj) * (W - L - R);
  const y = (v) => T + (1 - (v - min) / raz) * (H - T - B);
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf", role: "img" },
    [min, (min + max) / 2, max].map((v) => [s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "g-mreza" }), s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "g-os" }, kratko(v) + enota)]),
    s("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), class: "g-nic" }),
    serije.map((sr) => sr.tocke.length ? s("path", { d: sr.tocke.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(""), class: "g-serija " + sr.cls }) : null),
    s("text", { x: L, y: H - 4, class: "g-os" }, new Date(t0).toLocaleDateString("sl-SI")),
    s("text", { x: W - R, y: H - 4, "text-anchor": "end", class: "g-os" }, new Date(t1).toLocaleDateString("sl-SI")));
}

// Naloženi stolpci: oznake [..], serije [{ ime, cls, v: [..] }]; pozitivni gredo navzgor, negativni navzdol.
export function nalozeniStolpci(oznake, serije, { visina = 190, oznakeVsakih = 1 } = {}) {
  const W = 640, H = visina, L = 46, R = 6, T = 10, B = 22;
  if (!oznake.length) return s("svg", { viewBox: `0 0 ${W} 60`, class: "graf" }, s("text", { x: W / 2, y: 34, "text-anchor": "middle", class: "g-os" }, "Ni podatkov"));
  const gor = oznake.map((_, i) => serije.reduce((a, sr) => a + Math.max(0, sr.v[i] || 0), 0));
  const dol = oznake.map((_, i) => serije.reduce((a, sr) => a + Math.min(0, sr.v[i] || 0), 0));
  const { min, max, raz } = meje([...gor, ...dol]);
  const y = (v) => T + (1 - (v - min) / raz) * (H - T - B);
  const sir = (W - L - R) / oznake.length, st = Math.max(2, Math.min(sir * 0.7, 40));
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf", role: "img" },
    [min, max].filter((v, i, a) => a.indexOf(v) === i).map((v) => [s("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "g-mreza" }), s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "g-os" }, kratko(v))]),
    oznake.map((o, i) => {
      const cx = L + sir * i + sir / 2;
      let p = 0, n = 0;
      return s("g", {}, serije.map((sr) => {
        const v = sr.v[i] || 0;
        if (!v) return null;
        const od = v > 0 ? p : n, do_ = od + v;
        if (v > 0) p = do_; else n = do_;
        return s("rect", { x: cx - st / 2, y: Math.min(y(od), y(do_)), width: st, height: Math.max(1, Math.abs(y(do_) - y(od))), class: "g-s " + sr.cls }, s("title", {}, `${o} · ${sr.ime}: ${Math.round(v * 100) / 100}`));
      }), i % oznakeVsakih === 0 ? s("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "g-os" }, o) : null);
    }),
    s("line", { x1: L, x2: W - R, y1: y(0), y2: y(0), class: "g-nic" }));
}

// Krof: deli [{ ime, cls, v }] (samo pozitivne vrednosti).
export function krof(deli, napis = "") {
  const vsota = deli.reduce((a, d) => a + Math.max(0, d.v), 0);
  const r = 70, C = 2 * Math.PI * r;
  let od = 0;
  return s("svg", { viewBox: "0 0 200 200", class: "graf krof", role: "img" },
    s("circle", { cx: 100, cy: 100, r, class: "g-krog" }),
    vsota ? deli.filter((d) => d.v > 0).map((d) => {
      const dol = (d.v / vsota) * C;
      const el = s("circle", { cx: 100, cy: 100, r, class: "g-del " + d.cls, "stroke-dasharray": `${dol} ${C - dol}`, "stroke-dashoffset": -od, transform: "rotate(-90 100 100)" }, s("title", {}, `${d.ime}: ${Math.round((d.v / vsota) * 100)} %`));
      od += dol;
      return el;
    }) : null,
    s("text", { x: 100, y: 106, "text-anchor": "middle", class: "g-krof-napis" }, napis));
}

// Koledar zadnjih tednov: dnevi = Map("YYYY-MM-DD" → p). Vrstice so tedni, stolpci Pon–Ned.
export function koledar(dnevi, { tednov = 12, oznakeDni = ["P", "T", "S", "Č", "P", "S", "N"] } = {}) {
  const W = 640, L = 8, T = 18, cel = (W - L * 2) / 7, vis = 34, H = T + tednov * vis + 4;
  const danes = new Date(); danes.setHours(12, 0, 0, 0);
  const zacetek = new Date(danes); zacetek.setDate(danes.getDate() - ((danes.getDay() + 6) % 7) - (tednov - 1) * 7);
  const max = Math.max(1, ...[...dnevi.values()].map((v) => Math.abs(v)));
  const kl = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const celice = [];
  for (let w = 0; w < tednov; w++) for (let d = 0; d < 7; d++) {
    const dt = new Date(zacetek); dt.setDate(zacetek.getDate() + w * 7 + d);
    if (dt > danes) continue;
    const k = kl(dt), v = dnevi.get(k);
    const x = L + d * cel, yy = T + w * vis;
    celice.push(s("g", {},
      s("rect", { x: x + 2, y: yy + 2, width: cel - 4, height: vis - 4, rx: 6, class: v == null ? "g-prazno" : v >= 0 ? "g-plus" : "g-minus", "fill-opacity": v == null ? null : (0.2 + 0.8 * Math.sqrt(Math.abs(v) / max)).toFixed(2) }, s("title", {}, `${dt.toLocaleDateString("sl-SI")}${v == null ? "" : ": " + Math.round(v * 100) / 100}`)),
      s("text", { x: x + 8, y: yy + 14, class: "g-dan" }, String(dt.getDate())),
      v != null ? s("text", { x: x + cel - 7, y: yy + vis - 9, "text-anchor": "end", class: "g-znesek" }, kratko(v)) : null));
  }
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "graf", role: "img", "aria-label": "Koledar" },
    oznakeDni.map((o, d) => s("text", { x: L + d * cel + cel / 2, y: 12, "text-anchor": "middle", class: "g-os" }, o)), celice);
}

// ---- Vizualni gradniki za kartice ----

// Obroč z deležem (0–1) in napisom v sredini.
export function obroc(delez, napis, cls = "plus") {
  const r = 46, C = 2 * Math.PI * r, d = Math.max(0, Math.min(1, delez || 0));
  return s("svg", { viewBox: "0 0 120 120", class: "obroc" },
    s("circle", { cx: 60, cy: 60, r, class: "o-ozadje" }),
    s("circle", { cx: 60, cy: 60, r, class: "o-del " + cls, "stroke-dasharray": `${d * C} ${C}`, transform: "rotate(-90 60 60)" }),
    s("text", { x: 60, y: 68, "text-anchor": "middle", class: "o-napis" }, napis));
}

// Polkrožni merilnik od 0 do max, z mejo »dobro« (npr. PF 1).
export function merilnik(v, max, napis, meja = 1) {
  const r = 52, cx = 65, cy = 64, del = Math.max(0, Math.min(1, (Number.isFinite(v) ? v : max) / max));
  const tocka = (f) => [cx - r * Math.cos(Math.PI * f), cy - r * Math.sin(Math.PI * f)];
  const lok = (a, b) => { const [x1, y1] = tocka(a), [x2, y2] = tocka(b); return `M${x1.toFixed(1)},${y1.toFixed(1)}A${r},${r} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`; };
  const [nx, ny] = tocka(del);
  return s("svg", { viewBox: "0 0 130 82", class: "merilnik" },
    s("path", { d: lok(0, 1), class: "m-ozadje" }),
    del > 0 ? s("path", { d: lok(0, del), class: "m-del " + (v >= meja ? "plus" : "minus") }) : null,
    s("circle", { cx: nx, cy: ny, r: 5.5, class: "m-kazalec" }),
    s("text", { x: cx, y: cy + 2, "text-anchor": "middle", class: "o-napis" }, napis));
}

// Iskrica: majhna krivulja s površino (brez osi).
export function iskrica(tocke, cls = "plus") {
  const W = 300, H = 70;
  if (tocke.length < 2) return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "iskrica" });
  const vals = tocke.map((t) => t.v), min = Math.min(0, ...vals), max = Math.max(0, ...vals), raz = max - min || 1;
  const x = (i) => (i / (tocke.length - 1)) * W, y = (v) => 4 + (1 - (v - min) / raz) * (H - 8);
  const pot = tocke.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t.v).toFixed(1)}`).join("");
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "iskrica", preserveAspectRatio: "none" },
    s("path", { d: `${pot}L${W},${y(0)}L0,${y(0)}Z`, class: "g-povrsina " + cls }),
    s("path", { d: pot, class: "g-linija " + cls, "vector-effect": "non-scaling-stroke" }));
}

// Trak zadnjih trejdov: stolpček navzgor (dobitek) ali navzdol (izguba).
export function trak(rezultati) {
  const W = 300, H = 60, n = rezultati.length || 1, sir = W / n, max = Math.max(1, ...rezultati.map((p) => Math.abs(p)));
  return s("svg", { viewBox: `0 0 ${W} ${H}`, class: "iskrica", preserveAspectRatio: "none" },
    s("line", { x1: 0, x2: W, y1: H / 2, y2: H / 2, class: "g-nic" }),
    rezultati.map((p, i) => { const h = Math.max(2, (Math.abs(p) / max) * (H / 2 - 2)); return s("rect", { x: i * sir + sir * 0.15, y: p >= 0 ? H / 2 - h : H / 2, width: sir * 0.7, height: h, rx: 1.5, class: p >= 0 ? "g-plus" : "g-minus" }); }));
}
