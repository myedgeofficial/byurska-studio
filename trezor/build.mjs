// Zgradi trezor v www/: app.js (z Firebase SDK, brez zunanjih skript), pisave in ikona.
// FB_CONFIG = JSON nastavitve spletne aplikacije Firebase (apiKey, projectId ...).
import { build } from "esbuild";
import { cpSync } from "node:fs";

const config = process.env.FB_CONFIG;
if (!config) throw new Error("Manjka FB_CONFIG");
await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  outfile: "www/app.js",
  define: { FB_CONFIG: config },
});
cpSync("../web/fonts", "www/fonts", { recursive: true });
for (const f of ["instrument-serif/files/instrument-serif-latin-400-normal.woff2", "instrument-serif/files/instrument-serif-latin-ext-400-normal.woff2",
  "instrument-serif/files/instrument-serif-latin-400-italic.woff2", "instrument-serif/files/instrument-serif-latin-ext-400-italic.woff2",
  "jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", "jetbrains-mono/files/jetbrains-mono-latin-ext-400-normal.woff2",
  "jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2", "jetbrains-mono/files/jetbrains-mono-latin-ext-500-normal.woff2"])
  cpSync("node_modules/@fontsource/" + f, "www/fonts/" + f.split("/").pop());
cpSync("../web/ikona.png", "www/ikona.png");
console.log("Zgrajeno v trezor/www");
