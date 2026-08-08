/**
 * supportAssistant.js — OliFlow's real AI Support Assistant.
 * ===========================================================
 * Same honest, three-tier pattern as ../oliops-backend/server/
 * supportAssistant.js and ../olicommerce-backend/server/
 * supportAssistant.js (the sibling implementations for the other two
 * self-hosted Oli tools). This is the real, working version of the
 * `openai` node type that this executor deliberately does NOT implement
 * as a generic workflow node (see README.md's node-type coverage table —
 * that's a genuinely separate piece of scope: a user-authored,
 * arbitrary-prompt workflow node vs. a fixed-purpose, grounded support
 * assistant built INTO the executor itself). Using a real AI call here
 * does not contradict that README's "no fake AI output, ever" principle
 * — it's the same principle, applied honestly: this only claims to have
 * used AI when it genuinely made a real HTTP call to a real
 * OpenAI-compatible endpoint, and always has a real, non-AI fallback.
 *
 * Three tiers, always honest about which one actually answered:
 *   1. Knowledge base match (default, zero configuration, always
 *      available) — deterministic keyword matching against a real,
 *      accurate FAQ grounded in this executor's actual, documented
 *      node-type coverage (see KNOWLEDGE_BASE below, sourced from
 *      README.md's "Node type coverage" table and "Known limitations").
 *   2. AI-assisted (opt-in, requires OPENAI_API_KEY) — a real call to an
 *      OpenAI-compatible chat completions API, instructed to answer
 *      ONLY from the knowledge base and to say so honestly when it
 *      isn't confident, rather than inventing an answer about what this
 *      executor can or can't do.
 *   3. Escalation — when neither tier is confident, a real support
 *      ticket is created (see store.js's createSupportTicket()) instead
 *      of guessing.
 */

