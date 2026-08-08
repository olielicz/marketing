/**
 * supportAssistant.js — OliOps' real AI Support Assistant.
 * ===========================================================
 * This replaces the previous state of this feature (see README.md's old
 * "Explicit scope" note): an "AI support router" that was marketed but
 * never wired to a real language model. This IS that feature, built
 * honestly, following the exact pattern already used by
 * ../olicommerce-backend/server/recoveryEmail.js for its opt-in AI
 * rewrite: real calls to a real OpenAI-compatible endpoint when a real
 * API key is configured, and a real (non-AI) knowledge-base answer —
 * never a fabricated "AI" response — when it isn't.
 *
 * Three tiers, always honest about which one actually answered:
 *   1. Knowledge base match (default, zero configuration, always
 *      available) — deterministic keyword matching against a real,
 *      accurate FAQ grounded in this product's actual behavior (see
 *      KNOWLEDGE_BASE below, sourced from the same facts documented in
 *      README.md and the public /support/ troubleshooting page).
 *   2. AI-assisted (opt-in, requires OPENAI_API_KEY) — a real call to an
 *      OpenAI-compatible chat completions API (OpenAI itself, or a free
 *      OpenAI-compatible provider like Groq — see README.md's "Setting
 *      up the AI Support Assistant" section), instructed to answer
 *      ONLY from the same knowledge base, and to say so honestly when
 *      it isn't confident, rather than inventing an answer.
 *   3. Escalation — when neither of the above produces a confident
 *      answer, a real support ticket is created (see store.js's
 *      createSupportTicket()) instead of guessing. This matches the
 *      exact behavior already promised on the public support page:
 *      "escalates anything it's not confident about to a real support
 *      ticket automatically."
 *
 * ⚠️ HONESTY RULE, read before touching this file: generateSupportAnswer()
 * must never claim `source: "ai"` unless a real HTTP call to a real
 * OpenAI-compatible endpoint actually returned a real result, and must
 * never claim `confident: true` unless that confidence came from either
 * a real keyword-match score over the threshold or the AI model's own
 * stated confidence — never assumed.
 */

