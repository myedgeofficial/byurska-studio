// Ikone (črtne, 24×24), narisane v SVG brez zunanjih datotek.

const POTI = {
  kljucavnica: "M7 11V7a5 5 0 0 1 10 0v4|M5 11h14v10H5z|M12 15v2",
  odklenjeno: "M7 11V7a5 5 0 0 1 9.9-1|M5 11h14v10H5z",
  scit: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z|M9 12l2 2 4-4",
  kljuc: "M14.5 9.5a4.5 4.5 0 1 1-1.3-3.2|M13.2 6.3L21 14v3h-3v-2h-2v-2l-2.8-2.8",
  podjetje: "M4 21V5l8-2v18|M12 7l8 2v12|M4 21h16|M8 9h.01|M8 13h.01|M8 17h.01|M16 13h.01|M16 17h.01",
  banka: "M3 10l9-6 9 6|M5 10v8|M9.5 10v8|M14.5 10v8|M19 10v8|M3 21h18",
  graf: "M3 3v18h18|M7 15l4-4 3 3 6-7",
  dokument: "M14 3H6v18h12V7z|M14 3v4h4|M9 13h6|M9 17h6",
  denar: "M3 7h18v12H3z|M3 11h18|M7 15h3",
  opomba: "M5 4h14v16l-4-3H5z|M9 9h6|M9 12h4",
  vse: "M4 4h7v7H4z|M13 4h7v7h-7z|M4 13h7v7H4z|M13 13h7v7h-7z",
  nastavitve: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  isci: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z|M21 21l-4.3-4.3",
  plus: "M12 5v14|M5 12h14",
  zapri: "M6 6l12 12|M18 6L6 18",
  kopiraj: "M9 9h11v11H9z|M5 15H4V4h11v1",
  oko: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  sponka: "M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7",
  robot: "M5 8h14v11H5z|M12 4v4|M9 13h.01|M15 13h.01|M9 16h6|M2 12v3|M22 12v3",
  koledar: "M4 6h16v15H4z|M4 10h16|M8 3v4|M16 3v4",
  trend: "M3 17l6-6 4 4 8-8|M15 7h6v6",
  prenos: "M12 3v12|M7 10l5 5 5-5|M4 21h16",
  pero: "M4 20h4L19 9l-4-4L4 16z|M13 7l4 4",
};

export function ikona(ime, cls = "") {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ik " + cls);
  svg.setAttribute("aria-hidden", "true");
  for (const d of (POTI[ime] || POTI.vse).split("|")) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}
