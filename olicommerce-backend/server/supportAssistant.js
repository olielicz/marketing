/**
 * supportAssistant.js — OliCommerce's real AI Support Assistant.
 * ===========================================================
 * Same three-tier, honest pattern already used elsewhere in this repo:
 * ../oliops-backend/server/supportAssistant.js (the sibling
 * implementation for OliOps) and this same service's own
 * recoveryEmail.js (the existing, honest, opt-in AI-rewrite feature for
 * cart-recovery emails). Read recoveryEmail.js's header comment for the
 * honesty rule this follows — it applies identically here.
 *
 * Three tiers, always honest about which one actually answered:
 *   1. Knowledge base match (default, zero configuration, always
 *      available) — deterministic keyword matching against a real,
 *      accurate FAQ grounded in OliCommerce's actual, documented
 *      behavior (see KNOWLEDGE_BASE below, sourced from README.md and
 *      the public /support/ troubleshooting page).
 *   2. AI-assisted (opt-in, reuses the SAME OPENAI_API_KEY this service
 *      already uses for recovery-email rewriting) — a real call to an
 *      OpenAI-compatible chat completions API, instructed to answer
 *      ONLY from the knowledge base and to say so honestly when it
 *      isn't confident, rather than inventing an answer.
 *   3. Escalation — when neither tier is confident, a real support
 *      ticket is created (see store.js's createSupportTicket()) instead
 *      of guessing.
 */

const KNOWLEDGE_BASE = [
  {
    id: "abandoned-cart-emails-not-sending",
    question: "Abandoned cart emails aren't sending",
    keywords: ["abandoned", "cart", "email", "emails", "sending", "recovery", "not", "sent"],
    answer:
      "Confirm your storefront's abandoned-checkout webhook is registered and pointed at POST /api/webhooks/cart-abandoned on this backend — a missing or misconfigured webhook is the most common cause. Then check your SMTP configuration (SMTP_HOST/PORT/USER/PASS in your .env) — recovery emails fail silently if those credentials are wrong or expired. Check your server logs around the time a cart should have triggered a recovery email for the specific error.",
  },
  {
    id: "webhook-setup",
    question: "How do I connect my storefront's abandoned-cart webhook",
    keywords: ["webhook", "shopify", "woocommerce", "connect", "storefront", "checkout", "setup"],
    answer:
      "Point your storefront's abandoned-checkout webhook at POST /api/webhooks/cart-abandoned with an externalId (your platform's own cart/checkout id, required for de-duplication). For Shopify, use the checkouts/update webhook topic and map checkout.token to externalId. WooCommerce has no built-in abandoned-cart webhook — you'll need a small plugin/snippet to detect abandonment and POST here yourself. See README.md's 'Connecting your storefront' section for the exact payload shape.",
  },
  {
    id: "ai-rewrite-not-working",
    question: "The AI email rewrite isn't working or always sends the plain template",
    keywords: ["ai", "rewrite", "openai", "assistant", "shopping", "not working", "always"],
    answer:
      "AI-rewritten recovery emails require a real OPENAI_API_KEY set in your .env — without one, every email honestly uses the real, working plain template instead (never a fabricated 'AI' result). If you've set a key and it's still using the plain template, check your server logs for the specific AI call failure (bad key, network error, rate limit) — the system automatically and honestly falls back to the plain template on any failure rather than blocking the send.",
  },
  {
    id: "storefront-widget-not-showing",
    question: "The AI shopping assistant widget isn't showing on my storefront",
    keywords: ["widget", "embed", "storefront", "showing", "theme", "assistant"],
    answer:
      "Confirm the embed script/widget snippet is correctly placed in your theme (usually the theme's footer or a dedicated app-embed block, depending on your Shopify theme). If you recently changed themes, re-add the embed — Shopify doesn't always carry app embeds across theme switches automatically.",
  },
  {
    id: "csv-forwarding",
    question: "Supplier CSV forwarding isn't working",
    keywords: ["csv", "supplier", "forwarding", "forward"],
    answer:
      "Check the destination email/endpoint configured for CSV forwarding — a typo there is the most common cause. Also confirm new orders are actually triggering the order-paid webhook, since CSV forwarding depends on the same underlying webhook mechanism as abandoned-cart capture.",
  },
  {
    id: "smtp-config",
    question: "How do I configure SMTP / recovery emails aren't sending",
    keywords: ["smtp", "gmail", "sendgrid", "mailgun", "email", "credentials", "config"],
    answer:
      "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in your .env — this works with Gmail (use an app-specific password), Sendgrid, Mailgun, Amazon SES's SMTP interface, or a self-hosted SMTP server. If you're using a self-hosted server with a self-signed certificate, set SMTP_REJECT_UNAUTHORIZED=false — leave this at the default (true) for any real provider.",
  },
  {
    id: "cart-not-appearing",
    question: "A cart isn't appearing in my dashboard",
    keywords: ["cart", "carts", "missing", "appearing", "dashboard", "not showing"],
    answer:
      "Carts only appear after your storefront's webhook actually fires an abandoned-checkout event to POST /api/webhooks/cart-abandoned. Confirm the webhook is registered on your storefront platform's side, and check this backend's logs for incoming requests to that endpoint around the time the cart should have appeared.",
  },
  {
    id: "duplicate-carts",
    question: "I'm seeing duplicate cart records",
    keywords: ["duplicate", "duplicates", "twice", "multiple"],
    answer:
      "Duplicates shouldn't happen — the system de-duplicates on your storefront platform's own externalId (cart/checkout id). If you're seeing real duplicates, check that your storefront is sending a stable, consistent externalId across repeated webhook fires for the same checkout (e.g. Shopify's checkout.token) rather than a new id each time.",
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
    question: "What does OliCommerce actually include",
    keywords: ["features", "include", "included", "scope", "what does", "capabilities"],
    answer:
      "This version of OliCommerce is real, working abandoned-cart recovery: a webhook to capture abandoned carts, a dashboard to track their status, and real recovery emails sent via SMTP — with an honest, optional AI rewrite when you configure an API key. It does not include browse-abandonment tracking (only cart/checkout abandonment) or automated multi-step drip sequences (one recovery email per trigger call, not a timed series). This AI Support Assistant is a separate, real feature answering questions about using OliCommerce itself.",
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
    `You are the OliCommerce support assistant. OliCommerce is a self-hosted Shopify/WooCommerce abandoned-cart recovery tool for small stores. ` +
    `Only help with questions about using or troubleshooting OliCommerce itself. ` +
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
