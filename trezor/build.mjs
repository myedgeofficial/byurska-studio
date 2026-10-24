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
cpSync("../web/ikona.png", "www/ikona.png");
console.log("Zgrajeno v trezor/www");
