/**
 * Real implementation of the "condition" node type — evaluates the
 * operator the frontend's config panel already collects (equals, not
 * equals, contains, greater than, less than, is empty, is not empty,
 * regex match — see oliflow/app/index.html's 'condition' case).
 *
 * Unlike the frontend's simulated engine (which never actually reads
 * node.config at all), this genuinely evaluates the configured
 * field/operator/value against the real trigger/node-output data
 * available at execution time.
 */
import { resolveTemplate } from "../templateEngine.js";

/**
 * @param {{field: string, op: string, value: string}} config
 * @param {object} templateContext
 * @returns {{ ok: true, result: boolean, resolvedField: string } | { ok: false, error: string }}
 */
export function runConditionNode(config, templateContext) {
  const op = config.op || "equals";
  const resolvedField = resolveTemplate(config.field || "", templateContext);
  const resolvedValue = resolveTemplate(config.value || "", templateContext);

  let result;
  switch (op) {
    case "equals":
      result = resolvedField === resolvedValue;
      break;
    case "not equals":
      result = resolvedField !== resolvedValue;
      break;
    case "contains":
      result = String(resolvedField).includes(resolvedValue);
      break;
    case "greater than": {
      const a = Number(resolvedField);
      const b = Number(resolvedValue);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        return { ok: false, error: `"greater than" requires numeric values; got "${resolvedField}" and "${resolvedValue}".` };
      }
      result = a > b;
      break;
    }
    case "less than": {
      const a = Number(resolvedField);
      const b = Number(resolvedValue);
      if (Number.isNaN(a) || Number.isNaN(b)) {
        return { ok: false, error: `"less than" requires numeric values; got "${resolvedField}" and "${resolvedValue}".` };
      }
      result = a < b;
      break;
    }
    case "is empty":
      result = resolvedField === "" || resolvedField === undefined || resolvedField === null;
      break;
    case "is not empty":
      result = !(resolvedField === "" || resolvedField === undefined || resolvedField === null);
      break;
    case "regex match":
      try {
        result = new RegExp(resolvedValue).test(String(resolvedField));
      } catch (err) {
        return { ok: false, error: `"${resolvedValue}" is not a valid regular expression: ${err.message}` };
      }
      break;
    default:
      return { ok: false, error: `Unknown condition operator: "${op}"` };
  }

  return { ok: true, result, resolvedField };
}
