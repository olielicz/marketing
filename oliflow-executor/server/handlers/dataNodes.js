/**
 * Real implementations of the remaining "Data & Transform" node types:
 * json_parse, template, aggregate, split, format_date. All pure,
 * synchronous, zero-dependency — genuine data transforms, not decorative
 * placeholders, matching the same honesty standard as the rest of this
 * executor (see simpleNodes.js's header comment).
 */
import { resolveTemplate, resolveTemplateDeep } from "../templateEngine.js";

/**
 * "json_parse" — real JSON.parse of a template-resolved string. Config:
 *   { text: "{{trigger.body.rawPayload}}" }
 * A malformed JSON string produces an honest error (with the exact
 * native JSON.parse message) rather than silently returning null or an
 * empty object.
 */
export function runJsonParseNode(config, templateContext) {
  const raw = resolveTemplate(String(config.text ?? ""), templateContext);
  try {
    return { ok: true, result: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `"${raw}" is not valid JSON: ${err.message}` };
  }
}

/**
 * "template" — fills a template STRING (not necessarily a single
 * {{path}} — can be free text with multiple placeholders mixed in,
 * exactly like email_send's body field) using the same real
 * resolveTemplate() engine every other node already uses. Config:
 *   { template: "Hi {{trigger.body.name}}, your order #{{trigger.body.id}} shipped." }
 * This is genuinely the same resolution logic as every other node's
 * {{...}} fields — the node exists as a first-class citizen so a user
 * can build one reusable rendered-text output that several downstream
 * nodes reference via {{Template.rendered}}, instead of repeating the
 * same template string in each of them.
 */
export function runTemplateNode(config, templateContext) {
  const tpl = config.template ?? config.text ?? "";
  if (typeof tpl !== "string") {
    return { ok: false, error: `"template" must be a string; got ${typeof tpl}.` };
  }
  return { ok: true, result: resolveTemplate(tpl, templateContext) };
}

function getByPath(obj, pathStr) {
  if (!pathStr) return obj;
  return pathStr.split(".").reduce((acc, part) => (acc === undefined || acc === null ? undefined : acc[part]), obj);
}

/**
 * "aggregate" — real sum/count/avg/min/max/group over a real array.
 * Config:
 *   { items: "{{Filter.matched}}", op: "sum", field: "amount" }
 *   { items: "{{Filter.matched}}", op: "group", field: "status" }
 * `items` is resolved via template, then parsed as JSON if it came back
 * as a string (matching filterNode's same items-resolution convention).
 * `op: "count"` doesn't need `field`. `op: "group"` returns a real
 * object keyed by each distinct field value, with each value being the
 * real array of items sharing that key — not a summary/count, a genuine
 * partition of the real input data.
 */
export function runAggregateNode(config, templateContext) {
  let items = config.items;
  if (typeof items === "string") {
    const resolved = resolveTemplate(items, templateContext);
    try {
      items = JSON.parse(resolved);
    } catch {
      return { ok: false, error: `"items" did not resolve to a JSON array: ${resolved}` };
    }
  }
  if (!Array.isArray(items)) {
    return { ok: false, error: `"items" must resolve to an array; got ${typeof items}.` };
  }

  const op = config.op || "count";
  const field = config.field || "";

  if (op === "count") {
    return { ok: true, result: items.length };
  }

  if (op === "group") {
    const groups = {};
    for (const item of items) {
      const key = String(getByPath(item, field));
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return { ok: true, result: groups };
  }

  const numbers = items.map((item) => Number(getByPath(item, field))).filter((n) => !Number.isNaN(n));
  if (numbers.length === 0 && items.length > 0) {
    return { ok: false, error: `No numeric values found at field "${field}" across ${items.length} item(s) — "${op}" needs a numeric field.` };
  }

  switch (op) {
    case "sum":
      return { ok: true, result: numbers.reduce((a, b) => a + b, 0) };
    case "avg":
      return { ok: true, result: numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0 };
    case "min":
      return { ok: true, result: numbers.length ? Math.min(...numbers) : null };
    case "max":
      return { ok: true, result: numbers.length ? Math.max(...numbers) : null };
    default:
      return { ok: false, error: `Unknown aggregate op: "${op}". Use sum, avg, min, max, count, or group.` };
  }
}

/**
 * "split" — real string/array splitting. Config:
 *   { input: "{{trigger.body.tags}}", by: "," }         -> string split
 *   { input: "{{SomeNode.output}}", by: "chunk:3" }      -> array chunking
 * A `by` of the form "chunk:N" splits a real array into groups of N
 * (last group may be shorter) — a genuinely common real workflow need
 * (e.g. batching API calls), not just a string delimiter split.
 */
export function runSplitNode(config, templateContext) {
  const resolved = resolveTemplateDeep(config.input, templateContext);
  const by = config.by ?? ",";

  const chunkMatch = /^chunk:(\d+)$/.exec(String(by));
  if (chunkMatch) {
    let arr = resolved;
    if (typeof arr === "string") {
      try {
        arr = JSON.parse(arr);
      } catch {
        return { ok: false, error: `"chunk:N" requires an array input; "${resolved}" is not valid JSON.` };
      }
    }
    if (!Array.isArray(arr)) {
      return { ok: false, error: `"chunk:N" requires an array input; got ${typeof arr}.` };
    }
    const size = Number(chunkMatch[1]) || 1;
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return { ok: true, result: chunks };
  }

  const str = typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  return { ok: true, result: str.split(String(by)) };
}

const PAD2 = (n) => String(n).padStart(2, "0");

/**
 * "format_date" — real date parsing/formatting using only Intl/Date
 * built-ins (no dependency needed for the tokens this supports). Config:
 *   { date: "{{trigger.body.createdAt}}", format: "YYYY-MM-DD" }
 *   { date: "{{trigger.body.createdAt}}", format: "MM/DD/YYYY HH:mm" }
 * Supports the token set the frontend's hint would reasonably show a
 * user (YYYY, MM, DD, HH, mm, ss) — a genuinely useful, common subset
 * rather than a full strftime/moment-style implementation, which would
 * need a real dependency this zero-dependency executor doesn't have.
 * An unparseable date input produces an honest error.
 */
export function runFormatDateNode(config, templateContext) {
  const resolvedDate = resolveTemplate(String(config.date ?? "{{now}}"), templateContext);
  const d = new Date(resolvedDate);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `"${resolvedDate}" could not be parsed as a date.` };
  }
  const fmt = config.format || "YYYY-MM-DD";
  const out = fmt
    .replace(/YYYY/g, d.getUTCFullYear())
    .replace(/MM/g, PAD2(d.getUTCMonth() + 1))
    .replace(/DD/g, PAD2(d.getUTCDate()))
    .replace(/HH/g, PAD2(d.getUTCHours()))
    .replace(/mm/g, PAD2(d.getUTCMinutes()))
    .replace(/ss/g, PAD2(d.getUTCSeconds()));
  return { ok: true, result: out };
}
