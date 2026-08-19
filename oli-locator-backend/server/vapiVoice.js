/**
 * Vapi Voice Agent Integration
 * Makes AI-powered outbound voice calls to leads using the Vapi API.
 * Uses Node built-in `https` only (no npm deps).
 */
import https from "node:https";

const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY || "";
const VAPI_API_BASE = "https://api.vapi.ai";
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Makes an HTTPS request to the Vapi API.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g., "/call")
 * @param {object|null} body - Request body (JSON)
 * @returns {Promise<object>} Parsed JSON response
 */
function vapiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, VAPI_API_BASE);
    const payload = body ? JSON.stringify(body) : null;

    console.log(`[vapiVoice] ${method} ${url.href}`);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        "Authorization": `Bearer ${VAPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        console.log(`[vapiVoice] Response status: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            console.error(`[vapiVoice] API error:`, parsed);
            resolve({ error: parsed.message || parsed.error || `API returned ${res.statusCode}`, statusCode: res.statusCode });
          } else {
            resolve(parsed);
          }
        } catch (e) {
          console.error(`[vapiVoice] Failed to parse response:`, data);
          resolve({ error: "Failed to parse Vapi API response" });
        }
      });
    });

    req.on("error", (err) => {
      console.error(`[vapiVoice] Request error:`, err.message);
      reject(new Error(`Vapi API request failed: ${err.message}`));
    });

    // 15-second timeout
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error("Vapi API request timed out (15s)"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Initiates an outbound AI voice call to a lead.
 * @param {object} params
 * @param {string} params.phoneNumber - Phone number to call (E.164 format preferred)
 * @param {string} params.leadTitle - The lead/job title
 * @param {string} params.leadCompany - The company name
 * @param {string} params.userBusinessName - Caller's business name
 * @param {string} params.userSkill - The skill/service being offered
 * @returns {Promise<{callId: string, status: string, message: string} | {error: string}>}
 */
export async function initiateCall({ phoneNumber, leadTitle, leadCompany, userBusinessName, userSkill }) {
  if (!VAPI_PRIVATE_KEY) {
    console.error("[vapiVoice] VAPI_PRIVATE_KEY is not set in environment variables");
    return { error: "Voice calling is not configured. VAPI_PRIVATE_KEY environment variable is missing." };
  }

  if (!phoneNumber) {
    return { error: "phoneNumber is required to initiate a call" };
  }

  console.log(`[vapiVoice] Initiating call to ${phoneNumber} for lead: ${leadTitle} at ${leadCompany}`);

  const requestBody = {
    phoneNumberId: null,
    assistantId: null,
    assistant: {
      model: {
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a friendly business development representative for ${userBusinessName}. You are calling about the ${leadTitle} position at ${leadCompany}. Your goal is to briefly introduce yourself, mention you saw their job posting, and ask if they'd be open to a quick chat about how ${userBusinessName} can help with their ${userSkill} needs. Be concise, professional, and friendly. If they're not interested, thank them and end the call politely.`
          }
        ]
      },
      voice: {
        provider: "11labs",
        voiceId: "paula"
      },
      firstMessage: `Hi, this is a quick call from ${userBusinessName}. I noticed you posted about the ${leadTitle} role and wanted to see if you might need some help with that. Do you have a moment?`
    },
    customer: {
      number: phoneNumber
    }
  };

  try {
    const result = await vapiRequest("POST", "/call", requestBody);

    if (result.error) {
      return { error: result.error };
    }

    console.log(`[vapiVoice] Call initiated successfully. Call ID: ${result.id}`);
    return {
      callId: result.id || null,
      status: result.status || "queued",
      message: `AI voice call initiated to ${phoneNumber}`
    };
  } catch (err) {
    console.error(`[vapiVoice] Error initiating call:`, err.message);
    return { error: err.message };
  }
}

/**
 * Gets the status of an existing call.
 * @param {string} callId - The Vapi call ID
 * @returns {Promise<{callId: string, status: string, duration: number|null, transcript: string|null} | {error: string}>}
 */
export async function getCallStatus(callId) {
  if (!VAPI_PRIVATE_KEY) {
    console.error("[vapiVoice] VAPI_PRIVATE_KEY is not set in environment variables");
    return { error: "Voice calling is not configured. VAPI_PRIVATE_KEY environment variable is missing." };
  }

  if (!callId) {
    return { error: "callId is required" };
  }

  console.log(`[vapiVoice] Getting status for call: ${callId}`);

  try {
    const result = await vapiRequest("GET", `/call/${callId}`);

    if (result.error) {
      return { error: result.error };
    }

    console.log(`[vapiVoice] Call ${callId} status: ${result.status}`);
    return {
      callId: result.id || callId,
      status: result.status || "unknown",
      duration: result.duration || null,
      transcript: result.transcript || null
    };
  } catch (err) {
    console.error(`[vapiVoice] Error getting call status:`, err.message);
    return { error: err.message };
  }
}
