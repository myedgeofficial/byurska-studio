// Šifriranje gesel na telefonu (AES-GCM, ključ iz skupnega gesla s PBKDF2).
// Strežnik vidi samo šifrirano besedilo; skupno geslo pozna samo ekipa.

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PREVERI = "byurska-trezor-ok";
const KROGOV = 250000;

export const novaSol = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function kljucIzGesla(geslo, sol) {
  const osnova = await crypto.subtle.importKey("raw", enc.encode(geslo), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(sol), iterations: KROGOV }, osnova, 256);
  return b64(bits); // shranimo v Keychain, da ga ni treba vsakič računati
}

const uvozi = (k) => crypto.subtle.importKey("raw", unb64(k), "AES-GCM", false, ["encrypt", "decrypt"]);

export async function zakleni(kljuc, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await uvozi(kljuc), enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function odkleni(kljuc, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await uvozi(kljuc), unb64(ct));
  return JSON.parse(dec.decode(pt));
}

export const preveritev = (kljuc) => zakleni(kljuc, PREVERI);
export async function pravilen(kljuc, preveri) {
  try { return (await odkleni(kljuc, preveri)) === PREVERI; } catch (e) { return false; }
}
