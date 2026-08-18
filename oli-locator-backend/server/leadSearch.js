/**
 * Lead search/filter engine for Oli-Locator.
 * Fetches LIVE leads from the Adzuna Jobs API and maps them to
 * the lead format expected by the frontend.
 * 
 * Uses Node's built-in https module (no npm dependencies).
 * Implements a 5-minute in-memory cache to avoid hitting the 250/day API limit.
 */
import https from "node:https";
import { listLeads } from "./store.js";

/* ========================= Configuration ========================= */

const ADZUNA_APP_ID = "9df86203";
const ADZUNA_APP_KEY = "c20c11fc4dcdb46f2c43f9c5412acbef";

// Country code mapping: our codes → Adzuna codes
const COUNTRY_MAP = {
  US: "us",
  UK: "gb",
  AU: "au",
};

// Trades to search for
const VALID_TRADES = [
  "cleaning", "pest control", "renovation", "roofing", "painting",
  "plumbing", "electrical", "landscaping", "hvac", "flooring", "handyman"
];

/* ========================= In-Memory Cache (5-minute TTL) ========================= */

const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(params) {
  return JSON.stringify(params);
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Evict old entries if cache is getting large
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_TTL_MS) cache.delete(k);
    }
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/* ========================= Urgency Logic ========================= */

/**
 * Determine urgency based on when the job was posted:
 * - < 2 days ago = "high"
 * - < 7 days ago = "medium"
 * - else = "low"
 */
function determineUrgency(createdDate) {
  if (!createdDate) return "low";
  const now = Date.now();
  const posted = new Date(createdDate).getTime();
  const daysAgo = (now - posted) / (1000 * 60 * 60 * 24);
  if (daysAgo < 2) return "high";
  if (daysAgo < 7) return "medium";
  return "low";
}

/* ========================= Lead Score Calculation ========================= */

/**
 * Calculate lead score based on completeness of data:
 * - has salary = +30
 * - has description = +20
 * - has location = +20
 * - recent (< 2 days) = +30
 */
function calculateScore(result) {
  let score = 0;
  if (result.salary_min || result.salary_max) score += 30;
  if (result.description && result.description.length > 20) score += 20;
  if (result.location && (result.location.display_name || (result.location.area && result.location.area.length > 0))) score += 20;
  if (result.created) {
    const daysAgo = (Date.now() - new Date(result.created).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo < 2) score += 30;
    else if (daysAgo < 7) score += 15;
  }
  return Math.min(100, score);
}

/* ========================= Adzuna API Call ========================= */

/**
 * Make an HTTPS GET request using Node's built-in https module.
 * Returns a Promise that resolves with parsed JSON.
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`Adzuna API returned status ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Adzuna response: ${e.message}`));
        }
      });
    });
    req.on("error", (e) => reject(new Error(`Adzuna API request failed: ${e.message}`)));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Adzuna API request timed out")); });
  });
}

/**
 * Fetch leads from the Adzuna API for a given country and search terms.
 * Uses broad trade-category terms to maximize results.
 */
async function fetchFromAdzuna({ country, trade, city, page = 1, pageSize = 20 }) {
  const countryCode = COUNTRY_MAP[country.toUpperCase()] || "us";
  
  // Use simple, broad trade terms that return the most results
  const tradeTerms = {
    "cleaning": "cleaning cleaner domestic",
    "pest control": "pest control exterminator",
    "renovation": "renovation remodel builder",
    "roofing": "roofing roofer",
    "painting": "painter painting decorator",
    "plumbing": "plumber plumbing",
    "electrical": "electrician electrical",
    "landscaping": "landscaping gardener garden",
    "hvac": "hvac heating cooling",
    "flooring": "flooring floor installer",
    "handyman": "handyman maintenance repair",
    "home improvement": "home improvement repair maintenance",
  };
  
  const searchTerm = tradeTerms[trade] || tradeTerms["home improvement"];
  const locationTerm = city || "";

  // Build the API URL
  const pageNum = Math.max(1, page);
  let url = `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${pageNum}`;
  const params = new URLSearchParams({
    app_id: ADZUNA_APP_ID,
    app_key: ADZUNA_APP_KEY,
    what: searchTerm,
    results_per_page: String(Math.min(50, pageSize)),
    "content-type": "application/json",
    sort_by: "date",
  });

  if (locationTerm) {
    params.set("where", locationTerm);
  }

  url += `?${params.toString()}`;

  const data = await httpsGet(url);
  return data;
}

/* ========================= Map Adzuna Result to Lead Format ========================= */

