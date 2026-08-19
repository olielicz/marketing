/**
 * Lead search/filter engine for Oli-Locator.
 * Fetches LIVE leads from multiple free job APIs and maps them to
 * the lead format expected by the frontend.
 *
 * Data Sources:
 * - Adzuna Jobs API (for US, UK, AU country-specific searches)
 * - Remotive API (for remote freelance/agency jobs, no key needed)
 * - Jobicy API (for remote freelance/agency jobs, no key needed)
 *
 * Uses Node's built-in https module (no npm dependencies).
 * Implements a 5-minute in-memory cache to avoid hitting API limits.
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

// Freelance/agency category → Adzuna search terms
const tradeTerms = {
  "web development": "web developer",
  "web-development": "web developer",
  "mobile development": "mobile developer",
  "mobile-development": "mobile developer",
  "ui ux design": "designer",
  "ui-ux-design": "designer",
  "digital marketing": "marketing",
  "digital-marketing": "marketing",
  "content writing": "content writer",
  "content-writing": "content writer",
  "video animation": "video editor",
  "video-animation": "video editor",
  "virtual assistant": "virtual assistant",
  "virtual-assistant": "virtual assistant",
  "data entry": "data entry",
  "data-entry": "data entry",
  "accounting": "accountant",
  "sales": "sales",
  "customer support": "customer support",
  "customer-support": "customer support",
};

// Remotive API category mapping
const REMOTIVE_CATEGORY_MAP = {
  "web development": "software-dev",
  "web-development": "software-dev",
  "mobile development": "software-dev",
  "mobile-development": "software-dev",
  "ui ux design": "design",
  "ui-ux-design": "design",
  "digital marketing": "marketing",
  "digital-marketing": "marketing",
  "content writing": "writing",
  "content-writing": "writing",
  "video animation": "design",
  "video-animation": "design",
  "virtual assistant": "all-others",
  "virtual-assistant": "all-others",
  "data entry": "data",
  "data-entry": "data",
  "accounting": "all-others",
  "sales": "sales",
  "customer support": "customer-support",
  "customer-support": "customer-support",
};

// Jobicy API tag mapping
const JOBICY_TAG_MAP = {
  "web development": "javascript",
  "web-development": "javascript",
  "mobile development": "react",
  "mobile-development": "react",
  "ui ux design": "design",
  "ui-ux-design": "design",
  "digital marketing": "marketing",
  "digital-marketing": "marketing",
  "content writing": "marketing",
  "content-writing": "marketing",
  "video animation": "design",
  "video-animation": "design",
  "virtual assistant": "customer-support",
  "virtual-assistant": "customer-support",
  "data entry": "data-science",
  "data-entry": "data-science",
  "accounting": "data-science",
  "sales": "marketing",
  "customer support": "customer-support",
  "customer-support": "customer-support",
};

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

export function clearCache() {
  cache.clear();
  console.log("[Cache] Cache cleared");
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
function calculateScoreFromFields({ hasSalary, hasDescription, hasLocation, createdDate }) {
  let score = 0;
  if (hasSalary) score += 30;
  if (hasDescription) score += 20;
  if (hasLocation) score += 20;
  if (createdDate) {
    const daysAgo = (Date.now() - new Date(createdDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo < 2) score += 30;
    else if (daysAgo < 7) score += 15;
  }
  return Math.min(100, score);
}

/**
 * Calculate lead score for an Adzuna result (legacy format).
 */
function calculateScore(result) {
  return calculateScoreFromFields({
    hasSalary: !!(result.salary_min || result.salary_max),
    hasDescription: !!(result.description && result.description.length > 20),
    hasLocation: !!(result.location && (result.location.display_name || (result.location.area && result.location.area.length > 0))),
    createdDate: result.created,
  });
}

/* ========================= Salary Parsing ========================= */

/**
 * Parse salary string from Remotive (e.g., "$50,000 - $80,000", "50k-80k", etc.)
 */
