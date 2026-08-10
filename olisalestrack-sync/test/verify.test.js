import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature, verifyShopifySignature, verifyWooCommerceSignature } from "../server/verify.js";

test("verifyStripeSignature accepts a correctly-signed payload", () => {
  const secret = "whsec_test";
  const rawBody = JSON.stringify({ id: "evt_1" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${rawBody}`;
  const signature = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(verifyStripeSignature(rawBody, header, secret), true);
});

test("verifyStripeSignature rejects a tampered payload", () => {
  const secret = "whsec_test";
  const rawBody = JSON.stringify({ id: "evt_1" });
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${rawBody}`;
  const signature = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const header = `t=${timestamp},v1=${signature}`;

  const tamperedBody = JSON.stringify({ id: "evt_2" });
  assert.equal(verifyStripeSignature(tamperedBody, header, secret), false);
});

test("verifyStripeSignature rejects when secret is missing", () => {
  assert.equal(verifyStripeSignature("{}", "t=1,v1=abc", ""), false);
});

test("verifyStripeSignature rejects a missing/malformed header", () => {
  assert.equal(verifyStripeSignature("{}", undefined, "whsec_test"), false);
  assert.equal(verifyStripeSignature("{}", "garbage", "whsec_test"), false);
});

test("verifyShopifySignature accepts a correctly-signed payload", () => {
  const secret = "shpss_test";
  const rawBody = JSON.stringify({ id: 1 });
  const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  assert.equal(verifyShopifySignature(rawBody, signature, secret), true);
});

test("verifyShopifySignature rejects a tampered payload", () => {
  const secret = "shpss_test";
  const rawBody = JSON.stringify({ id: 1 });
  const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  assert.equal(verifyShopifySignature(JSON.stringify({ id: 2 }), signature, secret), false);
});

test("verifyShopifySignature rejects when secret is missing", () => {
  assert.equal(verifyShopifySignature("{}", "abc", ""), false);
});

test("verifyWooCommerceSignature accepts a correctly-signed payload", () => {
  const secret = "wc_test_secret";
  const rawBody = JSON.stringify({ id: 501 });
  const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  assert.equal(verifyWooCommerceSignature(rawBody, signature, secret), true);
});

test("verifyWooCommerceSignature rejects a tampered payload", () => {
  const secret = "wc_test_secret";
  const rawBody = JSON.stringify({ id: 501 });
  const signature = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  assert.equal(verifyWooCommerceSignature(JSON.stringify({ id: 502 }), signature, secret), false);
});

test("verifyWooCommerceSignature rejects when secret is missing", () => {
  assert.equal(verifyWooCommerceSignature("{}", "abc", ""), false);
});
