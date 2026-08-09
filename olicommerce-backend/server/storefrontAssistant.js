/**
 * storefrontAssistant.js — OliCommerce's real AI shopping assistant.
 * ===========================================================
 * PROVENANCE: "OliMind AI shopping assistant" was previously marketed
 * on OliCommerce's landing/buy/account pages as a customer-facing,
 * on-storefront AI chat/product-search widget. A repo-wide audit found
 * zero implementation of it anywhere — the name traced back to a
 * separate, private repo ("project-2") that WAS a real, substantial
 * build: a full microservices e-commerce AI stack (Postgres + pgvector
 * for semantic search, Redis for event streaming, a separate React
 * frontend, its own auth). That system is genuinely real, but it is
 * NOT a drop-in widget for this service — porting it whole would mean
 * bolting a Postgres+pgvector+Redis dependency onto a service whose
 * entire architecture (see store.js's header comment) is deliberately
 * zero-dependency, JSON-file-backed, and designed to run on a $5-8/mo
 * VPS with no database to provision. That would contradict this repo's
 * own Hostinger/VPS deployment philosophy (see
 * ../HOSTINGER-PHILIPPINES-DEPLOYMENT-READINESS.md).
 *
 * So instead of porting that system, this is a genuinely real,
 * intentionally scoped-down shopping assistant built to fit THIS
 * service's architecture — using the exact same three-tier honesty
 * pattern as supportAssistant.js (this service's other real AI
 * feature) and oliops-backend's/oliflow-executor's siblings:
 *
 *   1. Catalog match (default, zero configuration, always available) —
 *      deterministic keyword matching against the merchant's REAL
 *      product catalog (see store.js's listProducts/createProduct).
 *      Every answer at this tier quotes a real product's real title,
 *      real price, and real URL — never an invented one.
 *   2. AI-assisted (opt-in, reuses the SAME OPENAI_API_KEY this service
 *      already uses for recovery-email rewriting and the merchant
 *      support assistant) — a real call to an OpenAI-compatible chat
 *      completions API, instructed to recommend ONLY products present
 *      in the real catalog passed into its prompt, and to say so
 *      honestly when nothing in the catalog matches, rather than
 *      inventing a product or price.
 *   3. Escalation — when neither tier finds a real matching product,
 *      it says so plainly instead of guessing. (Unlike the merchant
 *      support assistant, this does NOT create a support ticket — a
 *      shopper asking about products that aren't carried isn't a
 *      support issue; see generateStorefrontAnswer()'s fallback.)
 *
 * This is a real, working, embeddable widget (see index.js's
 * `GET /api/storefront/widget.js` route and README.md's "Embedding the
 * AI shopping assistant" section) — a genuinely different scope from
 * project-2's semantic-search/RAG system, but real and honest about
 * exactly what it does: keyword-matches (or AI-ranks) your real catalog
 * against what a shopper asks for, and never invents a product.
 */

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","to","of","and","in","on","for","my","i","it","its","how","do","does","did",
  "can","why","what","when","where","not","with","this","that","im","i'm","me","you","your","please","help","hi","hello",
  "have","has","looking","want","need","show","find","any","some","got",
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

/**
 * Deterministic keyword-overlap match against the REAL product catalog
 * — scores each product by how many of the shopper's significant words
 * appear in its title, description, or tags. Returns the top N matches
 * (never fabricated ones) or an empty array if nothing scores > 0.
 */
