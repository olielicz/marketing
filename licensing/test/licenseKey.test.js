import test from "node:test";
import assert from "node:assert/strict";
import { generateSerialCode, isWellFormedSerialCode, productCodeFromSerialCode, PRODUCT_CODES } from "../server/licenseKey.js";

test("generateSerialCode produces a well-formed code for every product", () => {
  for (const product of PRODUCT_CODES) {
    const code = generateSerialCode(product);
    assert.match(code, /^OLI-[A-Z]{3}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$/);
    assert.equal(isWellFormedSerialCode(code), true);
    assert.equal(productCodeFromSerialCode(code), product);
  }
});

test("generateSerialCode rejects unknown product codes", () => {
  assert.throws(() => generateSerialCode("XYZ"));
});

test("isWellFormedSerialCode rejects a tampered checksum", () => {
  const code = generateSerialCode("OPS");
  const tampered = code.slice(0, -1) + (code.at(-1) === "0" ? "1" : "0");
  assert.equal(isWellFormedSerialCode(tampered), false);
});

test("isWellFormedSerialCode rejects garbage input", () => {
  assert.equal(isWellFormedSerialCode("not-a-real-code"), false);
  assert.equal(isWellFormedSerialCode(""), false);
  assert.equal(isWellFormedSerialCode(null), false);
  assert.equal(isWellFormedSerialCode(undefined), false);
});

test("isWellFormedSerialCode is case-insensitive", () => {
  const code = generateSerialCode("FLW");
  assert.equal(isWellFormedSerialCode(code.toLowerCase()), true);
});