const KNOWLEDGE_BASE = [
  {
    id: "workflow-not-triggering",
    question: "A workflow isn't triggering",
    keywords: ["workflow", "trigger", "triggering", "not", "run", "running", "wont", "won't"],
    answer:
      "Confirm the workflow is actually activated (Activate button in the app, not just saved). If it's webhook-triggered, confirm the caller is hitting the right webhook URL and that this executor's POST /api/execute endpoint has a real owner token in the Authorization header — requests without a valid admin-auth session (or the ADMIN_TOKEN break-glass fallback) are rejected with 401. Check the Execution Log for the specific per-node result — a real error is reported honestly, not silently swallowed.",
  },
  {
    id: "node-type-not-implemented",
    question: "A node type isn't working / shows not implemented",
    keywords: ["node", "not", "implemented", "openai", "slack", "stripe", "shopify", "schedule", "switch", "loop", "notion", "airtable", "twilio", "supabase", "whatsapp"],
    answer:
      "That's expected, not a bug — this executor only has real implementations for webhook (trigger), http_request, condition, delay, code, set_fields, set_variable/get_variable, log, respond_webhook, email_send, and note. Everything else (schedule, openai, slack, stripe, shopify, and about 20 other node types) is honestly reported as 'not implemented' rather than faked, because it needs real third-party OAuth/API credentials this pass didn't build. See README.md's 'Node type coverage' table for the full, current list.",
  },
  {
    id: "http-request-blocked",
    question: "My http_request node is being refused or blocked",
    keywords: ["http_request", "ssrf", "blocked", "refusing", "private", "localhost", "internal"],
    answer:
      "By default this executor refuses http_request calls to private/internal-looking addresses (localhost, 127.0.0.1, 10.x, 192.168.x, 169.254.x, etc.) as an SSRF guard against typos or copy-pasted templates accidentally hitting something like cloud instance metadata. If you deliberately need to call an internal service, set OLIFLOW_ALLOW_PRIVATE_NETWORK_REQUESTS=1 in your environment.",
  },
  {
    id: "email-send-not-configured",
    question: "email_send node fails or says SMTP not configured",
    keywords: ["email_send", "smtp", "email", "sending", "credentials"],
    answer:
      "SMTP credentials are NOT stored in the node's own config (they're secrets) — set them as workflow VARIABLES instead: smtp_host, smtp_port, smtp_user, smtp_pass (and optionally smtp_reject_unauthorized=false only for a self-hosted server with a self-signed cert). Every email_send node in that workflow reuses these automatically. See README.md's 'Setting up email sending' section.",
  },
  {
    id: "401-unauthorized",
    question: "POST /api/execute returns 401 unauthorized",
    keywords: ["401", "unauthorized", "auth", "token", "admin"],
    answer:
      "This executor requires a real owner session token from admin-auth (set OLI_ADMIN_AUTH_URL to point at a running admin-auth server, then get a token via its POST /api/login) in the Authorization: Bearer header. If admin-auth isn't deployed, an ADMIN_TOKEN break-glass fallback env var also works, but isn't recommended for routine use. A 401 means the token is missing, expired, or was revoked — reconnect via the app's '⚙ Connect Backend' button.",
  },
  {
    id: "delay-capped",
    question: "A delay node isn't waiting as long as configured",
    keywords: ["delay", "wait", "cap", "capped", "minutes", "timeout"],
    answer:
      "delay nodes are capped at 5 minutes per synchronous run — a single HTTP request holding a connection open for hours isn't a viable architecture. A longer delay would need real scheduling infrastructure (a queue that resumes the workflow later), which this pass didn't build.",
  },
  {
    id: "code-node-fetch",
    question: "The code node's $fetch isn't working",
    keywords: ["code", "fetch", "$fetch", "sandbox"],
    answer:
      "$fetch inside the code node is deliberately not implemented — arbitrary user code making outbound HTTP calls from inside a sandboxed VM is a real SSRF risk, treated as a separate security decision rather than an oversight. Use a dedicated http_request node instead for real outbound calls.",
  },
  {
    id: "simulated-vs-real",
    question: "How do I know if my workflow actually ran for real or was simulated",
    keywords: ["simulated", "simulation", "real", "fake", "sim"],
    answer:
      "The app's Execution Log shows a '🧪 SIMULATED' badge and banner when running the built-in preview engine (setTimeout + Math.random(), no real integrations called). Once you click '⚙ Connect Backend' and enter a real executor URL + owner token, 'Run' calls this real executor instead — real results are logged with '(real)' in the log line, and any node this executor can't yet implement is shown as '⚪ Not implemented yet' rather than a fake green checkmark.",
  },
  {
    id: "refund",
    question: "I want a refund or want to cancel",
    keywords: ["refund", "cancel", "money", "back", "trial", "guarantee"],
    answer:
      "Every Oli Tools subscription starts with a 14-day free trial — cancel during the trial and you're never charged. After your first paid charge, there's also a 30-day money-back guarantee. I'll escalate this to billing support so a human can process it with your order details.",
  },
];

