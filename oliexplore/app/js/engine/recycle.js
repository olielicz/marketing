/* =====================================================================
   recycle.js — The "make it catchy & quirky" transformation engine.

   This is rule-based (no external AI needed, runs instantly & offline).
   It restructures a caption with:
     • an attention HOOK at the top
     • punchier, tightened body copy
     • relevant EMOJI injected around keywords
     • a quirky sign-off / call-to-action
     • freshly suggested HASHTAGS derived from the content

   Supports multiple TONES so the same source post can be re-spun many
   different ways — that's the "recycle" loop.
   ===================================================================== */

export const TONES = [
  { id: "catchy",      label: "Catchy" },
  { id: "quirky",      label: "Quirky" },
  { id: "punchy",      label: "Punchy" },
  { id: "friendly",    label: "Friendly" },
  { id: "professional",label: "Professional" },
];

/* ---- Vocabulary banks ---- */
const HOOKS = {
  catchy:   ["Stop scrolling 👀", "This one's a keeper.", "Okay, real talk:", "You'll want to save this.", "Hot take incoming 🔥"],
  quirky:   ["Plot twist 🌀", "Brb, obsessed.", "Nobody asked, but here we go:", "POV: you found the good stuff.", "Warning: mild excitement ahead 😅"],
  punchy:   ["Listen up.", "Here's the deal.", "No fluff:", "Straight to it —", "Let's go."],
  friendly: ["Hey friends 👋", "Quick one for you:", "Sharing a little something:", "Gather 'round 🙌", "We've got news!"],
  professional: ["A quick update:", "Worth your attention:", "Here's what's new:", "From the team:", "Announcement:"],
};

const SIGNOFFS = {
  catchy:   ["Don't say we didn't tell you. 😉", "Tag someone who needs this. 👇", "Save it. Thank us later.", "Double-tap if you agree. ❤️"],
  quirky:   ["Okay byeee 🫶", "We'll see ourselves out. 🚪", "That's the post. That's it. 🎤⬇️", "Anyway, thoughts? 👀"],
  punchy:   ["Go.", "Your move.", "Now you know.", "Done."],
  friendly: ["Let us know what you think! 💬", "Sending good vibes ✨", "Catch you in the comments 👇", "Have an awesome one! 🙌"],
  professional: ["Learn more via the link.", "Reach out with questions.", "Details below.", "We appreciate your support."],
};

const EMOJI_MAP = [
  [/\b(coffee|espresso|latte|brew)\b/i, "☕"],
  [/\b(summer|sun|sunny|beach)\b/i, "☀️"],
  [/\b(autumn|fall|leaves)\b/i, "🍂"],
  [/\b(sale|deal|deals|discount|offer|off)\b/i, "🏷️"],
  [/\b(launch|launched|new|drop|release)\b/i, "🚀"],
  [/\b(photo|photos|photography|photoshoot|frame|camera)\b/i, "📸"],
  [/\b(tip|tips|guide|tutorial|how)\b/i, "💡"],
  [/\b(book|books|read|reading)\b/i, "📚"],
  [/\b(work|workspace|focus|desk|productivity|plan|planner)\b/i, "🧠"],
  [/\b(food|recipe|breakfast|bowl|eat)\b/i, "🍽️"],
  [/\b(hiring|job|jobs|career)\b/i, "💼"],
  [/\b(thank|thanks|grateful|milestone|followers)\b/i, "🎉"],
  [/\b(love|favorite|best)\b/i, "❤️"],
  [/\b(walk|outdoor|outdoors|nature)\b/i, "🌿"],
  [/\b(weekend)\b/i, "🎈"],
];

const STOPWORDS = new Set(["the","a","an","and","or","but","to","of","in","on","for","with","our","we","you","your","is","are","was","were","be","this","that","it","at","as","so","just","now","new","how","what","into","from","they","them","their","not","do","does"]);

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* Tighten body: trim filler, collapse whitespace, vary sentence energy. */
function punchUp(text, tone) {
  let t = text.trim().replace(/\s+/g, " ");

  // Soften corporate filler.
  t = t.replace(/\bwe are\b/gi, "we're")
       .replace(/\bavailable now\b/gi, "out now")
       .replace(/\bcheck out\b/gi, "peep");

  if (tone === "punchy" || tone === "catchy") {
    // Break a long sentence into shorter beats at conjunctions.
    t = t.replace(/, and /g, ". ").replace(/, so /g, ". ");
  }
  if (tone === "quirky") {
    t = t.replace(/\bgood\b/gi, "ridiculously good")
         .replace(/\bgreat\b/gi, "*chef's kiss* great");
  }
  // Always start the body with a capital letter.
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

/* Sprinkle emoji next to the first keyword match for each rule (max ~3). */
function injectEmoji(text, max = 3) {
  let count = 0;
  let out = text;
  for (const [re, emoji] of EMOJI_MAP) {
    if (count >= max) break;
    if (re.test(out) && !out.includes(emoji)) {
      out = out.replace(re, (m) => `${m} ${emoji}`);
      count++;
    }
  }
  return out;
}

/* Derive fresh hashtags from the most meaningful words + originals. */
export function suggestHashtags(caption, existing = [], limit = 6) {
  const words = caption
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));

  const derived = Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 8)
    .map((w) => w.replace(/[^a-z0-9]/g, ""));

  const merged = [...new Set([...existing, ...derived])].filter(Boolean);
  return merged.slice(0, limit);
}

/**
 * Recycle a caption into a catchy/quirky variant.
 * @param {string} caption
 * @param {string[]} hashtags
 * @param {string} tone - one of TONES ids
 * @returns {{caption:string, hashtags:string[], tone:string}}
 */
export function recycle(caption, hashtags = [], tone = "catchy") {
  const safeTone = TONES.some((t) => t.id === tone) ? tone : "catchy";

  const hook = rand(HOOKS[safeTone]);
  const signoff = rand(SIGNOFFS[safeTone]);
  let body = punchUp(caption, safeTone);
  body = injectEmoji(body);

  // Ensure body ends with sentence punctuation before the sign-off.
  if (!/[.!?]$/.test(body)) body += ".";

  const newCaption = `${hook}\n\n${body}\n\n${signoff}`;
  const newHashtags = suggestHashtags(caption, hashtags, 6);

  return { caption: newCaption, hashtags: newHashtags, tone: safeTone };
}
