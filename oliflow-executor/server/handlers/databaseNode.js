/**
 * The "mysql" node type (labeled "MySQL / Postgres" in the frontend's
 * NODE_LIBRARY — see oliflow/app/index.html). Dispatches to a real,
 * hand-rolled wire-protocol client for either engine — see
 * postgresProtocol.js / mysqlProtocol.js for the actual protocol
 * implementations (both zero-dependency, using only node:net/node:crypto).
 *
 * Credentials come from WORKFLOW VARIABLES, not the node's own config —
 * same secrets-don't-belong-in-a-workflow-definition principle already
 * established by emailSendNode.js (SMTP creds) and this executor's README.
 * Config shape (via the generic JSON fallback panel):
 *   { engine: "postgres", varPrefix: "db", query: "SELECT * FROM orders LIMIT 10" }
 * looks up vars.db_host / db_port / db_user / db_pass / db_database.
 * `engine` is "postgres" or "mysql" (default "postgres" — arbitrary but
 * documented; a user must set it explicitly for MySQL).
 */
import { resolveTemplate } from "../templateEngine.js";
import { runPostgresQuery } from "./postgresProtocol.js";
import { runMysqlQuery } from "./mysqlProtocol.js";

export async function runDatabaseNode(config, templateContext) {
  const prefix = config.varPrefix || "db";
  const vars = templateContext.vars || {};
  const host = vars[`${prefix}_host`];
  const port = vars[`${prefix}_port`] ? Number(vars[`${prefix}_port`]) : undefined;
  const user = vars[`${prefix}_user`];
  const password = vars[`${prefix}_pass`];
  const database = vars[`${prefix}_database`];

  if (!host) {
    return {
      ok: false,
      error: `No database host configured. Set workflow variables "${prefix}_host", "${prefix}_user", "${prefix}_pass", "${prefix}_database" (and optionally "${prefix}_port") — see README.md's "mysql (Postgres/MySQL)" node section.`,
    };
  }

  const query = resolveTemplate(String(config.query ?? ""), templateContext);
  if (!query.trim()) {
    return { ok: false, error: "This node's config needs a non-empty 'query' field." };
  }

  const engine = (config.engine || "postgres").toLowerCase();

  if (engine === "postgres" || engine === "postgresql" || engine === "pg") {
    const result = await runPostgresQuery({ host, port: port || 5432, user, password, database, query });
    if (!result.ok) return result;
    return { ok: true, result: { rows: result.rows, rowCount: result.rowCount, affected: result.rowCount } };
  }

  if (engine === "mysql" || engine === "mariadb") {
    const result = await runMysqlQuery({ host, port: port || 3306, user, password, database, query });
    if (!result.ok) return result;
    return { ok: true, result: { rows: result.rows, rowCount: result.rowCount, affected: result.rowCount } };
  }

  return { ok: false, error: `Unknown database engine "${engine}" — set config.engine to "postgres" or "mysql".` };
}
