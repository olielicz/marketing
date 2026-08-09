/* =====================================================================
   searchIndex.js — Builds live autocomplete suggestions for the search
   box: platforms, hashtags, authors, and frequent caption keywords —
   all pulled straight from the posts currently in the store, so
   suggestions always reflect what's actually searchable right now
   (including posts you just collected).

   This has no dependency on the DOM — app.js renders whatever this
   returns, which keeps the matching/ranking logic unit-testable and
   reusable if the UI ever changes.
   ===================================================================== */

import { store } from "../store.js";
import { PLATFORMS, platformById } from "./platforms.js";

// Common words filtered out of keyword suggestions so the dropdown
// surfaces meaningful terms ("productivity", "launch") instead of noise.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "your", "you",
  "are", "was", "were", "have", "has", "its", "it's", "just", "about",
  "into", "over", "our", "their", "them", "they", "what", "when",
  "where", "which", "while", "who", "will", "would", "can", "could",
  "should", "not", "but", "all", "any", "how", "why", "one", "two",
  "new", "get", "got", "out", "now", "today", "day", "week", "month",
  "year", "like", "really", "very", "some", "more", "most", "than",
  "then", "also", "been", "being", "had", "did", "does", "doing",
  "here", "there", "we're", "we've", "we", "on", "in", "to", "of",
  "is", "it", "be", "at", "by", "an", "as", "if", "so", "up", "no",
]);

function normalize(str) {
  return String(str || "").toLowerCase();
}

/** Wraps the matched substring in <mark> for visual highlighting. */
export function highlightMatch(label, query) {
  if (!query) return label;
  const idx = normalize(label).indexOf(normalize(query));
  if (idx === -1) return label;
  return (
    label.slice(0, idx) +
    "<mark>" +
    label.slice(idx, idx + query.length) +
    "</mark>" +
    label.slice(idx + query.length)
  );
}

/**
 * Returns up to `limit` ranked suggestions matching `rawQuery`, grouped
 * by type. Each item: { type, label, value, sub }
 *   type  — "platform" | "hashtag" | "author" | "keyword"
 *   label — display text (unescaped; caller should esc() it)
 *   value — text to put into the search box / actually filter by
 *   sub   — small descriptor shown next to the label
 */
export function getSuggestions(rawQuery, limit = 8) {
  const query = normalize(rawQuery).trim();
  if (!query) return [];

  const { posts } = store.state;
  const results = [];
  const seen = new Set();

  const push = (type, label, value, sub) => {
    const key = `${type}:${normalize(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ type, label, value, sub });
  };

  // 1. Platforms — always most relevant when they match, and there
  //    are few enough of them to just check all.
  PLATFORMS.filter((p) => normalize(p.name).includes(query) || normalize(p.id).includes(query))
    .slice(0, 4)
    .forEach((p) => push("platform", p.name, p.name, "Platform"));

  // 2. Hashtags — unique across the current library, ranked by how
  //    many posts use them so the most common tags surface first.
  const tagCounts = new Map();
  posts.forEach((p) => (p.hashtags || []).forEach((t) => {
    const key = normalize(t);
    if (!key.includes(query)) return;
    tagCounts.set(key, { label: t, count: (tagCounts.get(key)?.count || 0) + 1 });
  }));
  [...tagCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .forEach((t) => push("hashtag", `#${t.label}`, t.label, `${t.count} post${t.count === 1 ? "" : "s"}`));

  // 3. Authors / handles.
  const authorCounts = new Map();
  posts.forEach((p) => {
    const key = normalize(p.author);
    if (!key || !key.includes(query)) return;
    const plat = platformById(p.platform)?.name || p.platform;
    authorCounts.set(key, { label: p.author, plat, count: (authorCounts.get(key)?.count || 0) + 1 });
  });
  [...authorCounts.values()]
    .slice(0, 3)
    .forEach((a) => push("author", `@${a.label}`, a.label, a.plat));

  // 4. Caption keywords — frequency-ranked words that contain the
  //    query, skipping stopwords and very short tokens.
  const wordCounts = new Map();
  posts.forEach((p) => {
    const words = normalize(p.caption).match(/[a-z0-9']{3,}/g) || [];
    words.forEach((w) => {
      if (STOPWORDS.has(w) || w.length < 3) return;
      if (!w.includes(query)) return;
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    });
  });
  [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .forEach(([w, count]) => push("keyword", w, w, `${count} mention${count === 1 ? "" : "s"}`));

  return results.slice(0, limit);
}
