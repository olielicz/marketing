import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// store.js reads OLIFLOW_EXECUTOR_DATA_DIR at import time, so set it up
// BEFORE importing anything that (transitively) imports store.js — a
// fresh temp dir per test file keeps this isolated from other test
// files' data and from a real running server's data/ directory.
const tmpDir = mkdtempSync(path.join(tmpdir(), "oliflow-crm-test-"));
process.env.OLIFLOW_EXECUTOR_DATA_DIR = tmpDir;

const { runCrmCreateContactNode, runCrmUpdateContactNode, runCrmPipelineNode, runCrmTagNode, runLeadScoreNode, runLandingPageNode } = await import(
  "../server/handlers/crmNodes.js"
);
const { buildBaseContext } = await import("../server/templateEngine.js");

function ctx(overrides = {}) {
  return { ...buildBaseContext({ trigger: {}, vars: {}, nodeOutputsByLabel: {} }), ...overrides };
}

test.after(() => rmSync(tmpDir, { recursive: true, force: true }));

test("crm_create_contact: creates a real, persisted contact", async () => {
  const result = await runCrmCreateContactNode({ email: "lead@example.com", name: "Lead One" }, ctx());
  assert.equal(result.ok, true);
  assert.equal(result.result.isNew, true);
  assert.equal(result.result.contact.email, "lead@example.com");
});

test("crm_create_contact: is idempotent by email (real de-dup, not a fresh record every time)", async () => {
  const first = await runCrmCreateContactNode({ email: "dup@example.com" }, ctx());
  const second = await runCrmCreateContactNode({ email: "dup@example.com" }, ctx());
  assert.equal(second.result.isNew, false);
  assert.equal(first.result.contact.id, second.result.contact.id);
});

test("crm_pipeline: sets a real, persisted pipeline stage", async () => {
  await runCrmCreateContactNode({ email: "pipeline@example.com" }, ctx());
  const result = await runCrmPipelineNode({ email: "pipeline@example.com", stage: "qualified" }, ctx());
  assert.equal(result.ok, true);
  assert.equal(result.result.pipelineStage, "qualified");
});

test("crm_pipeline: an honest error when the contact doesn't exist", async () => {
  const result = await runCrmPipelineNode({ email: "nobody@example.com", stage: "qualified" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /No contact found/);
});

test("crm_tag: adds a real tag without duplicating it", async () => {
  await runCrmCreateContactNode({ email: "tagme@example.com" }, ctx());
  await runCrmTagNode({ email: "tagme@example.com", tag: "vip" }, ctx());
  const second = await runCrmTagNode({ email: "tagme@example.com", tag: "vip" }, ctx());
  assert.deepEqual(second.result.tags, ["vip"]);
});

test("lead_score: accumulates a real running score across calls", async () => {
  await runCrmCreateContactNode({ email: "score@example.com" }, ctx());
  await runLeadScoreNode({ email: "score@example.com", points: 10 }, ctx());
  const second = await runLeadScoreNode({ email: "score@example.com", points: 5 }, ctx());
  assert.equal(second.result.leadScore, 15);
});

test("landing_page: publishes a real page retrievable by slug", async () => {
  const result = await runLandingPageNode({ slug: "spring-sale", title: "Spring Sale", html: "<h1>Spring Sale</h1>" }, ctx());
  assert.equal(result.ok, true);
  assert.equal(result.result.url, "/lp/spring-sale");
});

test("landing_page: rejects an invalid slug", async () => {
  const result = await runLandingPageNode({ slug: "Not Valid Slug!", title: "x" }, ctx());
  assert.equal(result.ok, false);
  assert.match(result.error, /lowercase letters, numbers, and hyphens/);
});