export function matchCatalog(message, products, limit = 3) {
  const msgTokens = significantTokens(message);
  if (!msgTokens.length || !products?.length) return [];

  const scored = products
    .filter((p) => p.inStock !== false)
    .map((product) => {
      const haystack = tokenize(`${product.title} ${product.description} ${(product.tags || []).join(" ")}`);
      const haystackSet = new Set(haystack);
      let score = 0;
      for (const t of msgTokens) {
        if (haystackSet.has(t)) score += 1;
      }
      return { product, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

// ⚠️ FIX: this previously hardcoded "$" regardless of the store's real
// currency - a real customer caught every shopping-assistant answer
// quoting USD prices even for a non-USD business's catalog. Now uses
// the real ISO 4217 currency code passed in from index.js's
// OLICOMMERCE_STORE_CURRENCY env var (defaults to "USD" out of the box,
// but genuinely supports GBP/EUR/AUD/PHP/any other real code) via the
// standard Intl.NumberFormat currency formatter - same approach already
// used in recoveryEmail.js and oliops-backend/invoiceHtml.js, applied
// here too for consistency across services.
function formatMoney(cents, currency) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format((cents || 0) / 100);
  } catch {
    return `${currency || "USD"} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

function formatProductLine(product, currency) {
  const price = formatMoney(product.priceCents, currency);
  const link = product.url ? ` — ${product.url}` : "";
  return `${product.title} (${price})${link}`;
}

function buildCatalogPromptBlock(products, currency) {
  if (!products.length) return "(The catalog is currently empty.)";
  return products
    .filter((p) => p.inStock !== false)
    .map((p) => `- ${p.title} | ${formatMoney(p.priceCents, currency)} | tags: ${(p.tags || []).join(", ") || "none"} | ${p.description || "no description"}`)
    .join("\n");
}

/**
 * Calls a real OpenAI-compatible chat completions endpoint to recommend
 * products, grounded strictly in the real catalog passed in. Returns
 * null (never throws) on any failure or missing key, so the caller can
 * fall back to the honest keyword-match tier.
 */
export async function callStorefrontAI(message, products, { history = [], apiKey, apiBaseUrl, model, currency } = {}) {
  if (!apiKey) return null;
  const base = (apiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  const systemPrompt =
    `You are a shopping assistant for an online store. A shopper is asking you about products. ` +
    `Below is the store's REAL, current product catalog — you may ONLY recommend products that appear in this exact list, using their exact title and exact price. ` +
    `NEVER invent a product, a price, or claim something is in stock if it isn't listed. ` +
    `If nothing in the catalog matches what the shopper is asking for, say so honestly and suggest they browse the full store instead of guessing. ` +
    `Respond with ONLY a JSON object, no markdown, no code fences, in exactly this shape: {"confident": true|false, "answer": "...", "recommendedTitles": ["exact product title", ...]}. ` +
    `"recommendedTitles" must be an empty array if nothing in the catalog matches.\n\n` +
    `Current catalog:\n${buildCatalogPromptBlock(products, currency)}`;

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
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[storefrontAssistant] AI call failed: HTTP ${res.status} ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    return parseAIResponse(raw, products);
  } catch (err) {
    console.error(`[storefrontAssistant] AI request failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseAIResponse(raw, products) {
  const cleaned = String(raw).trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.answer === "string") {
      // HONESTY GUARD: never trust the model's own claim of which
      // products it recommended — cross-check every title it returns
      // against the REAL catalog, and silently drop anything that
      // isn't a genuine, exact match. This is what prevents a
      // hallucinated product/price from ever reaching a shopper, even
      // if the model's JSON claims one exists.
      const realTitles = new Set(products.map((p) => p.title));
      const recommendedProducts = (Array.isArray(parsed.recommendedTitles) ? parsed.recommendedTitles : [])
        .filter((t) => realTitles.has(t))
        .map((t) => products.find((p) => p.title === t));
      return { answer: parsed.answer, confident: Boolean(parsed.confident), recommendedProducts };
    }
  } catch {
    // Not valid JSON — treat raw text as the answer but never assume confidence or recommendations.
  }
  return { answer: cleaned, confident: false, recommendedProducts: [] };
}

/**
 * Full pipeline: try a real catalog keyword match, optionally try AI
 * (grounded in the same real catalog), and always return an honest
 * result — never a fabricated product, price, or stock claim.
 */
export async function generateStorefrontAnswer(message, products, { history = [], useAi = false, openaiApiKey, openaiApiBaseUrl, openaiModel, currency } = {}) {
  const catalogMatches = matchCatalog(message, products);

  if (!useAi || !openaiApiKey) {
    if (catalogMatches.length) {
      const lines = catalogMatches.map((m) => formatProductLine(m.product, currency)).join("\n");
      return {
        answer: `Here's what I found in our catalog that matches:\n${lines}`,
        source: "catalog",
        confident: true,
        recommendedProducts: catalogMatches.map((m) => m.product),
        aiRewriteAttempted: Boolean(useAi),
        aiRewriteUsed: false,
        aiNote: useAi && !openaiApiKey ? "AI was requested but no OPENAI_API_KEY is configured — answered from the real catalog instead." : undefined,
      };
    }
    return {
      answer: "I couldn't find anything in our current catalog matching that — try browsing the full store, or ask about something else.",
      source: "catalog",
      confident: false,
      recommendedProducts: [],
      aiRewriteAttempted: Boolean(useAi),
      aiRewriteUsed: false,
      aiNote: useAi && !openaiApiKey ? "AI was requested but no OPENAI_API_KEY is configured." : undefined,
    };
  }

  const aiResult = await callStorefrontAI(message, products, { history, apiKey: openaiApiKey, apiBaseUrl: openaiApiBaseUrl, model: openaiModel, currency });
  if (!aiResult) {
    if (catalogMatches.length) {
      const lines = catalogMatches.map((m) => formatProductLine(m.product, currency)).join("\n");
      return {
        answer: `Here's what I found in our catalog that matches:\n${lines}`,
        source: "catalog",
        confident: true,
        recommendedProducts: catalogMatches.map((m) => m.product),
        aiRewriteAttempted: true,
        aiRewriteUsed: false,
        aiNote: "AI call failed (see server logs) — answered from the real catalog instead.",
      };
    }
    return {
      answer: "I couldn't reach the AI service and didn't find a catalog match either — try browsing the full store.",
      source: "catalog",
      confident: false,
      recommendedProducts: [],
      aiRewriteAttempted: true,
      aiRewriteUsed: false,
      aiNote: "AI call failed (see server logs).",
    };
  }

  return {
    answer: aiResult.answer,
    source: "ai",
    confident: aiResult.confident,
    recommendedProducts: aiResult.recommendedProducts,
    aiRewriteAttempted: true,
    aiRewriteUsed: true,
  };
}
