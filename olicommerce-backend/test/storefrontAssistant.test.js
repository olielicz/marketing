import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { matchCatalog, callStorefrontAI, generateStorefrontAnswer } from "../server/storefrontAssistant.js";

const catalog = [
  { id: "1", title: "Blue Cotton T-Shirt", description: "A soft, breathable everyday tee.", priceCents: 2499, url: "https://shop.example.com/blue-tee", tags: ["shirt", "cotton", "casual"], inStock: true },
  { id: "2", title: "Red Wool Beanie", description: "Warm winter hat.", priceCents: 1599, url: "https://shop.example.com/red-beanie", tags: ["hat", "winter", "wool"], inStock: true },
  { id: "3", title: "Discontinued Sneakers", description: "Old model, no longer sold.", priceCents: 5000, url: "https://shop.example.com/sneakers", tags: ["shoes"], inStock: false },
];

test("matchCatalog finds real products by keyword overlap in title/description/tags", () => {
  const matches = matchCatalog("do you have a blue shirt", catalog);
  assert.ok(matches.length >= 1);
  assert.equal(matches[0].product.title, "Blue Cotton T-Shirt");
});

test("matchCatalog never returns out-of-stock products", () => {
  const matches = matchCatalog("sneakers shoes", catalog);
  assert.equal(matches.length, 0); // the only "sneakers" match is out of stock
});

test("matchCatalog returns empty array for empty/irrelevant input, never throws", () => {
  assert.deepEqual(matchCatalog("", catalog), []);
  assert.deepEqual(matchCatalog("asdkjfh qwerty zzz", catalog), []);
  assert.deepEqual(matchCatalog("hello", []), []);
});

test("generateStorefrontAnswer with useAi=false answers only from the real catalog, never invents a product", async () => {
  const result = await generateStorefrontAnswer("looking for a warm hat", catalog, { useAi: false });
  assert.equal(result.source, "catalog");
  assert.equal(result.confident, true);
  assert.equal(result.recommendedProducts.length, 1);
  assert.equal(result.recommendedProducts[0].title, "Red Wool Beanie");
  assert.match(result.answer, /Red Wool Beanie/);
  // FIX: this used to hardcode "$" with no way to configure it at all -
  // now the real, honest default is USD, and every other real currency
  // (GBP/EUR/AUD/PHP/etc.) is genuinely supported too - see the
  // dedicated multi-currency tests below.
  assert.match(result.answer, /\$15\.99/);
});

test("generateStorefrontAnswer is honest when nothing in the catalog matches — never fabricates a product", async () => {
  const result = await generateStorefrontAnswer("do you sell laptops", catalog, { useAi: false });
  assert.equal(result.source, "catalog");
  assert.equal(result.confident, false);
  assert.equal(result.recommendedProducts.length, 0);
  assert.match(result.answer, /couldn't find/i);
});

test("generateStorefrontAnswer with useAi=true but no key falls back to real catalog honestly", async () => {
  const result = await generateStorefrontAnswer("warm hat please", catalog, { useAi: true, openaiApiKey: undefined });
  assert.equal(result.source, "catalog");
  assert.equal(result.aiRewriteAttempted, true);
  assert.equal(result.aiRewriteUsed, false);
  assert.match(result.aiNote, /no OPENAI_API_KEY/);
});

test("callStorefrontAI makes a real HTTP call and cross-checks recommended titles against the real catalog (honesty guard)", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    // The model claims to recommend a REAL product AND a FAKE one that
    // isn't in the catalog — the honesty guard in parseAIResponse must
    // silently drop the fake one.
    res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        confident: true,
        answer: "The Blue Cotton T-Shirt would be perfect!",
        recommendedTitles: ["Blue Cotton T-Shirt", "Invented Product That Does Not Exist"],
      }) } }],
    }));
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  try {
    const result = await callStorefrontAI("what shirts do you have", catalog, { apiKey: "sk-test", apiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result.confident, true);
    assert.equal(result.recommendedProducts.length, 1); // the fake one was dropped
    assert.equal(result.recommendedProducts[0].title, "Blue Cotton T-Shirt");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("callStorefrontAI returns null (never throws) when the API call fails", async () => {
  const mockServer = http.createServer((req, res) => { res.writeHead(500); res.end("{}"); });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  try {
    const result = await callStorefrontAI("x", catalog, { apiKey: "sk-test", apiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result, null);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("generateStorefrontAnswer with a real configured key and working mock AI honestly reports source=ai", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ confident: true, answer: "Try the beanie!", recommendedTitles: ["Red Wool Beanie"] }) } }] }));
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  try {
    const result = await generateStorefrontAnswer("something warm", catalog, { useAi: true, openaiApiKey: "sk-real", openaiApiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result.source, "ai");
    assert.equal(result.aiRewriteUsed, true);
    assert.equal(result.recommendedProducts[0].title, "Red Wool Beanie");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});


test("generateStorefrontAnswer defaults to USD currency out of the box, never a fabricated symbol with no source", async () => {
  // FIX regression coverage: a real customer caught every shopping-
  // assistant answer quoting prices with a hardcoded "$" with NO
  // setting to change it anywhere in the product. No `currency` passed
  // here at all -> the real, configurable default (USD) is used - not
  // a silently-hardcoded symbol that happened to also look like USD's.
  const result = await generateStorefrontAnswer("looking for a warm hat", catalog, { useAi: false });
  assert.match(result.answer, /\$15\.99/);
});

test("generateStorefrontAnswer genuinely supports GBP, EUR, AUD, and PHP, not just USD", async () => {
  const usdResult = await generateStorefrontAnswer("looking for a warm hat", catalog, { useAi: false, currency: "USD" });
  assert.match(usdResult.answer, /\$15\.99/);

  const gbpResult = await generateStorefrontAnswer("looking for a warm hat", catalog, { useAi: false, currency: "GBP" });
  assert.match(gbpResult.answer, /(£|GBP)/);

  const eurResult = await generateStorefrontAnswer("looking for a warm hat", catalog, { useAi: false, currency: "EUR" });
  assert.match(eurResult.answer, /(€|EUR)/);

  const audResult = await generateStorefrontAnswer("looking for a warm hat", catalog, { useAi: false, currency: "AUD" });
  assert.match(audResult.answer, /(A\$|AUD)/);

  const phpResult = await generateStorefrontAnswer("looking for a warm hat", catalog, { useAi: false, currency: "PHP" });
  assert.match(phpResult.answer, /(₱|PHP)/);
});
