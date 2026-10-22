// Pripravi app/www iz web/: združi JavaScript (Firebase, Capacitor) v eno datoteko in doda nastavitve strežnika.
// Nastavitve Firebase pridejo iz okolja STUDIO_FB_CONFIG (JSON) ali iz datoteke app/fb-config.json.
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const web = path.resolve(__dirname, "..", "..", "web");
const out = path.resolve(__dirname, "..", "www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(web, "src", "main.js")],
  bundle: true, minify: true, format: "iife", target: ["safari16"],
  outfile: path.join(out, "app.js"), legalComments: "none", logLevel: "warning",
  nodePaths: [path.resolve(__dirname, "..", "node_modules")]
});
for (const f of ["index.html", "app.css", "ikona.png"]) fs.copyFileSync(path.join(web, f), path.join(out, f));

let cfg = process.env.STUDIO_FB_CONFIG || "";
const file = path.resolve(__dirname, "..", "fb-config.json");
if (!cfg && fs.existsSync(file)) cfg = fs.readFileSync(file, "utf8");
if (cfg) {
  const json = JSON.parse(cfg);
  fs.writeFileSync(path.join(out, "fb-config.js"), "window.STUDIO_FB=" + JSON.stringify(json) + ";\n");
  const p = path.join(out, "index.html");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace('<script src="app.js">', '<script src="fb-config.js"></script>\n  <script src="app.js">'));
  console.log("Strežnik:", json.projectId);
} else {
  console.log("::warning::Ni nastavitev Firebase (STUDIO_FB_CONFIG). Aplikacija bo pokazala »Strežnik še ni povezan«.");
}
console.log("www pripravljen:", fs.readdirSync(out).join(", "));
