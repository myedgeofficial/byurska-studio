// Šifriranje trezorja v brskalniku. Strežnik vidi samo šifrirano besedilo in naključno ime dokumenta.
// Iz kode z PBKDF2 (600.000 krogov) nastane 512 bitov: prva polovica je ključ AES-GCM,
// iz druge (SHA-256) nastane ime dokumenta. Brez kode trezorja ni mogoče niti najti niti prebrati.

const enc = new TextEncoder();
const dec = new TextDecoder();
const SOL = "REMAKO-trezor-v1";
export const KROGOV = 600000;
export const NAJMANJ_ZNAKOV = 10;

export const b64 = (buf) => {
  let s = "";
  for (const c of new Uint8Array(buf)) s += String.fromCharCode(c);
  return btoa(s);
};
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const pocisti = (koda) => String(koda || "").normalize("NFC").trim();

export async function izKode(koda, krogov = KROGOV) {
  const osnova = await crypto.subtle.importKey("raw", enc.encode(pocisti(koda)), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(SOL), iterations: krogov }, osnova, 512));
  const kljuc = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  const id = hex(await crypto.subtle.digest("SHA-256", bits.slice(32)));
  bits.fill(0);
  return { id, kljuc };
}

// Ime dokumenta je tudi dodatni podatek AES-GCM: šifrirano vsebino lahko odpre samo ta trezor.
export async function zakleni({ id, kljuc }, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(id) }, kljuc, enc.encode(JSON.stringify(obj)));
  return { c: b64(ct), iv: b64(iv) };
}

export async function odkleni({ id, kljuc }, { c, iv }) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: enc.encode(id) }, kljuc, unb64(c));
  return JSON.parse(dec.decode(pt));
}

// Ocena moči kode za opozorilo ob nastavitvi.
export function mocKode(koda) {
  const k = pocisti(koda);
  let nabor = 0;
  if (/[a-zčšž]/.test(k)) nabor += 26;
  if (/[A-ZČŠŽ]/.test(k)) nabor += 26;
  if (/\d/.test(k)) nabor += 10;
  if (/[^a-zA-Z0-9čšžČŠŽ]/.test(k)) nabor += 20;
  const bitov = Math.round(k.length * Math.log2(Math.max(nabor, 1)));
  return { bitov, dovolj: k.length >= NAJMANJ_ZNAKOV && bitov >= 50 };
}

export function novoGeslo(dolzina = 20) {
  const znaki = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*-_=+?";
  const out = [];
  const meja = 256 - (256 % znaki.length);
  while (out.length < dolzina) {
    for (const b of crypto.getRandomValues(new Uint8Array(dolzina * 2))) {
      if (b < meja && out.length < dolzina) out.push(znaki[b % znaki.length]);
    }
  }
  return out.join("");
}

// Datoteke (pogodbe, licence): šifrirane bajte shranimo kot iv (12 bajtov) + šifrirano vsebino.
// Dodatni podatek je ime trezorja in datoteke, zato datoteke ni mogoče podtakniti drugam.
export async function zakleniDatoteko({ id, kljuc }, imeDatoteke, bajti) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(id + "/" + imeDatoteke) }, kljuc, bajti));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function odkleniDatoteko({ id, kljuc }, imeDatoteke, paket) {
  const p = new Uint8Array(paket);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: p.slice(0, 12), additionalData: enc.encode(id + "/" + imeDatoteke) }, kljuc, p.slice(12)));
}