const CONFIDENT_THRESHOLD = 2;
const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","to","of","and","in","on","for","my","i","it","its","how","do","does","did",
  "can","why","what","when","where","not","with","this","that","im","i'm","me","you","your","please","help","hi","hello",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function significantTokens(text) {
  return tokenize(text).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

export function matchKnowledgeBase(message) {
  const msgTokens = new Set(significantTokens(message));
  if (!msgTokens.size) return null;
  let best = null;
  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (msgTokens.has(kw)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}

function buildKbPromptBlock() {
  return KNOWLEDGE_BASE.map((e, i) => `${i + 1}. Q: ${e.question}\n   A: ${e.answer}`).join("\n");
}

export async function callSupportAI(message, { history = [], apiKey, apiBaseUrl, model } = {}) {
  if (!apiKey) return null;
  const base = (apiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  const systemPrompt =
    `You are the OliFlow support assistant. OliFlow is a self-hosted visual workflow automation engine (like a smaller Zapier/n8n). ` +
    `Only help with questions about using or troubleshooting OliFlow itself. ` +
    `Answer strictly using the knowledge base below — you may rephrase and combine entries, but never invent node types, features, or behavior that isn't in the knowledge base. ` +
    `Respond with ONLY a JSON object, no markdown, no code fences, in exactly this shape: {"confident": true|false, "answer": "..."}. ` +
    `Set "confident" to false (and write a short, honest note that a human will follow up) if the knowledge base doesn't cover the question, or you're not sure.\n\n` +
    `Knowledge base:\n${buildKbPromptBlock()}`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: model || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-6).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", content: String(h.content || "").slice(0, 2000) })),
          { role: "user", content: String(message || "").slice(0, 2000) },
        ],
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[supportAssistant] AI call failed: HTTP ${res.status} ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    return parseAIResponse(raw);
  } catch (err) {
    console.error(`[supportAssistant] AI request failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseAIResponse(raw) {
  const cleaned = String(raw).trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.answer === "string") {
      return { answer: parsed.answer, confident: Boolean(parsed.confident) };
    }
  } catch {
    // Not valid JSON — treat raw text as the answer but never assume confidence.
  }
  return { answer: cleaned, confident: false };
}

export async function generateSupportAnswer(message, { history = [], useAi = false, openaiApiKey, openaiApiBaseUrl, openaiModel } = {}) {
  const kbMatch = matchKnowledgeBase(message);
  const kbConfident = Boolean(kbMatch && kbMatch.score >= CONFIDENT_THRESHOLD);

  if (!useAi) {
    if (kbConfident) {
      return {
        answer: kbMatch.entry.answer,
        source: "knowledge_base",
        matchedQuestion: kbMatch.entry.question,
        confident: true,
        shouldEscalate: false,
        aiRewriteAttempted: false,
        aiRewriteUsed: false,
      };
    }
    return {
      answer: "I don't have a confident answer to that from the knowledge base yet — I'm creating a support ticket so a real person can help.",
      source: "fallback",
      confident: false,
      shouldEscalate: true,
      aiRewriteAttempted: false,
      aiRewriteUsed: false,
    };
  }

  if (!openaiApiKey) {
    if (kbConfident) {
      return {
        answer: kbMatch.entry.answer,
        source: "knowledge_base",
        matchedQuestion: kbMatch.entry.question,
        confident: true,
        shouldEscalate: false,
        aiRewriteAttempted: true,
        aiRewriteUsed: false,
        aiNote: "AI was requested but no OPENAI_API_KEY is configured — answered from the knowledge base instead.",
      };
    }
    return {
      answer: "I don't have a confident answer to that from the knowledge base, and AI isn't configured on this server yet — I'm creating a support ticket so a real person can help.",
      source: "fallback",
      confident: false,
      shouldEscalate: true,
      aiRewriteAttempted: true,
      aiRewriteUsed: false,
      aiNote: "AI was requested but no OPENAI_API_KEY is configured.",
    };
  }

  const aiResult = await callSupportAI(message, { history, apiKey: openaiApiKey, apiBaseUrl: openaiApiBaseUrl, model: openaiModel });
  if (!aiResult) {
    if (kbConfident) {
      return {
        answer: kbMatch.entry.answer,
        source: "knowledge_base",
        matchedQuestion: kbMatch.entry.question,
        confident: true,
        shouldEscalate: false,
        aiRewriteAttempted: true,
        aiRewriteUsed: false,
        aiNote: "AI call failed (see server logs) — answered from the knowledge base instead.",
      };
    }
    return {
      answer: "I couldn't reach the AI service and don't have a confident knowledge-base answer either — I'm creating a support ticket so a real person can help.",
      source: "fallback",
      confident: false,
      shouldEscalate: true,
      aiRewriteAttempted: true,
      aiRewriteUsed: false,
      aiNote: "AI call failed (see server logs).",
    };
  }

  return {
    answer: aiResult.answer,
    source: "ai",
    confident: aiResult.confident,
    shouldEscalate: !aiResult.confident,
    aiRewriteAttempted: true,
    aiRewriteUsed: true,
  };
}

export { KNOWLEDGE_BASE, CONFIDENT_THRESHOLD };
