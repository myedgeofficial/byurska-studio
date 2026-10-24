// Preprosti grafi v SVG (brez knjižnic): krivulja kapitala in stolpci z barvo za dobiček/izgubo.

const NS = "http://www.w3.org/2000/svg";
function s(tag, a = {}, ...otroci) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) if (v != null) el.setAttribute(k, v);
  otroci.flat().forEach((o) => o != null && el.append(o instanceof Node ? o : document.createTextNode(String(o))));
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
