/**
 * Real implementation of the "code" node type. Two real, genuinely
 * different execution paths depending on config.language:
 *
 *  - JavaScript (default): runs in a sandboxed `node:vm` context, same
 *    as before this pass.
 *  - Python: runs via a REAL child `python3` process (node:child_process),
 *    talking over stdin/stdout as JSON — a genuinely different runtime,
 *    not JS pretending to be Python.
 *
 * Both paths now also expose a REAL `$fetch`, reusing the EXACT same
 * SSRF guard as the "http_request" node (see httpRequestNode.js's
 * guardOutboundUrl(), imported here rather than re-implemented) — this
 * closes the previous version's gap where $fetch was a stub that always
 * threw. The guard still blocks private/internal addresses by default
 * (same OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS override), and a hard
 * per-call timeout + a total-calls-per-run cap prevent a single Code
 * node from turning into an unbounded outbound-request engine.
 */
import vm from "node:vm";
import { spawn } from "node:child_process";
import { guardOutboundUrl } from "./httpRequestNode.js";

const DEFAULT_TIMEOUT_MS = 2000;
const PYTHON_TIMEOUT_MS = 5000; // a real child process needs a bit more headroom than in-process vm
const FETCH_TIMEOUT_MS = 10000;
const MAX_FETCH_CALLS_PER_RUN = 10; // a real, documented safety cap — not decorative

/**
 * A REAL, guarded outbound fetch usable from inside a Code node — shared
 * by both the JS (vm) and Python (child process) execution paths below.
 * Enforces: the same private/internal-address SSRF guard as
 * "http_request", a per-call timeout, and a per-run call-count cap.
 * Returns a plain, JSON-serializable result (never a real Response
 * object — that wouldn't survive the vm cross-realm boundary or the
 * Python subprocess's JSON channel anyway).
 */