function mapResultToLead(result, searchedTrade, countryCode) {
  const id = result.id ? String(result.id) : `adzuna-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const city = result.location
    ? (result.location.display_name || (result.location.area && result.location.area[0]) || "")
    : "";

  return {
    id,
    title: result.title || "Untitled Job",
    trade: searchedTrade || "general",
    country: countryCode.toUpperCase(),
    city,
    postcode: "",
    budget: {
      min: result.salary_min ? Math.round(result.salary_min) : 0,
      max: result.salary_max ? Math.round(result.salary_max) : 0,
    },
    budgetMin: result.salary_min ? Math.round(result.salary_min) : 0,
    budgetMax: result.salary_max ? Math.round(result.salary_max) : 0,
    urgency: determineUrgency(result.created),
    leadScore: calculateScore(result),
    customerName: result.company?.display_name || "",
    customerPhone: "",
    customerEmail: "",
    postedAt: result.created || null,
    postedDate: result.created || null,
    description: result.description || "",
    latitude: result.latitude || null,
    longitude: result.longitude || null,
  };
}

/* ========================= Main Filter Function ========================= */

/**
 * @param {Object} params
 * @param {string} params.country - Required. "US", "UK", or "AU"
 * @param {string} [params.trade] - Optional trade filter
 * @param {string} [params.city] - Optional city/location search
 * @param {number} [params.lat] - Optional latitude for map-based search
 * @param {number} [params.lng] - Optional longitude for map-based search
 * @param {number} [params.radius] - Optional radius in km for map-based search
 * @param {number} [params.page=1] - Page number (1-indexed)
 * @param {number} [params.pageSize=10] - Results per page
 * @returns {Object} { leads, total, page, pageSize, totalPages, source, error? }
 */
export async function filterLeads({ country, trade, city, lat, lng, radius, page = 1, pageSize = 10 }) {
  const countryUpper = (country || "US").toUpperCase();
  const countryCode = COUNTRY_MAP[countryUpper] || "us";

  // Normalize trade for search
  let searchTrade = trade ? trade.replace(/-/g, " ") : "";

  // Build cache key
  const cacheKey = getCacheKey({ country: countryUpper, trade: searchTrade, city, lat, lng, radius, page, pageSize });

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, source: "cache" };
  }

  try {
    // If lat/lng provided, use city as location or construct a location string
    let locationSearch = city || "";
    if (!locationSearch && lat && lng) {
      // Adzuna doesn't directly support lat/lng, use general search for the country
      locationSearch = "";
    }

    const data = await fetchFromAdzuna({
      country: countryUpper,
      trade: searchTrade || "home improvement",
      city: locationSearch,
      page,
      pageSize: Math.min(50, pageSize),
    });

    const results = data.results || [];
    const total = data.count || results.length;

    // Map results to lead format
    let leads = results.map((r) => mapResultToLead(r, searchTrade || "home improvement", countryCode));

    // If lat/lng provided, filter by radius (approximate)
    if (lat && lng && radius) {
      const radiusKm = Number(radius);
      leads = leads.filter((lead) => {
        if (!lead.latitude || !lead.longitude) return true; // keep leads without coords
        const dist = haversineDistance(lat, lng, lead.latitude, lead.longitude);
        return dist <= radiusKm;
      });
    }

    // Sort by leadScore descending
    leads.sort((a, b) => b.leadScore - a.leadScore);

    const result = {
      leads,
      total,
      page: Math.max(1, page),
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      source: "adzuna",
    };

    // Cache the result
    setCache(cacheKey, result);

    return result;
  } catch (err) {
    console.error(`[Adzuna API Error] ${err.message}`);

    // Fallback to local demo data
    try {
      const fallbackResult = await filterLeadsFallback({ country: countryUpper, trade, city, page, pageSize });
      return { ...fallbackResult, source: "fallback", error: err.message };
    } catch (fallbackErr) {
      console.error(`[Fallback Error] ${fallbackErr.message}`);
      return {
        leads: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 0,
        source: "error",
        error: `API unavailable: ${err.message}`,
      };
    }
  }
}

/* ========================= Fallback to Local Store ========================= */

async function filterLeadsFallback({ country, trade, city, page = 1, pageSize = 10 }) {
  let leads = await listLeads();

  // Filter by country
  if (country) {
    const countryUpper = country.toUpperCase();
    leads = leads.filter((l) => l.country === countryUpper);
  }

  // Filter by trade
  if (trade) {
    const tradeLower = trade.toLowerCase().replace(/-/g, " ");
    leads = leads.filter((l) => l.trade.toLowerCase().replace(/-/g, " ") === tradeLower);
  }

  // Filter by city
  if (city) {
    const cityLower = city.toLowerCase();
    leads = leads.filter((l) =>
      l.city.toLowerCase().includes(cityLower) ||
      l.postcode.toLowerCase().includes(cityLower)
    );
  }

  // Sort by leadScore descending
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

/* ========================= Haversine Distance (km) ========================= */

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}
