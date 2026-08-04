import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTemplate, resolveTemplateDeep, buildBaseContext } from "../server/templateEngine.js";

test("resolves {{now}} and {{date}} from context", () => {
  const ctx = buildBaseContext({ workflowId: "wf1", executionId: "ex1" });
  assert.equal(resolveTemplate("time: {{now}}", ctx), `time: ${ctx.now}`);
  assert.equal(resolveTemplate("today: {{date}}", ctx), `today: ${ctx.date}`);
});

test("resolves {{workflow_id}} and {{execution_id}}", () => {
  const ctx = buildBaseContext({ workflowId: "wf1", executionId: "ex1" });
  assert.equal(resolveTemplate("{{workflow_id}}/{{execution_id}}", ctx), "wf1/ex1");
});

test("resolves nested trigger.body paths", () => {
  const ctx = buildBaseContext({ trigger: { body: { status: "active", user: { name: "Jane" } } } });
  assert.equal(resolveTemplate("status={{trigger.body.status}}", ctx), "status=active");
  assert.equal(resolveTemplate("name={{trigger.body.user.name}}", ctx), "name=Jane");
});

test("resolves vars.X", () => {
  const ctx = buildBaseContext({ vars: { apiKey: "sk_test_123" } });
  assert.equal(resolveTemplate("key={{vars.apiKey}}", ctx), "key=sk_test_123");
});

test("resolves {{Node Label.output}} by label", () => {
  const ctx = buildBaseContext({ nodeOutputsByLabel: { "HTTP Request": { statusCode: 200, body: "ok" } } });
  assert.equal(resolveTemplate("{{HTTP Request.output}}", ctx), JSON.stringify({ statusCode: 200, body: "ok" }));
  assert.equal(resolveTemplate("{{HTTP Request.statusCode}}", ctx), "200");
});

test("leaves unknown paths untouched rather than silently emptying them", () => {
  const ctx = buildBaseContext({});
  assert.equal(resolveTemplate("val={{trigger.body.doesNotExist}}", ctx), "val={{trigger.body.doesNotExist}}");
  assert.equal(resolveTemplate("{{totally.unknown.thing}}", ctx), "{{totally.unknown.thing}}");
});

test("resolveTemplateDeep resolves placeholders inside nested objects/arrays", () => {
  const ctx = buildBaseContext({ vars: { name: "Jane" }, trigger: { body: { id: 42 } } });
  const input = { greeting: "Hi {{vars.name}}", meta: { id: "{{trigger.body.id}}" }, list: ["{{vars.name}}", "static"] };
  const result = resolveTemplateDeep(input, ctx);
  assert.deepEqual(result, { greeting: "Hi Jane", meta: { id: "42" }, list: ["Jane", "static"] });
});

test("object values are JSON-stringified when interpolated into a string", () => {
  const ctx = buildBaseContext({ trigger: { body: { obj: { a: 1 } } } });
  assert.equal(resolveTemplate("{{trigger.body.obj}}", ctx), '{"a":1}');
});
