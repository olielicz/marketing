import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { matchKnowledgeBase, callSupportAI, generateSupportAnswer } from "../server/supportAssistant.js";

test("matchKnowledgeBase finds a confident match for a clear question", () => {
  const match = matchKnowledgeBase("my workflow is not triggering, why won't it run");
  assert.ok(match);
  assert.equal(match.entry.id, "workflow-not-triggering");
  assert.ok(match.score >= 2);
});

test("matchKnowledgeBase returns null for empty input", () => {
  assert.equal(matchKnowledgeBase(""), null);
});

test("generateSupportAnswer with useAi=false and confident match never attempts AI", async () => {
  const result = await generateSupportAnswer("my openai node is not implemented, why", { useAi: false });
  assert.equal(result.source, "knowledge_base");
  assert.equal(result.confident, true);
  assert.equal(result.shouldEscalate, false);
  assert.equal(result.aiRewriteAttempted, false);
});

test("generateSupportAnswer escalates honestly when nothing matches and AI is off", async () => {
  const result = await generateSupportAnswer("can oliflow compose a symphony", { useAi: false });
  assert.equal(result.source, "fallback");
  assert.equal(result.shouldEscalate, true);
});

test("generateSupportAnswer with useAi=true but no key falls back to KB honestly", async () => {
  const result = await generateSupportAnswer("email_send smtp credentials configuration", { useAi: true, openaiApiKey: undefined });
  assert.equal(result.source, "knowledge_base");
  assert.equal(result.aiRewriteAttempted, true);
  assert.equal(result.aiRewriteUsed, false);
  assert.match(result.aiNote, /no OPENAI_API_KEY/);
});

test("callSupportAI makes a real HTTP call and parses JSON response", async () => {
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
    const result = await callSupportAI("Why is http_request blocked?", { apiKey: "sk-test", apiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result.answer, "Real mock AI answer.");
    assert.equal(result.confident, true);
    assert.equal(received.headers.authorization, "Bearer sk-test");
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("callSupportAI returns null on failure, never throws", async () => {
  const mockServer = http.createServer((req, res) => { res.writeHead(500); res.end("{}"); });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  try {
    const result = await callSupportAI("x", { apiKey: "sk-test", apiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result, null);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});

test("generateSupportAnswer with real key + working mock AI reports source=ai honestly", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: '{"confident": true, "answer": "AI answer about node types."}' } }] }));
  });
  await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const port = mockServer.address().port;
  try {
    const result = await generateSupportAnswer("some question", { useAi: true, openaiApiKey: "sk-real", openaiApiBaseUrl: `http://127.0.0.1:${port}/v1` });
    assert.equal(result.source, "ai");
    assert.equal(result.aiRewriteUsed, true);
    assert.equal(result.shouldEscalate, false);
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
  }
});
