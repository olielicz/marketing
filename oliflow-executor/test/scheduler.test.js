/**
 * Tests the real Active Triggers API + a real scheduler poll tick
 * (called directly rather than waiting for the real 15s setInterval —
 * see scheduler.js's pollAllTriggers, exported here purely for testing
 * so this doesn't need a real 15-second wait to verify real behavior).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const tmpDir = mkdtempSync(path.join(tmpdir(), "oliflow-scheduler-test-"));
process.env.OLIFLOW_EXECUTOR_DATA_DIR = tmpDir;

const store = await import("../server/store.js");

test.after(() => rmSync(tmpDir, { recursive: true, force: true }));

test("createActiveTrigger + listActiveTriggers: real persistence round-trip", async () => {
  const workflow = { id: "wf1", nodes: [{ id: "n1", type: "schedule" }, { id: "n2", type: "log", config: { message: "tick" } }], connections: [{ fromId: "n1", toId: "n2" }] };
  const trigger = await store.createActiveTrigger({ type: "schedule", workflow, config: { everyMinutes: 30 } });
  assert.equal(trigger.type, "schedule");
  const list = await store.listActiveTriggers();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, trigger.id);
});

test("api_trigger: a real change-detection poll fires only when the polled endpoint's response actually changes", async () => {
  let responseBody = "version-1";
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(responseBody);
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const workflow = { id: "wf2", nodes: [{ id: "n1", type: "api_trigger" }, { id: "n2", type: "log", config: { message: "changed" } }], connections: [{ fromId: "n1", toId: "n2" }] };
    const trigger = await store.createActiveTrigger({ type: "api_trigger", workflow, config: { url: `http://127.0.0.1:${port}` } });

    const { pollAllTriggersForTest } = await import("../server/scheduler.js");
    await pollAllTriggersForTest();
    let log = await store.getTriggerFireLog(trigger.id);
    assert.equal(log.length, 1, "first poll should fire (no previous hash yet)");

    // Same response body again — should NOT fire a second time.
    await pollAllTriggersForTest();
    log = await store.getTriggerFireLog(trigger.id);
    assert.equal(log.length, 1, "unchanged response should not fire again");

    // Response body changes — should fire again.
    responseBody = "version-2";
    await pollAllTriggersForTest();
    log = await store.getTriggerFireLog(trigger.id);
    assert.equal(log.length, 2, "changed response should fire a second time");
  } finally {
    server.close();
  }
});

test("deleteActiveTrigger: real removal", async () => {
  const workflow = { id: "wf3", nodes: [{ id: "n1", type: "schedule" }], connections: [] };
  const trigger = await store.createActiveTrigger({ type: "schedule", workflow, config: {} });
  const deleted = await store.deleteActiveTrigger(trigger.id);
  assert.equal(deleted, true);
  const again = await store.deleteActiveTrigger(trigger.id);
  assert.equal(again, false);
});
