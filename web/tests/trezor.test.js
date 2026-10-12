import { test } from "node:test";
import assert from "node:assert/strict";
import { novaSol, kljucIzGesla, zakleni, odkleni, preveritev, pravilen } from "../src/trezor.js";

test("šifriranje in preverjanje skupnega gesla", async () => {
  const sol = novaSol();
  const k = await kljucIzGesla("skupno-geslo-123", sol);
  const z = await zakleni(k, { geslo: "Tajno!1", uporabnik: "byurska" });
  assert.ok(!JSON.stringify(z).includes("Tajno"));
  assert.deepEqual(await odkleni(k, z), { geslo: "Tajno!1", uporabnik: "byurska" });
  const p = await preveritev(k);
  assert.equal(await pravilen(k, p), true);
  assert.equal(await pravilen(await kljucIzGesla("napačno", sol), p), false);
});
