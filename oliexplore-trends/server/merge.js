/**
 * Merges normalized items from every source into one feed, optionally
 * filtered by category and capped in length. Pure function — easy to unit
 * test independently of the network/cache layer.
 */
export function mergeFeeds(sourceResults, { category = "all", limit = 40 } = {}) {
  let items = [];
  for (const result of sourceResults) {
    if (Array.isArray(result)) items = items.concat(result);
  }

  if (category && category !== "all") {
    items = items.filter((item) => item.type === category);
  }

  // Interleave sources round-robin-ish by keeping stable original order per
  // source, then sort by publishedAt (newest first) when available, with
  // items missing a timestamp kept at their relative position.
  const withIndex = items.map((item, idx) => ({ item, idx }));
  withIndex.sort((a, b) => {
    const at = a.item.publishedAt ? Date.parse(a.item.publishedAt) : NaN;
    const bt = b.item.publishedAt ? Date.parse(b.item.publishedAt) : NaN;
    if (Number.isNaN(at) && Number.isNaN(bt)) return a.idx - b.idx;
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return bt - at;
  });

  return withIndex.slice(0, limit).map((w) => w.item);
}
