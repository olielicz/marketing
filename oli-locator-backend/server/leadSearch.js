/**
 * Lead search/filter engine for Oli-Locator.
 * Filters the lead database by country, trade, city/postcode substring,
 * and returns paginated results sorted by leadScore descending.
 */
import { listLeads } from "./store.js";

/**
 * @param {Object} params
 * @param {string} params.country - Required. "US", "UK", or "AU"
 * @param {string} [params.trade] - Optional trade filter (exact match, case-insensitive)
 * @param {string} [params.city] - Optional city/postcode substring match (case-insensitive)
 * @param {number} [params.page=1] - Page number (1-indexed)
 * @param {number} [params.pageSize=10] - Results per page
 * @returns {Object} { leads, total, page, pageSize, totalPages }
 */
export async function filterLeads({ country, trade, city, page = 1, pageSize = 10 }) {
  let leads = await listLeads();

  // Filter by country (required, case-insensitive)
  if (country) {
    const countryUpper = country.toUpperCase();
    leads = leads.filter((l) => l.country === countryUpper);
  }

  // Filter by trade (optional, case-insensitive exact match)
  if (trade) {
    const tradeLower = trade.toLowerCase();
    leads = leads.filter((l) => l.trade.toLowerCase() === tradeLower);
  }

  // Filter by city or postcode (optional, case-insensitive substring match)
  if (city) {
    const cityLower = city.toLowerCase();
    leads = leads.filter((l) =>
      l.city.toLowerCase().includes(cityLower) ||
      l.postcode.toLowerCase().includes(cityLower)
    );
  }

  // Sort by leadScore descending (highest quality leads first)
  leads.sort((a, b) => b.leadScore - a.leadScore);

  // Paginate
  const total = leads.length;
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 10)));
  const totalPages = Math.ceil(total / safePageSize);
  const start = (safePage - 1) * safePageSize;
  const paginatedLeads = leads.slice(start, start + safePageSize);

  return {
    leads: paginatedLeads,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}
