import { test } from "node:test";
import assert from "node:assert/strict";
import { izKode, zakleni, odkleni, mocKode, novoGeslo, pocisti } from "../src/kripto.js";

test("ista koda da isti trezor, druga koda drugega", async () => {
  const a = await izKode("Remako-2026-trezor", 1000);
  const b = await izKode(" Remako-2026-trezor ", 1000);
  const c = await izKode("Remako-2026-trezoR", 1000);
  assert.match(a.id, /^[0-9a-f]{64}$/);
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
});

test("šifriranje in odpiranje, napačna koda ne odpre", async () => {
  const t = await izKode("Remako-2026-trezor", 1000);
  const blob = await zakleni(t, { vnosi: [{ naziv: "Banka", geslo: "skrivnost čšž" }] });
  assert.ok(!blob.c.includes("skrivnost"));
  assert.equal(unb(blob.iv), 12);
  assert.deepEqual(await odkleni(t, blob), { vnosi: [{ naziv: "Banka", geslo: "skrivnost čšž" }] });
  const drug = await izKode("Druga-koda-123", 1000);
  await assert.rejects(odkleni(drug, blob));
  // ista vsebina pod drugim imenom dokumenta se ne odpre
  await assert.rejects(odkleni({ id: drug.id, kljuc: t.kljuc }, blob));
});

test("moč kode in generator gesel", () => {
  assert.equal(mocKode("kratka").dovolj, false);
  assert.equal(mocKode("1234567890").dovolj, false);
  assert.equal(mocKode("Zlato-Tim-Remako-77").dovolj, true);
  const g = novoGeslo(24);
  assert.equal(g.length, 24);
  assert.notEqual(g, novoGeslo(24));
  assert.equal(pocisti("  á "), "á");
});

function unb(s) { return Buffer.from(s, "base64").length; }
