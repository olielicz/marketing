import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { matchKnowledgeBase, callSupportAI, generateSupportAnswer } from "../server/supportAssistant.js";

test("matchKnowledgeBase finds a confident match for a clear question", () => {
  const match = matchKnowledgeBase("my server crashes on launch, what do I do");
  assert.ok(match);
  assert.equal(match.entry.id, "server-wont-start");
  assert.ok(match.score >= 2);
});

test("matchKnowledgeBase returns null for an empty or irrelevant message", () => {
  assert.equal(matchKnowledgeBase(""), null);
  assert.equal(matchKnowledgeBase("   "), null);
});

test("generateSupportAnswer with useAi=false and a confident KB match never attempts AI", async () => {
  const result = await generateSupportAnswer("I forgot my password and can't log in", { useAi: false });
  assert.equal(result.source, "knowledge_base");
  assert.equal(result.confident, true);
  assert.equal(result.shouldEscalate, false);
  assert.equal(result.aiRewriteAttempted, false);
  assert.match(result.answer, /Forgot password/);
});

test("generateSupportAnswer with no confident KB match and useAi=false escalates honestly", async () => {
  const result = await generateSupportAnswer("can OliOps predict the weather on Mars", { useAi: false });
  assert.equal(result.source, "fallback");
  assert.equal(result.confident, false);
  assert.equal(result.shouldEscalate, true);
});

test("generateSupportAnswer with useAi=true but no API key falls back to KB and says so honestly, never fakes AI usage", async () => {
  const result = await generateSupportAnswer("I forgot my password", { useAi: true, openaiApiKey: undefined });
  assert.equal(result.source, "knowledge_base");
  assert.equal(result.aiRewriteAttempted, true);
  assert.equal(result.aiRewriteUsed, false);
  assert.match(result.aiNote, /no OPENAI_API_KEY/);
});

test("callSupportAI makes a real HTTP call to a real (mock) OpenAI-compatible endpoint and parses its JSON response", async () => {
  let received = null;
  const mockServer = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received = { headers: req.headers, body: JSON.parse(raw) };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"confident": true, "answer": "Real mock AI answer."}' } }] }));
    });
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const result = await callSupportAI("How do I reset my password?", {
      apiKey: "sk-test-123",
      apiBaseUrl: `http://127.0.0.1:${port}/v1`,
      model: "test-model",
    });
    assert.equal(result.answer, "Real mock AI answer.");
    assert.equal(result.confident, true);
    assert.equal(received.headers.authorization, "Bearer sk-test-123");
    assert.equal(received.body.model, "test-model");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("callSupportAI returns null (never throws) when the API call fails", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "boom" }));
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  try {
    const result = await callSupportAI("test", { apiKey: "sk-test", apiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result, null);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("generateSupportAnswer with a real configured key and working mock AI honestly reports source=ai", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"confident": false, "answer": "Not sure, escalating."}' } }] }));
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;

  try {
    const result = await generateSupportAnswer("some obscure question", {
      useAi: true,
      openaiApiKey: "sk-real-looking-key",
      openaiApiBaseUrl: `http://127.0.0.1:${port}/v1`,
    });
    assert.equal(result.source, "ai");
    assert.equal(result.aiRewriteUsed, true);
    assert.equal(result.confident, false);
    assert.equal(result.shouldEscalate, true);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});
