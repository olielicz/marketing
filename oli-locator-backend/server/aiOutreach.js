/**
 * AI-Powered Personalized Outreach Generator
 * Uses Groq LLM API (llama-3.3-70b-versatile) to create personalized
 * cold emails, LinkedIn messages, and WhatsApp messages for leads.
 *
 * Zero external dependencies — uses Node's built-in https module.
 */
import { request } from "node:https";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const TIMEOUT_MS = 5000;

/**
 * Generate personalized outreach content for a lead.
 * @param {Object} params
 * @param {string} params.leadTitle - The job/lead title
 * @param {string} params.leadCompany - The company name
 * @param {string} params.leadDescription - Description of the job/opportunity
 * @param {string} params.userBusinessName - The user's business name
 * @param {string} params.userSkill - The user's primary skill/service
 * @returns {Promise<{subject: string, body: string, linkedinMessage: string, whatsappMessage: string}>}
 */
export async function generateOutreach({ leadTitle, leadCompany, leadDescription, userBusinessName, userSkill }) {
  console.log(`[aiOutreach] Generating outreach for "${leadTitle}" at "${leadCompany}"`);
  console.log(`[aiOutreach] User: "${userBusinessName}", Skill: "${userSkill}"`);

  const systemPrompt = `You are a professional outreach copywriter. You write short, personalized cold emails and messages that are friendly, professional, and NOT salesy or spammy. You always reference the specific job posting and company name naturally. Keep messages concise and value-focused.`;

  const userPrompt = `Generate personalized outreach for the following lead:

Job Title: ${leadTitle || "Unknown Position"}
Company: ${leadCompany || "Unknown Company"}
Job Description: ${leadDescription || "No description available"}

I am reaching out from: ${userBusinessName || "My Business"}
My skill/service: ${userSkill || "professional services"}

Please generate EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "subject": "A short, personalized email subject line (under 60 chars)",
  "body": "A short cold email body (3-4 sentences max). Reference the specific job title and company. End with a soft call-to-action.",
  "linkedinMessage": "A LinkedIn connection request message (MUST be under 300 characters). Be concise and reference their role.",
  "whatsappMessage": "A very short WhatsApp intro message (MUST be under 200 characters). Casual but professional."
}

Important rules:
- Reference "${leadTitle}" and "${leadCompany}" naturally
- Be helpful, not pushy
- No generic templates — make it specific to this lead
- Email body should be 3-4 sentences max
- Return ONLY valid JSON, nothing else`;

  try {
    const response = await callGroqAPI(systemPrompt, userPrompt);
    console.log(`[aiOutreach] Got response from Groq API`);

    // Parse the JSON response
    const parsed = parseAIResponse(response);
    console.log(`[aiOutreach] Successfully parsed AI response`);
    return parsed;
  } catch (err) {
    console.log(`[aiOutreach] Error: ${err.message}. Using fallback template.`);
    return getFallbackTemplate({ leadTitle, leadCompany, userBusinessName, userSkill });
  }
}

/**
 * Call the Groq LLM API using Node's built-in https module.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>} The AI-generated text
 */
function callGroqAPI(systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const url = new URL(GROQ_ENDPOINT);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    console.log(`[aiOutreach] Calling Groq API (model: ${GROQ_MODEL})...`);

    const req = request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          console.log(`[aiOutreach] Groq API returned status ${res.statusCode}: ${data.slice(0, 200)}`);
          reject(new Error(`Groq API error: HTTP ${res.statusCode}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content;
          if (!content) {
            reject(new Error("Empty response from Groq API"));
            return;
          }
          resolve(content);
        } catch (parseErr) {
          reject(new Error(`Failed to parse Groq response: ${parseErr.message}`));
        }
      });
    });

    // 5-second timeout
    req.setTimeout(TIMEOUT_MS, () => {
      console.log(`[aiOutreach] Request timed out after ${TIMEOUT_MS}ms`);
      req.destroy();
      reject(new Error("Groq API request timed out"));
    });

    req.on("error", (err) => {
      console.log(`[aiOutreach] Request error: ${err.message}`);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Parse the AI response string into structured output.
 * Handles cases where AI wraps JSON in code blocks.
 * @param {string} raw
 * @returns {{subject: string, body: string, linkedinMessage: string, whatsappMessage: string}}
 */
function parseAIResponse(raw) {
  let cleaned = raw.trim();

  // Strip markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned);

  return {
    subject: String(parsed.subject || "").slice(0, 100),
    body: String(parsed.body || ""),
    linkedinMessage: String(parsed.linkedinMessage || "").slice(0, 300),
    whatsappMessage: String(parsed.whatsappMessage || "").slice(0, 200),
  };
}

/**
 * Fallback template when AI generation fails.
 * @param {Object} params
 * @returns {{subject: string, body: string, linkedinMessage: string, whatsappMessage: string}}
 */
function getFallbackTemplate({ leadTitle, leadCompany, userBusinessName, userSkill }) {
  console.log(`[aiOutreach] Using fallback template`);
  const company = leadCompany || "your company";
  const title = leadTitle || "the opportunity";
  const business = userBusinessName || "our team";
  const skill = userSkill || "professional services";

  return {
    subject: `Re: ${title} at ${company}`,
    body: `Hi,\n\nI noticed your posting for "${title}" at ${company} and wanted to reach out. At ${business}, we specialize in ${skill} and have helped similar companies deliver great results.\n\nWould you be open to a quick chat this week to see if we might be a good fit?\n\nBest regards`,
    linkedinMessage: `Hi! I saw ${company} is looking for help with ${title}. At ${business} we specialize in ${skill} — would love to connect and learn more about the role.`,
    whatsappMessage: `Hi! Saw your ${title} posting at ${company}. We do ${skill} at ${business} — happy to chat if you're still looking!`,
  };
}