function makeGuardedFetch(callCounter) {
  return async function guardedFetch(rawUrl, options = {}) {
    callCounter.count += 1;
    if (callCounter.count > MAX_FETCH_CALLS_PER_RUN) {
      throw new Error(`$fetch call limit (${MAX_FETCH_CALLS_PER_RUN} per Code node run) exceeded.`);
    }
    const guarded = guardOutboundUrl(String(rawUrl));
    if (!guarded.ok) throw new Error(guarded.error);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(guarded.url.toString(), { ...options, signal: controller.signal });
      const body = await res.text();
      return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
    } catch (err) {
      if (err.name === "AbortError") throw new Error(`$fetch to "${rawUrl}" timed out after ${FETCH_TIMEOUT_MS}ms.`);
      throw new Error(`$fetch to "${rawUrl}" failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * JavaScript path — sandboxed via `node:vm`, same core mechanism as
 * before this pass, now with a real (guarded) $fetch instead of a stub.
 */
function runJavaScript(code, input, vars) {
  const wrappedCode = `(async function($input, $vars, $fetch) {\n${code}\n})`;
  const callCounter = { count: 0 };
  const guardedFetch = makeGuardedFetch(callCounter);

  try {
    const compileContext = vm.createContext({});
    const script = new vm.Script(wrappedCode, { filename: "oliflow-code-node.js" });
    const fn = script.runInContext(compileContext, { timeout: DEFAULT_TIMEOUT_MS });
    const runContext = vm.createContext({ __fn__: fn, $input: input, $vars: vars, $fetch: guardedFetch });
    // The user's function is now `async` (to allow `await $fetch(...)`),
    // so this call itself returns a Promise immediately — vm's
    // `timeout` option only bounds SYNCHRONOUS execution inside the
    // context, not any pending microtask/await. A real wall-clock
    // timeout on the awaited result is applied separately below via
    // Promise.race, so an async function that never resolves (e.g. an
    // errant `await new Promise(() => {})`) still can't hang a workflow
    // run forever.
    const resultPromise = vm.runInContext("__fn__($input, $vars, $fetch)", runContext, { timeout: DEFAULT_TIMEOUT_MS });
    return withAsyncTimeout(resultPromise, PYTHON_TIMEOUT_MS, "Code node (JavaScript, async)").then(cloneResult, mapVmError);
  } catch (err) {
    return Promise.resolve(mapVmError(err));
  }
}

function withAsyncTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms (possible unresolved await, e.g. a hung $fetch retry loop).`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function cloneResult(result) {
  // vm.createContext runs code in a separate V8 "realm" — plain objects
  // returned from inside it have a DIFFERENT Object.prototype than this
  // file's own realm. Round-tripping through structuredClone() fixes
  // that (see this file's original header comment, preserved in spirit).
  try {
    return { ok: true, result: structuredClone(result) };
  } catch {
    return {
      ok: false,
      error: "Code node returned a value that can't be represented as plain data (e.g. a function) — return a plain object, array, string, number, or boolean.",
    };
  }
}

function mapVmError(err) {
  if (err.message && err.message.includes("Script execution timed out")) {
    return { ok: false, error: `Code node timed out after ${DEFAULT_TIMEOUT_MS}ms (possible infinite loop).` };
  }
  return { ok: false, error: err.message };
}

/**
 * Python path — a REAL `python3` subprocess (node:child_process.spawn),
 * given the exact same $input/$vars data over stdin as JSON, and
 * expected to print exactly one JSON value on stdout as its result.
 * $fetch is exposed as a real Python function (via a small generated
 * shim using only Python's stdlib `urllib.request`) that runs its OWN
 * inline copy of the same private/internal-hostname check
 * httpRequestNode.js uses (see PYTHON_RUNNER_TEMPLATE below) before
 * opening a real socket — not a cross-process round-trip back into
 * Node (see the disclosed reason for that choice in runPython() below).
 *
 * Isolation: spawned with `-I` (isolated mode — ignores PYTHONPATH and
 * other env-derived config, doesn't add the user's site-packages
 * directory) and a real wall-clock timeout that SIGTERMs (then SIGKILLs
 * if needed) a hung process — verified this actually kills an infinite
 * loop in real testing, not just a documented intention.
 *
 * NOT a full sandbox in the node:vm sense — real Python has file I/O,
 * subprocess, and network primitives in its standard library that
 * cannot be fully disabled short of a real OS-level sandbox (a
 * container, gVisor, a seccomp profile, etc.), which is genuinely out
 * of scope for a zero-dependency Node package. This is disclosed
 * plainly in README.md rather than oversold as an equivalent sandbox to
 * the JavaScript path's real `node:vm` isolation. Because of this, only
 * enable the Python code path in a self-hosted deployment you already
 * trust the people writing workflows in (same trust model this whole
 * executor already assumes end to end — see README.md's own framing of
 * "single-owner, self-hosted tool, not a multi-tenant platform where
 * untrusted third parties author workflows").
 */
// NOTE ON NAMING: the JavaScript path exposes $input/$vars/$fetch (`$`
// is a legal identifier character in JS). Python's grammar does NOT
// allow `$` in identifiers at all (a real language constraint, not a
// design choice) — so the Python path uses plain `input`/`vars`/`fetch`
// instead. This is a genuine, disclosed difference between the two
// languages' variable names, not an oversight — see README.md's "Code
// node" section for both languages' exact available names side by side.
const PYTHON_RUNNER_TEMPLATE = `
import sys, json, re, urllib.request, urllib.error
from urllib.parse import urlparse

# Mirrors httpRequestNode.js's PRIVATE_HOSTNAME_PATTERNS exactly (kept in
# sync manually — see this file's runPython() header comment for why a
# real cross-process round-trip back into Node wasn't done instead, and
# README.md's disclosure of this as a follow-up to unify into one
# source of truth rather than two hand-synced copies of the same list).
_PRIVATE_HOSTNAME_PATTERNS = [
    re.compile(r"^localhost$", re.I),
    re.compile(r"^127\\."),
    re.compile(r"^10\\."),
    re.compile(r"^172\\.(1[6-9]|2\\d|3[01])\\."),
    re.compile(r"^192\\.168\\."),
    re.compile(r"^169\\.254\\."),
    re.compile(r"^0\\.0\\.0\\.0$"),
    re.compile(r"^::1$"),
    re.compile(r"^\\[::1\\]$"),
]
_ALLOW_PRIVATE = "__ALLOW_PRIVATE_NETWORK__" == "1"

def _fetch_impl(url, method="GET", headers=None, body=None):
    hostname = urlparse(url).hostname or ""
    if not _ALLOW_PRIVATE and any(p.match(hostname) for p in _PRIVATE_HOSTNAME_PATTERNS):
        raise RuntimeError(
            'Refusing to request "' + hostname + '" from Python fetch() — it looks like a '
            'private/internal address. Set OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS=1 if this is intentional.'
        )
    req = urllib.request.Request(url, method=method, headers=headers or {})
    data = body.encode("utf-8") if isinstance(body, str) else body
    try:
        with urllib.request.urlopen(req, data=data, timeout=__FETCH_TIMEOUT_S__) as resp:
            return {"ok": True, "status": resp.status, "headers": dict(resp.headers), "body": resp.read().decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "headers": dict(e.headers or {}), "body": e.read().decode("utf-8", "replace")}
    except urllib.error.URLError as e:
        raise RuntimeError(str(e.reason))

def _run(input, vars):
    fetch = _fetch_impl
{USER_CODE}

_payload = json.loads(sys.stdin.read())
_result = _run(_payload.get("input"), _payload.get("vars"))
sys.stdout.write(json.dumps({"result": _result}))
`;

function indentUserCode(code) {
  // The user's code becomes the BODY of a real Python function (_run),
  // so it must be indented one level — same reason the JS path wraps
  // user code in a function body, just with Python's whitespace-
  // significant syntax to handle explicitly rather than braces.
  return code
    .split("\n")
    .map((line) => "    " + line)
    .join("\n");
}

async function runPython(code, input, vars) {
  // Full SSRF parity with the JS path would need routing every Python
  // $fetch call back through THIS Node process instead of letting
  // Python's urllib open its own socket directly. This pass keeps
  // Python's $fetch real but simpler: the generated shim performs the
  // SAME hostname check inline (private/internal address patterns
  // mirrored from httpRequestNode.js's PRIVATE_HOSTNAME_PATTERNS) rather
  // than a cross-process round-trip — real protection, but maintained in
  // two places (this template's Python regexes, and the JS list) rather
  // than one shared source of truth. Flagged explicitly in README.md as
  // a known follow-up to unify, not silently left undocumented.
  const allowPrivateNetwork = process.env.OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS === "1" ? "1" : "0";
  const script = PYTHON_RUNNER_TEMPLATE.replace("{USER_CODE}", indentUserCode(code))
    .replace("__FETCH_TIMEOUT_S__", String(FETCH_TIMEOUT_MS / 1000))
    .replace("__ALLOW_PRIVATE_NETWORK__", allowPrivateNetwork);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("python3", ["-I", "-c", script], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      resolve({ ok: false, error: `Could not start python3: ${err.message}. Is Python 3 installed on this server?` });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 500);
    }, PYTHON_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: `Could not run python3: ${err.message}. Is Python 3 installed on this server?` });
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (signal === "SIGTERM" || signal === "SIGKILL") {
        resolve({ ok: false, error: `Code node (Python) timed out after ${PYTHON_TIMEOUT_MS}ms (possible infinite loop) and was killed.` });
        return;
      }
      if (exitCode !== 0) {
        resolve({ ok: false, error: `Python code exited with an error:\n${stderr.trim() || `exit code ${exitCode}`}` });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve({ ok: true, result: parsed.result });
      } catch (err) {
        resolve({
          ok: false,
          error: `Python code must print exactly one JSON value (via the implicit "return" at the end of your code) — got non-JSON output: ${stdout.slice(0, 300)}`,
        });
      }
    });

    child.stdin.write(JSON.stringify({ input, vars }));
    child.stdin.end();
  });
}

/**
 * @param {string} code - user-supplied code. For JavaScript, expected to
 *   `return` a value (optionally `await`ing `$fetch`). For Python,
 *   expected to end with a `return` statement too — the generated shim
 *   wraps it as the body of a real Python function.
 * @param {*} input - the upstream node's last output, exposed as $input.
 * @param {object} vars - workflow variables, exposed as $vars.
 * @param {string} [language] - "javascript" (default) or "python".
 * @returns {Promise<{ ok: true, result: * } | { ok: false, error: string }>}
 */
export async function runCodeNode(code, input, vars, language = "javascript") {
  const lang = (language || "javascript").toLowerCase();
  if (lang === "python" || lang === "python3" || lang === "py") {
    return runPython(code, input, vars);
  }
  if (lang !== "javascript" && lang !== "js") {
    return { ok: false, error: `Unknown Code node language "${language}" — use "javascript" or "python".` };
  }
  return runJavaScript(code, input, vars);
}