function parseSalary(salaryStr, type) {
  if (!salaryStr) return 0;
  const cleaned = salaryStr.replace(/[,$]/g, "").toLowerCase();
  // Try to find numbers
  const numbers = cleaned.match(/(\d+\.?\d*)\s*k?/g);
  if (!numbers || numbers.length === 0) return 0;

  const parsed = numbers.map((n) => {
    const num = parseFloat(n.replace(/k/i, ""));
    return n.toLowerCase().includes("k") ? num * 1000 : num;
  });

  if (type === "min") return Math.round(parsed[0] || 0);
  if (type === "max") return Math.round(parsed[parsed.length - 1] || parsed[0] || 0);
  return 0;
}

/* ========================= Category Mapping Helpers ========================= */

function mapRemotiveCategory(category) {
  if (!category) return "general";
  const lower = category.toLowerCase();
  if (lower.includes("software") || lower.includes("dev")) return "web development";
  if (lower.includes("design")) return "ui ux design";
  if (lower.includes("marketing")) return "digital marketing";
  if (lower.includes("writing")) return "content writing";
  if (lower.includes("customer")) return "customer support";
  if (lower.includes("data")) return "data entry";
  if (lower.includes("sales")) return "sales";
  return "general";
}

function mapJobicyTag(jobIndustry) {
  if (!jobIndustry) return "general";
  const lower = (Array.isArray(jobIndustry) ? jobIndustry.join(" ") : jobIndustry).toLowerCase();
  if (lower.includes("software") || lower.includes("dev") || lower.includes("engineering")) return "web development";
  if (lower.includes("design")) return "ui ux design";
  if (lower.includes("marketing")) return "digital marketing";
  if (lower.includes("writing") || lower.includes("content")) return "content writing";
  if (lower.includes("customer") || lower.includes("support")) return "customer support";
  if (lower.includes("data")) return "data entry";
  if (lower.includes("sales")) return "sales";
  return "general";
}

/* ========================= HTTPS GET Helper ========================= */

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
            reject(new Error(`API returned status ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message}`));
        }
      });
    });
    req.on("error", (e) => reject(new Error(`API request failed: ${e.message}`)));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("API request timed out")); });
  });
}

/* ========================= Adzuna API ========================= */

/**
 * Fetch leads from the Adzuna API for a given country and search terms.
 */
async function fetchFromAdzuna({ country, trade, city, page = 1, pageSize = 20 }) {
  const countryCode = COUNTRY_MAP[country.toUpperCase()] || "us";

  // If the trade matches a predefined category, use the mapped term.
  // Otherwise, use the raw trade/keyword text DIRECTLY as the search term.
  // This ensures user-typed keywords like "React developer" or "data entry clerk"
  // are searched exactly as typed, not mapped to a generic fallback.
  const searchTerm = tradeTerms[trade] || trade || "developer";
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

  console.log(`[Adzuna] Fetching: ${url.replace(ADZUNA_APP_KEY, "***")}`);
  const data = await httpsGet(url);
  return data;
}

/* ========================= Remotive API ========================= */

/**
 * Fetch remote jobs from the Remotive API (free, no key needed).
 * URL: https://remotive.com/api/remote-jobs?category=CATEGORY&limit=20
 */
async function fetchFromRemotive({ trade, pageSize = 20 }) {
  const category = REMOTIVE_CATEGORY_MAP[trade] || "software-dev";
  const limit = Math.min(50, pageSize);
  const url = `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(category)}&limit=${limit}`;

  console.log(`[Remotive] Fetching: ${url}`);
  const data = await httpsGet(url);
  return data;
}

/**
 * Map a Remotive job to our lead format.
 */
function mapRemotiveJobToLead(job) {
  const budgetMin = parseSalary(job.salary, "min");
  const budgetMax = parseSalary(job.salary, "max");

  return {
    id: String(job.id),
    title: job.title || "Untitled Job",
    trade: mapRemotiveCategory(job.category),
    country: "REMOTE",
    city: job.candidate_required_location || "Remote",
    postcode: "",
    budget: { min: budgetMin, max: budgetMax },
    budgetMin,
    budgetMax,
    urgency: determineUrgency(job.publication_date),
    leadScore: calculateScoreFromFields({
      hasSalary: !!(budgetMin || budgetMax),
      hasDescription: !!(job.description && job.description.length > 20),
      hasLocation: !!(job.candidate_required_location),
      createdDate: job.publication_date,
    }),
    customerName: job.company_name || "",
    customerPhone: "",
    customerEmail: "",
    postedAt: job.publication_date || null,
    postedDate: job.publication_date || null,
    description: job.description?.slice(0, 300) || "",
    latitude: null,
    longitude: null,
  };
}

