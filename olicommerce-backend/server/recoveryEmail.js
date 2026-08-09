/**
 * recoveryEmail.js
 * =================
 * Builds a cart-recovery email from a cart record. Two paths:
 *
 * 1. Plain template (default, always available, zero configuration) —
 *    a real, working, non-AI templated email listing the abandoned
 *    items and a link back to checkout.
 *
 * 2. AI-rewritten (opt-in, requires OPENAI_API_KEY) — sends the plain
 *    template's content to a real OpenAI-compatible chat completions
 *    API to rewrite it in a requested tone (friendly/urgent/discount).
 *
 * ⚠️ HONESTY RULE, read before touching this file: rewriteWithAI() must
 * NEVER fabricate an "AI-rewritten" result when no API key is
 * configured. If OPENAI_API_KEY is unset, callers MUST fall back to the
 * plain template and the response must clearly say so (see
 * `aiRewriteAttempted`/`aiRewriteUsed` in generateRecoveryEmail()'s
 * return value) — this mirrors the exact principle already applied to
 * OliFlow's `openai` node (see ../oliflow-executor/README.md's node
 * coverage table: not implemented rather than faked) and to OliOps'
 * "AI support router" (see ../oliops-backend/README.md's Scope
 * section: left out entirely rather than faked).
 */

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// ⚠️ FIX: the catch-fallback below still hardcoded "$" even though the
// function's own default parameter was already fixed to accept a real
// currency - if Intl.NumberFormat somehow threw (e.g. a malformed
// currency code slipped through), a shopper would still see a dollar
// sign regardless of the cart's real currency. Defaults to "USD" out
// of the box, consistent with storefrontAssistant.js and
// invoiceHtml.js — but genuinely supports any real ISO 4217 code the
// cart's own currency field (or OLICOMMERCE_STORE_CURRENCY) specifies.
function formatMoney(cents, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100); }
  catch { return `${currency || "USD"} ${((cents || 0) / 100).toFixed(2)}`; }
}

const TONE_COPY = {
  friendly: {
    subject: (storeName) => `You left something behind at ${storeName} 🛍️`,
    intro: "We noticed you left a few items in your cart. No rush — they're still waiting for you whenever you're ready!",
    cta: "Complete Your Order",
  },
  urgent: {
    subject: () => `Your cart is about to expire!`,
    intro: "Your cart is still saved, but items can sell out. Complete your order now before it's too late.",
    cta: "Checkout Now",
  },
  discount: {
    subject: (storeName) => `Here's 10% off to finish your order at ${storeName}`,
    intro: "As a thank-you for considering us, here's 10% off if you complete your order today. Use code COMEBACK10 at checkout.",
    cta: "Claim 10% Off & Checkout",
  },
};

/** Builds the plain (non-AI) template — always available, zero config. */
export function buildPlainTemplate(cart, { storeName = "our store", tone = "friendly" } = {}) {
  const copy = TONE_COPY[tone] || TONE_COPY.friendly;
  const itemLines = cart.items
    .map((item) => `<li>${item.quantity} × ${escapeHtml(item.title)} — ${formatMoney(item.priceCents * item.quantity, cart.currency)}</li>`)
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#14161a;">
<h2>${escapeHtml(copy.subject(storeName))}</h2>
<p>${escapeHtml(copy.intro)}</p>
<ul>${itemLines}</ul>
<p><strong>Total: ${formatMoney(cart.cartValueCents, cart.currency)}</strong></p>
<p><a href="${escapeHtml(cart.checkoutUrl || '#')}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">${escapeHtml(copy.cta)}</a></p>
</body></html>`;

  const text = `${copy.subject(storeName)}\n\n${copy.intro}\n\n${cart.items.map((i) => `${i.quantity} x ${i.title} - ${formatMoney(i.priceCents * i.quantity, cart.currency)}`).join("\n")}\n\nTotal: ${formatMoney(cart.cartValueCents, cart.currency)}\n\n${copy.cta}: ${cart.checkoutUrl || ""}`;

  return { subject: copy.subject(storeName), html, text };
}

/**
 * Calls a real OpenAI-compatible chat completions endpoint to rewrite
 * the plain template's text in the requested tone. Returns null (never
 * throws to the caller, never fabricates a result) if no API key is
 * configured or the call fails — the caller must fall back to the plain
 * template in that case.
 */
export async function rewriteWithAI(plainText, { tone, apiKey, apiBaseUrl, model }) {
  if (!apiKey) return null;

  const base = (apiBaseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: [
          { role: "system", content: `Rewrite the following cart-abandonment recovery email in a ${tone} tone. Keep it concise, keep the item list and total intact, and keep any links unchanged. Return plain text only, no markdown.` },
          { role: "user", content: plainText },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[recoveryEmail] AI rewrite failed: HTTP ${res.status} ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const rewritten = data.choices?.[0]?.message?.content;
    return rewritten ? rewritten.trim() : null;
  } catch (err) {
    console.error(`[recoveryEmail] AI rewrite request failed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Full pipeline: build the plain template, then optionally try an AI
 * rewrite if useAi is requested AND an API key is configured. Always
 * returns a usable email; the AI fields tell the caller honestly what
 * happened.
 */
export async function generateRecoveryEmail(cart, { storeName, tone = "friendly", useAi = false, openaiApiKey, openaiApiBaseUrl, openaiModel } = {}) {
  const plain = buildPlainTemplate(cart, { storeName, tone });

  if (!useAi) {
    return { ...plain, aiRewriteAttempted: false, aiRewriteUsed: false };
  }

  if (!openaiApiKey) {
    return { ...plain, aiRewriteAttempted: true, aiRewriteUsed: false, aiRewriteNote: "AI rewrite was requested but no OPENAI_API_KEY is configured — sent the plain template instead." };
  }

  const rewritten = await rewriteWithAI(plain.text, { tone, apiKey: openaiApiKey, apiBaseUrl: openaiApiBaseUrl, model: openaiModel });
  if (!rewritten) {
    return { ...plain, aiRewriteAttempted: true, aiRewriteUsed: false, aiRewriteNote: "AI rewrite was attempted but failed (see server logs) — sent the plain template instead." };
  }

  return {
    subject: plain.subject,
    html: `<pre style="font-family:sans-serif;white-space:pre-wrap;">${escapeHtml(rewritten)}</pre>`,
    text: rewritten,
    aiRewriteAttempted: true,
    aiRewriteUsed: true,
  };
}