/* ------------------------------- Knowledge base ------------------------------- */
// Sourced from ../support/index.html's "General & Licensing" + "OliOps
// Suite" sections and this service's own README.md — real, accurate,
// already-published facts about how OliOps actually behaves. Keeping
// this list in sync with those two sources when either changes is the
// one maintenance rule for this file.
const KNOWLEDGE_BASE = [
  {
    id: "server-wont-start",
    question: "The server won't start or crashes on launch",
    keywords: ["server", "start", "crash", "crashes", "launch", "boot", "wont", "won't", "port", "eaddrinuse"],
    answer:
      "Check the terminal output for the actual error message — most startup failures print a clear reason (missing environment variable, port already in use, etc.). Confirm you're on Node 18+ (`node --version`). If the error mentions a port conflict, either stop whatever else is using it or change OliOps's PORT environment variable. If you just pulled an update, run `npm install` again before restarting.",
  },
  {
    id: "login-forgot-password",
    question: "I can't log in or forgot my password",
    keywords: ["login", "log", "password", "forgot", "signin", "sign", "locked", "lockout", "credentials"],
    answer:
      "Use the \"Forgot password\" link on the sign-in screen — this works on self-hosted instances as long as outbound email is configured. If you're the very first user on a brand-new install and never set a password, check your server console log from the very first boot: the initial admin credentials are printed there once by scripts/create-owner.js. After 5 failed attempts from the same IP, logins are locked out for a short window (OLIOPS_LOCKOUT_WINDOW_MINUTES) as a brute-force protection — that's expected, just wait it out.",
  },
  {
    id: "invoice-tax-wrong",
    question: "Invoice totals or tax look wrong",
    keywords: ["invoice", "invoices", "total", "tax", "wrong", "amount", "math", "price", "billing"],
    answer:
      "Invoice totals are computed as a real sum of quantity × unit price across every line item — there's no hidden rounding or tax logic applied automatically. If a total looks wrong, check the quantity and unit price on each line item first. Tax is not auto-calculated in this version; add it as its own line item if you need it itemized on the printed invoice.",
  },
  {
    id: "payroll-not-available",
    question: "Where is payroll / does OliOps do payroll",
    keywords: ["payroll", "salary", "wages", "employee", "employees", "withholding", "tax filing"],
    answer:
      "Payroll is intentionally not built into this version of OliOps. Real payroll requires tax withholding tables (federal + state, which change yearly), employer filings, and multi-state compliance — a regulated domain that shouldn't be half-built. If you need payroll, integrate a real payroll provider (Gusto, Check, etc.) alongside OliOps rather than expecting it natively.",
  },
  {
    id: "invoice-print",
    question: "How do I print or send an invoice as a PDF",
    keywords: ["print", "pdf", "invoice", "export", "download", "save"],
    answer:
      "Open the invoice and click \"Print\" — this opens a real printable HTML view (GET /api/invoices/:id/html) that any browser can print-to-PDF natively (Ctrl/Cmd+P → Save as PDF). There's no automated invoice-emailing built in yet; the printable view is meant to be saved/attached manually.",
  },
  {
    id: "cors-connect-backend",
    question: "The app can't reach my backend / CORS or network error",
    keywords: ["cors", "network", "connect", "backend", "unreachable", "fetch", "url", "reach"],
    answer:
      "Make sure the backend URL you entered under \"⚙ Configure server URL\" in the app has no trailing slash and includes the correct protocol (http/https). Confirm the backend's ALLOWED_ORIGIN environment variable permits the origin the app is served from (default `*` allows any origin, which is fine for a self-hosted single-owner tool). Then confirm the backend is actually reachable — try `curl <your-backend-url>/api/health` from the same network the app is loaded on.",
  },
  {
    id: "session-change-password",
    question: "How do I change my password or sign out other sessions",
    keywords: ["change", "password", "session", "sessions", "logout", "signout", "revoke"],
    answer:
      "Use the change-password flow in the app — it requires your current password and immediately revokes every other active session on success, not just the one you're using. There's no email-based password reset for the owner account since this is a single-owner system by design; if you're fully locked out, see the \"login / forgot password\" answer above.",
  },
  {
    id: "serial-invalid",
    question: "My serial code says invalid or won't activate",
    keywords: ["serial", "code", "license", "activate", "activation", "invalid", "key"],
    answer:
      "Double-check the whole code was copied, including all dashes (format OLI-XXX-YYYY-ZZZZ-C), with no trailing space. Confirm you're entering it into the matching product — an OLI-OPS- code only works for OliOps. Activation needs one successful check-in with the license server, after which it works offline for up to 14 days. Still stuck? A human can verify your code directly — this will be escalated as a support ticket.",
  },
  {
    id: "device-limit",
    question: "Device limit reached even though I haven't used 5 devices",
    keywords: ["device", "limit", "devices", "reached", "deactivate", "reinstall"],
    answer:
      "This usually means an old device is still registered — e.g. reinstalling on the same machine can register as a \"new\" device since the local device ID resets on a clean install. If you still have access to the old device, use \"Deactivate this device\" there first. If not, this needs a human to manually free up a slot — I'll escalate this as a support ticket.",
  },
  {
    id: "refund",
    question: "I want a refund or want to cancel",
    keywords: ["refund", "cancel", "money", "back", "trial", "guarantee"],
    answer:
      "Every Oli Tools subscription starts with a 14-day free trial — cancel during the trial and you're never charged. After your first paid charge, there's also a 30-day money-back guarantee. I'll escalate this to billing support so a human can process it with your order details.",
  },
  {
    id: "what-is-included",
    question: "What features does OliOps actually include",
    keywords: ["features", "include", "included", "scope", "what does", "capabilities"],
    answer:
      "This version of OliOps is real, working CRM + invoicing: contacts (full CRUD), tasks (linked to contacts, open/done), and invoices (real line-item math, sequential numbering, mark paid/unpaid, printable HTML). Payroll is not included (see the payroll answer above). This AI Support Assistant you're talking to now is the real, working version of the previously-marketed \"AI support router.\"",
  },
];

const CONFIDENT_THRESHOLD = 2; // minimum matched keywords to answer without AI or escalation
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

/** Deterministic keyword-overlap match against KNOWLEDGE_BASE — zero configuration, always available. */
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

/**
 * Calls a real OpenAI-compatible chat completions endpoint (OpenAI,
 * Groq, or any compatible provider) to answer a support question,
 * grounded strictly in KNOWLEDGE_BASE. Returns null (never throws) on
 * any failure or missing key, so the caller can fall back honestly.
 */
export async function callSupportAI(message, { history = [], apiKey, apiBaseUrl, model } = {}) {
  if (!apiKey) return null;
  const base = (apiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  const systemPrompt =
    `You are the OliOps Suite support assistant. OliOps Suite is a self-hosted CRM + invoicing tool for small businesses. ` +
    `Only help with questions about using or troubleshooting OliOps itself. ` +
    `Answer strictly using the knowledge base below — you may rephrase and combine entries, but never invent features, pricing, or behavior that isn't in the knowledge base. ` +
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
    // Not valid JSON — treat the raw text as the answer, but never assume
    // confidence we didn't actually get a signal for.
  }
  return { answer: cleaned, confident: false };
}

/**
 * Full pipeline: try the knowledge base, optionally try AI (grounded in
 * the same knowledge base), and always return an honest result — never
 * a fabricated "AI" answer, and never a false claim of confidence.
 */
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
