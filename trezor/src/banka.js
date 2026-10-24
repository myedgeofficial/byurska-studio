// REMAKO kot banka: nivoji glede na profit in majhne ilustracije za oddelke (SVG, brez knjižnic).

const NS = "http://www.w3.org/2000/svg";
function s(tag, a = {}, ...otroci) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) if (v != null) el.setAttribute(k, v);
  otroci.flat(Infinity).forEach((o) => o != null && el.append(o instanceof Node ? o : document.createTextNode(String(o))));
  return el;
}

// Meje nivojev v valuti računa. Nivo 1 je začetek, vsak naslednji zahteva več profita.
export const MEJE = [0, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
export function nivo(profit) {
  let n = 1;
  for (let i = 1; i < MEJE.length; i++) if (profit >= MEJE[i]) n = i + 1;
  const od = MEJE[n - 1], doo = MEJE[n] ?? null;
  return { n, od, doo, napredek: doo == null ? 1 : Math.max(0, Math.min(1, (profit - od) / (doo - od))) };
}

// Moderna streha: svetleč napis, antena in nivo.
export function streha(ime, n) {
  return s("svg", { viewBox: "0 0 1000 150", class: "b-streha", preserveAspectRatio: "xMidYMax meet" },
    s("defs", {},
      s("linearGradient", { id: "b-neon", x1: 0, x2: 1 }, s("stop", { offset: "0", "stop-color": "#a78bfa" }), s("stop", { offset: ".55", "stop-color": "#f472b6" }), s("stop", { offset: "1", "stop-color": "#fbbf24" })),
      s("filter", { id: "b-sij", x: "-20%", y: "-50%", width: "140%", height: "200%" }, s("feGaussianBlur", { stdDeviation: 6, result: "z" }), s("feMerge", {}, s("feMergeNode", { in: "z" }), s("feMergeNode", { in: "SourceGraphic" })))),
    s("line", { x1: 820, y1: 6, x2: 820, y2: 96, class: "b-antena" }), s("circle", { cx: 820, cy: 6, r: 5, class: "b-antena-luc" }),
    s("rect", { x: 160, y: 40, width: 680, height: 64, rx: 14, class: "b-tabla" }),
    s("text", { x: 500, y: 88, "text-anchor": "middle", class: "b-ime", filter: "url(#b-sij)" }, ime),
    s("rect", { x: 60, y: 104, width: 880, height: 46, rx: 10, class: "b-krona" }),
    s("text", { x: 500, y: 134, "text-anchor": "middle", class: "b-krona-t" }, `NIVO ${n}`));
}

// Monitorji trgovalca: več nivojev, več zaslonov. Vsak kaže košček krivulje.
export function monitorji(n, plus = true) {
  const st = Math.max(1, Math.min(n, 6));
  const W = 52 * st + 8;
  return s("svg", { viewBox: `0 0 ${W} 60`, class: "b-ilu" },
    Array.from({ length: st }, (_, i) => {
      const x = 6 + i * 52, pot = Array.from({ length: 6 }, (_, j) => `${j ? "L" : "M"}${x + 6 + j * 7},${26 - ((j * 37 + i * 13) % 11) - (plus ? j * 1.6 : -j * 1.2)}`).join("");
      return s("g", {},
        s("rect", { x, y: 4, width: 46, height: 32, rx: 4, class: "b-zaslon" }),
        s("path", { d: pot, class: plus ? "b-crta plus" : "b-crta minus" }),
        s("rect", { x: x + 19, y: 36, width: 8, height: 8, class: "b-noga" }),
        s("rect", { x: x + 10, y: 44, width: 26, height: 4, rx: 2, class: "b-noga" }));
    }),
    s("rect", { x: 0, y: 50, width: W, height: 8, rx: 3, class: "b-miza" }));
}

// Kupčki kovancev za izplačila.
export function kovanci(n) {
  const st = Math.max(1, Math.min(n, 7));
  return s("svg", { viewBox: `0 0 ${st * 34 + 10} 64`, class: "b-ilu" },
    Array.from({ length: st }, (_, i) => {
      const h = 2 + ((i * 3 + 2) % 5);
      return s("g", {}, Array.from({ length: h }, (_, j) => s("ellipse", { cx: 22 + i * 34, cy: 56 - j * 7, rx: 14, ry: 5, class: "b-kovanec" })));
    }));
}

// Roboti za avtomatske strategije.
export function roboti(n) {
  const st = Math.max(1, Math.min(n, 6));
  return s("svg", { viewBox: `0 0 ${st * 46 + 6} 60`, class: "b-ilu" },
    Array.from({ length: st }, (_, i) => {
      const x = 6 + i * 46;
      return s("g", { class: n ? "" : "b-prazno" },
        s("line", { x1: x + 18, y1: 4, x2: x + 18, y2: 12, class: "b-anten" }), s("circle", { cx: x + 18, cy: 4, r: 3, class: "b-luc" }),
        s("rect", { x: x + 4, y: 12, width: 28, height: 22, rx: 6, class: "b-robot" }),
        s("circle", { cx: x + 13, cy: 23, r: 3, class: "b-oko" }), s("circle", { cx: x + 23, cy: 23, r: 3, class: "b-oko" }),
        s("rect", { x: x + 8, y: 37, width: 20, height: 18, rx: 4, class: "b-robot" }));
    }));
}

// Mape in dokumenti.
export function mape(n) {
  const st = Math.max(1, Math.min(n, 8));
  return s("svg", { viewBox: `0 0 ${st * 22 + 40} 60`, class: "b-ilu" },
    s("rect", { x: 2, y: 54, width: st * 22 + 36, height: 5, rx: 2, class: "b-miza" }),
    Array.from({ length: st }, (_, i) => s("rect", { x: 8 + i * 22, y: 12 + (i % 3) * 4, width: 18, height: 42 - (i % 3) * 4, rx: 2, class: i % 2 ? "b-mapa" : "b-mapa b-mapa2" })));
}

// Sef.
export function sef() {
  return s("svg", { viewBox: "0 0 70 60", class: "b-ilu" },
    s("rect", { x: 8, y: 4, width: 54, height: 50, rx: 6, class: "b-sef" }),
    s("circle", { cx: 35, cy: 29, r: 13, class: "b-sef-k" }),
    s("path", { d: "M35 16v26M22 29h26M26 20l18 18M44 20 26 38", class: "b-sef-r" }),
    s("rect", { x: 14, y: 54, width: 8, height: 4, class: "b-noga" }), s("rect", { x: 48, y: 54, width: 8, height: 4, class: "b-noga" }));
}

// Ploščad pred stavbo.
export function stopnice() {
  return s("svg", { viewBox: "0 0 1000 40", class: "b-stopnice", preserveAspectRatio: "none" },
    s("defs", {}, s("linearGradient", { id: "b-plo", x1: 0, x2: 0, y1: 0, y2: 1 }, s("stop", { offset: "0", "stop-color": "rgba(167,139,250,.35)" }), s("stop", { offset: "1", "stop-color": "rgba(167,139,250,0)" }))),
    s("rect", { x: 0, y: 0, width: 1000, height: 6, rx: 3, class: "b-st1" }),
    s("rect", { x: 0, y: 6, width: 1000, height: 34, fill: "url(#b-plo)" }));
}
