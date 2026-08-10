/**
 * Real "openai" node — a genuine Chat Completions call any workflow can
 * use directly (distinct from this codebase's separate AI Support
 * Assistant feature in supportAssistant.js, which is a specific
 * customer-support use case; this node is a general-purpose building
 * block for workflows). Uses the SAME OpenAI-compatible REST shape
 * (works with real OpenAI, Groq, or any compatible provider) already
 * established by supportAssistant.js's callSupportAI() — same honesty
 * standard: no key configured means an honest error, never a fabricated
 * response.
 *
 * Config: { prompt: "Summarize: {{trigger.body.text}}", model: "llama-3.3-70b-versatile" }
 * Requires workflow variables: openai_api_key (required), openai_base_url
 * (optional, defaults to https://api.openai.com/v1), openai_model
 * (optional, defaults to config.model or "gpt-4o-mini").
 */
import { resolveTemplate } from "../templateEngine.js";
import { fetchJson } from "./integrationCredentials.js";

export async function runOpenaiNode(config, templateContext) {
  const vars = templateContext.vars || {};
  const apiKey = vars.openai_api_key;
  if (!apiKey) {
    return {
      ok: false,
      error: 'Missing required workflow variable: openai_api_key. Set it in the Variables tab (mark it "secret").',
    };
  }
  const baseUrl = (vars.openai_base_url || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = vars.openai_model || config.model || "gpt-4o-mini";

  const prompt = resolveTemplate(String(config.prompt ?? ""), templateContext);
  if (!prompt.trim()) return { ok: false, error: "This node's config needs a non-empty 'prompt' field." };

  const { httpOk, status, json, networkError } = await fetchJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
  });

  if (networkError) return { ok: false, error: `Could not reach ${baseUrl}: ${networkError}` };
  if (!httpOk) {
    return { ok: false, error: `AI provider returned ${status}: ${json?.error?.message || "unknown error"}` };
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) return { ok: false, error: "AI provider returned no message content." };
  return { ok: true, result: content };
}