/* ========================= Jobicy API ========================= */

/**
 * Fetch remote jobs from the Jobicy API (free, no key needed).
 * URL: https://jobicy.com/api/v2/remote-jobs?count=20&tag=CATEGORY
 */
async function fetchFromJobicy({ trade, pageSize = 20 }) {
  const tag = JOBICY_TAG_MAP[trade] || "javascript";
  const count = Math.min(50, pageSize);
  const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}&tag=${encodeURIComponent(tag)}`;

  console.log(`[Jobicy] Fetching: ${url}`);
  const data = await httpsGet(url);
  return data;
}

/**
 * Map a Jobicy job to our lead format.
 */
function mapJobicyJobToLead(job) {
  const budgetMin = job.annualSalaryMin || 0;
  const budgetMax = job.annualSalaryMax || 0;

  return {
    id: String(job.id),
    title: job.jobTitle || "Untitled Job",
    trade: mapJobicyTag(job.jobIndustry),
    country: "REMOTE",
    city: job.jobGeo || "Remote",
    postcode: "",
    budget: { min: budgetMin, max: budgetMax },
    budgetMin,
    budgetMax,
    urgency: determineUrgency(job.pubDate),
    leadScore: calculateScoreFromFields({
      hasSalary: !!(budgetMin || budgetMax),
      hasDescription: !!(job.jobDescription && job.jobDescription.length > 20),
      hasLocation: !!(job.jobGeo),
      createdDate: job.pubDate,
    }),
    customerName: job.companyName || "",
    customerPhone: "",
    customerEmail: "",
    postedAt: job.pubDate || null,
    postedDate: job.pubDate || null,
    description: job.jobDescription?.slice(0, 300) || "",
    latitude: null,
    longitude: null,
  };
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

/* ========================= Deduplication ========================= */

/**
 * Deduplicate leads by title + company name (case-insensitive).
 */
function deduplicateLeads(leads) {
  const seen = new Set();
  return leads.filter((lead) => {
    const key = `${(lead.title || "").toLowerCase().trim()}|${(lead.customerName || "").toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ========================= Fetch Remote Leads (Remotive + Jobicy) ========================= */

/**
 * Fetch from both Remotive and Jobicy APIs, merge and deduplicate results.
 */
async function fetchRemoteLeads({ trade, pageSize = 20 }) {
  const results = [];
  const errors = [];

  // Fetch from Remotive
  try {
    const remotiveData = await fetchFromRemotive({ trade, pageSize });
    const remotiveJobs = remotiveData.jobs || [];
    console.log(`[Remotive] Got ${remotiveJobs.length} results`);
    const remotiveLeads = remotiveJobs.map(mapRemotiveJobToLead);
    results.push(...remotiveLeads);
  } catch (err) {
    console.error(`[Remotive API Error] ${err.message}`);
    errors.push(`Remotive: ${err.message}`);
  }

  // Fetch from Jobicy
  try {
    const jobicyData = await fetchFromJobicy({ trade, pageSize });
    const jobicyJobs = jobicyData.jobs || [];
    console.log(`[Jobicy] Got ${jobicyJobs.length} results`);
    const jobicyLeads = jobicyJobs.map(mapJobicyJobToLead);
    results.push(...jobicyLeads);
  } catch (err) {
    console.error(`[Jobicy API Error] ${err.message}`);
    errors.push(`Jobicy: ${err.message}`);
  }

  // Deduplicate by title + company
  const deduplicated = deduplicateLeads(results);

  return { leads: deduplicated, errors };
}

/* ========================= Main Filter Function ========================= */

/**
 * @param {Object} params
 * @param {string} params.country - Required. "US", "UK", "AU", or "REMOTE"
 * @param {string} [params.trade] - Optional trade/category filter
 * @param {string} [params.city] - Optional city/location search
 * @param {number} [params.lat] - Optional latitude for map-based search
 * @param {number} [params.lng] - Optional longitude for map-based search
 * @param {number} [params.radius] - Optional radius in km for map-based search
 * @param {number} [params.page=1] - Page number (1-indexed)
 * @param {number} [params.pageSize=10] - Results per page
 * @returns {Object} { leads, total, page, pageSize, totalPages, source, error? }
 */
export async function filterLeads({ country, trade, city, keyword, lat, lng, radius, page = 1, pageSize = 10 }) {
  const countryUpper = (country || "US").toUpperCase();

  // Normalize trade for search
  let searchTrade = trade ? trade.replace(/-/g, " ").toLowerCase() : "";

  // If keyword is provided (user typed in search box), use it as the search term
  // This allows searching by company name, skill, or any keyword — not just city
  const searchKeyword = keyword ? keyword.trim() : "";

  // Build cache key
  const cacheKey = getCacheKey({ country: countryUpper, trade: searchTrade, city, keyword: searchKeyword, lat, lng, radius, page, pageSize });

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[Cache] Hit for key: ${cacheKey.slice(0, 80)}...`);
    return { ...cached, source: "cache" };
  }

  try {
    let leads = [];
    let total = 0;
    let source = "";

    if (countryUpper === "REMOTE") {
      // ===== REMOTE: Call both Remotive and Jobicy =====
      console.log(`[Search] REMOTE mode: trade="${searchTrade}", page=${page}`);

      const { leads: remoteLeads, errors } = await fetchRemoteLeads({
        trade: searchTrade || "web development",
        pageSize: Math.min(50, pageSize * 2), // fetch more to account for dedup
      });

      leads = remoteLeads;
      total = leads.length;
      source = "remotive+jobicy";

      if (errors.length > 0) {
        console.warn(`[Search] Some sources failed: ${errors.join("; ")}`);
      }
    } else {
      // ===== COUNTRY-SPECIFIC: Call Adzuna only =====
      const countryCode = COUNTRY_MAP[countryUpper] || "us";
      let locationSearch = city || "";
      if (!locationSearch && lat && lng) {
        locationSearch = "";
      }

      console.log(`[Adzuna] Searching: country=${countryUpper}, trade="${searchTrade}", city="${locationSearch}", keyword="${searchKeyword}", page=${page}`);

      const data = await fetchFromAdzuna({
        country: countryUpper,
        trade: searchKeyword || searchTrade || "",
        city: locationSearch,
        page,
        pageSize: Math.min(50, pageSize),
      });

      const results = data.results || [];
      total = data.count || results.length;
      console.log(`[Adzuna] Got ${results.length} results (total: ${total})`);

      leads = results.map((r) => mapResultToLead(r, searchTrade || "general", countryCode));
      source = "adzuna";

      // If lat/lng provided, filter by radius (approximate)
      if (lat && lng && radius) {
        const radiusKm = Number(radius);
        leads = leads.filter((lead) => {
          if (!lead.latitude || !lead.longitude) return true;
          const dist = haversineDistance(lat, lng, lead.latitude, lead.longitude);
          return dist <= radiusKm;
        });
      }
    }

    // Sort by leadScore descending
    leads.sort((a, b) => b.leadScore - a.leadScore);

    // Paginate (for REMOTE results which are fetched all at once)
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(50, pageSize));
    let paginatedLeads = leads;
    let totalPages = 1;

    if (countryUpper === "REMOTE") {
      totalPages = Math.ceil(leads.length / safePageSize);
      const start = (safePage - 1) * safePageSize;
      paginatedLeads = leads.slice(start, start + safePageSize);
      total = leads.length;
    } else {
      totalPages = Math.ceil(total / safePageSize);
      paginatedLeads = leads;
    }

    const result = {
      leads: paginatedLeads,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
      source,
    };

    // Cache the result
    setCache(cacheKey, result);

    return result;
  } catch (err) {
    console.error(`[API Error] ${err.message}`);

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
