import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildPlainTemplate, rewriteWithAI, generateRecoveryEmail } from "../server/recoveryEmail.js";

const sampleCart = {
  items: [
    { title: "Blue T-Shirt", quantity: 2, priceCents: 2500 },
    { title: "Cap", quantity: 1, priceCents: 1500 },
  ],
  cartValueCents: 6500,
  currency: "USD",
  checkoutUrl: "https://shop.example.com/checkout/abc123",
};

test("buildPlainTemplate includes items, total, and checkout link", () => {
  const email = buildPlainTemplate(sampleCart, { storeName: "Test Shop", tone: "friendly" });
  assert.match(email.html, /Blue T-Shirt/);
  assert.match(email.html, /\$65\.00/);
  assert.match(email.html, /shop\.example\.com\/checkout\/abc123/);
  assert.ok(email.subject.length > 0);
});

test("buildPlainTemplate respects the requested tone", () => {
  const urgent = buildPlainTemplate(sampleCart, { storeName: "Test Shop", tone: "urgent" });
  const discount = buildPlainTemplate(sampleCart, { storeName: "Test Shop", tone: "discount" });
  assert.match(urgent.subject, /expire/i);
  assert.match(discount.subject, /off/i);
});

test("generateRecoveryEmail with useAi=false never attempts AI, always returns the plain template", async () => {
  const email = await generateRecoveryEmail(sampleCart, { storeName: "Test Shop", useAi: false });
  assert.equal(email.aiRewriteAttempted, false);
  assert.equal(email.aiRewriteUsed, false);
  assert.match(email.html, /Blue T-Shirt/);
});

test("generateRecoveryEmail with useAi=true but NO api key falls back to the plain template and says so honestly", async () => {
  const email = await generateRecoveryEmail(sampleCart, { storeName: "Test Shop", useAi: true, openaiApiKey: undefined });
  assert.equal(email.aiRewriteAttempted, true);
  assert.equal(email.aiRewriteUsed, false);
  assert.match(email.aiRewriteNote, /no OPENAI_API_KEY/);
  // Critically: the actual EMAIL CONTENT sent is still the real plain
  // template, not a fabricated "AI" result.
  assert.match(email.html, /Blue T-Shirt/);
});

test("rewriteWithAI makes a real HTTP call to a real (mock) OpenAI-compatible endpoint and returns its actual response", async () => {
  let receivedRequest = null;
  const mockServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      receivedRequest = { headers: req.headers, body: JSON.parse(raw) };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "This is a real rewritten email from the mock AI." } }] }));
    });
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const result = await rewriteWithAI("original plain text", {
      tone: "urgent",
      apiKey: "sk-test-key-123",
      apiBaseUrl: `http://127.0.0.1:${port}/v1`,
      model: "gpt-4o-mini",
    });
    assert.equal(result, "This is a real rewritten email from the mock AI.");
    assert.equal(receivedRequest.headers.authorization, "Bearer sk-test-key-123");
    assert.equal(receivedRequest.body.model, "gpt-4o-mini");
    assert.match(receivedRequest.body.messages[1].content, /original plain text/);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("rewriteWithAI returns null (never throws) when the API call fails, so the caller can fall back", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "internal server error" }));
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const result = await rewriteWithAI("text", { tone: "friendly", apiKey: "sk-test", apiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result, null);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("generateRecoveryEmail with a real configured key and a working mock AI server actually uses the AI result", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "AI-rewritten cart recovery message." } }] }));
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const email = await generateRecoveryEmail(sampleCart, {
      storeName: "Test Shop",
      useAi: true,
      openaiApiKey: "sk-real-looking-key",
      openaiApiBaseUrl: `http://127.0.0.1:${port}/v1`,
    });
    assert.equal(email.aiRewriteAttempted, true);
    assert.equal(email.aiRewriteUsed, true);
    assert.match(email.text, /AI-rewritten cart recovery message/);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});
