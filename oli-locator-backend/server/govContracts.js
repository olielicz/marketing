/**
 * Government Contract/Tender Search Engine for Oli-Locator.
 * Fetches LIVE government tenders from 4 free official APIs and maps them
 * to a consistent contract format for the frontend.
 *
 * Data Sources:
 * - SAM.gov (USA) — Federal procurement opportunities
 * - UK Contracts Finder (UK) — UK public sector tenders (OCDS format)
 * - AusTender (Australia) — Australian government tenders (OCDS format)
 * - EU TED (Tenders Electronic Daily) — EU-wide procurement notices
 *
 * Uses Node's built-in https module (no npm dependencies).
 * Implements a 5-minute in-memory cache to avoid hitting API limits.
 */
import https from "node:https";
import http from "node:http";

/* ========================= Configuration ========================= */

const SAM_API_KEY = "SAM-c6c1eaf7-46e7-45ba-ac74-90a55e041b97";

const SAM_BASE_URL = "https://api.sam.gov/opportunities/v2/search";
const UK_CF_BASE_URL = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search";
const EU_TED_BASE_URL = "https://api.ted.europa.eu/v3/notices/search";

// NAICS code → description mapping (common codes)
const NAICS_DESCRIPTIONS = {
  "541511": "Custom Computer Programming Services",
  "541512": "Computer Systems Design Services",
  "541519": "Other Computer Related Services",
  "541611": "Administrative Management Consulting",
  "541612": "Human Resources Consulting",
  "541613": "Marketing Consulting",
  "541614": "Process & Logistics Consulting",
  "541618": "Other Management Consulting",
  "541690": "Other Scientific & Technical Consulting",
  "541710": "Research & Development",
  "541720": "Research & Development (Social Sciences)",
  "238210": "Electrical Contractors",
  "236220": "Commercial Building Construction",
  "561210": "Facilities Support Services",
  "561720": "Janitorial Services",
  "561730": "Landscaping Services",
  "561612": "Security Guards & Patrol Services",
  "511210": "Software Publishers",
  "517110": "Wired Telecommunications",
  "518210": "Data Processing & Hosting",
  "519130": "Internet Publishing & Broadcasting",
  "611430": "Professional Development Training",
  "621111": "Offices of Physicians",
  "722310": "Food Service Contractors",
};

// SAM.gov type codes → human-readable names
const SAM_TYPE_MAP = {
  o: "solicitation",
  p: "presolicitation",
  k: "combined",
  r: "sources-sought",
  g: "grant",
  s: "special-notice",
  i: "intent-to-bundle",
  a: "award",
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

export function clearGovCache() {
  cache.clear();
  console.log("[GovContracts Cache] Cache cleared");
}

/* ========================= HTTPS GET Helper ========================= */

/**
 * Make an HTTPS (or HTTP) GET request using Node's built-in modules.
 * Returns a Promise that resolves with parsed JSON.
 */
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "http:" ? http : https;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Oli-Locator-GovContracts/1.0",
        ...options.headers,
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`API returned status ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse API response: ${e.message} — raw: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`Request failed: ${e.message}`)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("Request timed out (15s)")); });
    req.end();
  });
}

/* ========================= Date Helpers ========================= */

function formatDate(date) {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD for UK/general
}

function formatDateUS(date) {
  // SAM.gov requires MM/dd/yyyy format
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function truncate(str, maxLen = 300) {
  if (!str) return "";
  // Strip HTML tags
  const clean = str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 3) + "..." : clean;
}

/* ========================= SAM.gov (USA) ========================= */

/**
 * Fetch opportunities from SAM.gov.
 */
async function fetchFromSAM({ keyword, page = 1, pageSize = 20 }) {
  const limit = Math.min(100, pageSize);
  const offset = (page - 1) * limit;
  const postedFrom = formatDateUS(daysAgo(30));
  const postedTo = formatDateUS(new Date());

  const params = new URLSearchParams({
    api_key: SAM_API_KEY,
    keyword: keyword || "",
    postedFrom,
    postedTo,
    limit: String(limit),
    offset: String(offset),
  });

  const url = `${SAM_BASE_URL}?${params.toString()}`;
  console.log(`[SAM.gov] Fetching: ${url.replace(SAM_API_KEY, "***")}`);

  const data = await httpsGet(url);
  return data;
}

/**
 * Map a SAM.gov opportunity to our contract format.
 */
function mapSAMContract(opp) {
  const naicsCode = opp.naicsCode || "";
  const category = NAICS_DESCRIPTIONS[naicsCode] || (naicsCode ? `NAICS ${naicsCode}` : "General");
  const typeCode = (opp.type || "").toLowerCase();

  return {
    id: opp.noticeId || `sam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: opp.title || "Untitled Opportunity",
    description: truncate(opp.description),
    country: "US",
    source: "sam.gov",
    agency: opp.organizationName || opp.departmentName || "Unknown Agency",
    value: { min: 0, max: 0, currency: "USD" },
    postedDate: opp.postedDate || null,
    deadline: opp.responseDeadLine || null,
    category,
    type: SAM_TYPE_MAP[typeCode] || typeCode || "solicitation",
    url: opp.uiLink || `https://sam.gov/opp/${opp.noticeId || ""}`,
    location: opp.officeAddress?.state || opp.placeOfPerformance?.state?.code || "",
  };
}

/* ========================= UK Contracts Finder ========================= */

/**
 * Fetch from UK Contracts Finder (OCDS format).
 */
async function fetchFromUKContractsFinder({ keyword, page = 1, pageSize = 20 }) {
  const publishedFrom = formatDate(daysAgo(30));
  const publishedTo = formatDate(new Date());
  const size = Math.min(100, pageSize);

  const params = new URLSearchParams({
    keyword: keyword || "",
    publishedFrom,
    publishedTo,
    size: String(size),
    page: String(page),
  });

  const url = `${UK_CF_BASE_URL}?${params.toString()}`;
  console.log(`[UK Contracts Finder] Fetching: ${url}`);

  const data = await httpsGet(url);
  return data;
}

/**
 * Map a UK Contracts Finder release to our contract format.
 */
function mapUKContract(release) {
  const tender = release.tender || {};
  const buyer = release.buyer || {};
  const value = tender.value || {};
  const tenderPeriod = tender.tenderPeriod || {};

  return {
    id: release.id || release.ocid || `uk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: tender.title || release.tag?.[0] || "Untitled Contract",
    description: truncate(tender.description),
    country: "UK",
    source: "contracts-finder",
    agency: buyer.name || "Unknown Buyer",
    value: {
      min: value.amount || 0,
      max: value.amount || 0,
      currency: value.currency || "GBP",
    },
    postedDate: release.date || release.publishedDate || null,
    deadline: tenderPeriod.endDate || null,
    category: tender.classification?.description || tender.mainProcurementCategory || "General",
    type: mapUKTenderStatus(tender.status),
    url: release.tag?.includes("award")
      ? `https://www.contractsfinder.service.gov.uk/Notice/${release.ocid || ""}`
      : `https://www.contractsfinder.service.gov.uk/Notice/${release.ocid || ""}`,
    location: tender.deliveryAddresses?.[0]?.region || buyer.address?.region || "",
  };
}

function mapUKTenderStatus(status) {
  if (!status) return "solicitation";
  const s = status.toLowerCase();
  if (s === "active" || s === "open") return "solicitation";
  if (s === "planned") return "presolicitation";
  if (s === "complete" || s === "closed") return "award";
  return s;
}

/* ========================= AusTender (Australia) ========================= */

/**
 * Fetch from AusTender via Adzuna AU (government keyword).
 * The official AusTender RSS/OCDS APIs are blocked from VPS IPs (CloudFront 403).
 * Adzuna AU with "government" appended returns real public sector opportunities.
 */
async function fetchFromAusTender({ keyword, page = 1, pageSize = 20 }) {
  const searchTerm = keyword ? `${keyword} government` : "government tender";
  const countryCode = "au";
  const pageNum = Math.max(1, page);

  const params = new URLSearchParams({
    app_id: "9df86203",
    app_key: "c20c11fc4dcdb46f2c43f9c5412acbef",
    what: searchTerm,
    results_per_page: String(Math.min(50, pageSize)),
    "content-type": "application/json",
    sort_by: "date",
  });

  const url = `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${pageNum}?${params.toString()}`;
  console.log(`[AusTender/Adzuna] Fetching: ${url.replace("c20c11fc4dcdb46f2c43f9c5412acbef", "***")}`);

  const data = await httpsGet(url);
  
  // Map Adzuna results to OCDS-like format expected by mapAUContract
  const releases = (data.results || []).map((r) => ({
    tender: {
      title: r.title || "Untitled",
      description: r.description || "",
      status: "active",
      value: { amount: r.salary_min || 0, currency: "AUD" },
    },
    buyer: { name: r.company?.display_name || "Australian Government" },
    date: r.created || new Date().toISOString(),
    id: String(r.id || ""),
    ocid: r.redirect_url || "",
    _location: r.location?.display_name || "",
    _latitude: r.latitude,
    _longitude: r.longitude,
  }));

  return { releases, count: data.count || releases.length };
}

/**
 * Map an AusTender/Adzuna release to our contract format.
 */
function mapAUContract(release) {
  const tender = release.tender || {};
  const buyer = release.buyer || {};
  const value = tender.value || {};
  const tenderPeriod = tender.tenderPeriod || {};

  return {
    id: release.id || release.ocid || `au-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: tender.title || "Untitled Tender",
    description: truncate(tender.description),
    country: "AU",
    source: "austender",
    agency: buyer.name || "Unknown Agency",
    value: {
      min: value.amount || 0,
      max: value.amount || 0,
      currency: value.currency || "AUD",
    },
    postedDate: release.date || null,
    deadline: tenderPeriod.endDate || null,
    category: tender.classification?.description || tender.mainProcurementCategory || "Government",
    type: mapAUTenderStatus(tender.status),
    url: release.ocid
      ? (release.ocid.startsWith("http") ? release.ocid : `https://www.tenders.gov.au`)
      : "https://www.tenders.gov.au",
    location: release._location || tender.deliveryAddresses?.[0]?.region || buyer.address?.region || "",
  };
}

function mapAUTenderStatus(status) {
  if (!status) return "solicitation";
  const s = status.toLowerCase();
  if (s === "active" || s === "open") return "solicitation";
  if (s === "planned") return "presolicitation";
  if (s === "complete" || s === "closed") return "award";
  return s;
}

/* ========================= EU TED (Tenders Electronic Daily) ========================= */

/**
 * Fetch from EU TED API (requires POST, not GET).
 */
async function fetchFromEUTED({ keyword, page = 1, pageSize = 20 }) {
  const limit = Math.min(50, pageSize);

  // TED API v3 requires POST with JSON body
  const body = JSON.stringify({
    query: keyword || "services",
    page: page,
    limit: limit,
    fields: ["notice-title", "buyer-name", "publication-date", "deadline", "total-value", "notice-type", "country-origin", "description-lot"],
  });

  const url = EU_TED_BASE_URL;
  console.log(`[EU TED] POST to: ${url} with query="${keyword}"`);

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Oli-Locator-GovContracts/1.0",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`EU TED returned status ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse EU TED response: ${e.message}`));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`EU TED request failed: ${e.message}`)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("EU TED request timed out")); });
    req.write(body);
    req.end();
  });
}

/**
 * Map an EU TED notice to our contract format.
 */
function mapEUContract(notice) {
  const title = notice.title || notice.titles?.en || notice.titles?.fr || "Untitled Notice";
  const description = notice.description || notice.descriptions?.en || notice.descriptions?.fr || "";
  const buyer = notice.buyer || notice.buyers?.[0] || {};
  const value = notice.value || notice.estimatedValue || {};

  return {
    id: notice.id || notice.noticeId || `ted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: typeof title === "string" ? title : (title.en || title.fr || "Untitled"),
    description: truncate(typeof description === "string" ? description : (description.en || description.fr || "")),
    country: "EU",
    source: "ted",
    agency: buyer.name || buyer.officialName || "Unknown Buyer",
    value: {
      min: value.lowestValue || value.amount || 0,
      max: value.highestValue || value.amount || 0,
      currency: value.currency || "EUR",
    },
    postedDate: notice.publicationDate || notice.publishedDate || null,
    deadline: notice.deadline || notice.submissionDeadline || notice.tenderDeadline || null,
    category: notice.cpvDescriptions?.en?.[0] || notice.cpvCodes?.[0] || notice.mainActivity || "General",
    type: mapEUNoticeType(notice.type || notice.noticeType),
    url: notice.id
      ? `https://ted.europa.eu/en/notice/-/detail/${notice.id}`
      : "https://ted.europa.eu",
    location: notice.country || notice.performanceCountry || notice.buyer?.country || "",
  };
}

function mapEUNoticeType(type) {
  if (!type) return "solicitation";
  const t = type.toLowerCase();
  if (t.includes("contract") || t.includes("open")) return "solicitation";
  if (t.includes("prior") || t.includes("planning")) return "presolicitation";
  if (t.includes("award") || t.includes("result")) return "award";
  if (t.includes("corrigend")) return "amendment";
  return t;
}

/* ========================= Keyword Filter for AusTender ========================= */

/**
 * AusTender doesn't support keyword search via the dates endpoint,
 * so we filter results client-side by keyword.
 */
function filterByKeyword(contracts, keyword) {
  if (!keyword || keyword.trim() === "") return contracts;
  const terms = keyword.toLowerCase().split(/\s+/);
  return contracts.filter((c) => {
    const searchable = `${c.title} ${c.description} ${c.agency} ${c.category}`.toLowerCase();
    return terms.some((term) => searchable.includes(term));
  });
}

/* ========================= Main Search Function ========================= */

/**
 * Search government contracts/tenders across official APIs.
 *
 * @param {Object} params
 * @param {string} params.country - "US", "UK", "AU", "EU", or "ALL"
 * @param {string} params.keyword - Search term (e.g., "web development", "cleaning")
 * @param {number} [params.page=1] - Page number (1-indexed)
 * @param {number} [params.pageSize=20] - Results per page
 * @returns {Object} { contracts, total, page, pageSize, source, errors? }
 */
export async function searchGovContracts({ country, keyword, page = 1, pageSize = 20 }) {
  const countryUpper = (country || "ALL").toUpperCase();
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(100, pageSize));

  // Build cache key
  const cacheKey = getCacheKey({ fn: "govContracts", country: countryUpper, keyword, page: safePage, pageSize: safePageSize });

  // Check cache first
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[GovContracts Cache] Hit for: country=${countryUpper}, keyword="${keyword}", page=${safePage}`);
    return { ...cached, source: cached.source + " (cached)" };
  }

  console.log(`[GovContracts] Searching: country=${countryUpper}, keyword="${keyword}", page=${safePage}, pageSize=${safePageSize}`);

  const allContracts = [];
  const sources = [];
  const errors = [];

  // Determine which APIs to call
  const searchUS = countryUpper === "US" || countryUpper === "ALL";
  const searchUK = countryUpper === "UK" || countryUpper === "ALL";
  const searchAU = countryUpper === "AU" || countryUpper === "ALL";
  const searchEU = countryUpper === "EU" || countryUpper === "ALL";

  // Fetch from all relevant APIs in parallel
  const promises = [];

  if (searchUS) {
    promises.push(
      fetchFromSAM({ keyword, page: safePage, pageSize: safePageSize })
        .then((data) => {
          const opportunities = data.opportunitiesData || [];
          console.log(`[SAM.gov] Got ${opportunities.length} results`);
          const contracts = opportunities.map(mapSAMContract);
          allContracts.push(...contracts);
          sources.push("sam.gov");
        })
        .catch((err) => {
          console.error(`[SAM.gov Error] ${err.message}`);
          errors.push(`sam.gov: ${err.message}`);
        })
    );
  }

  if (searchUK) {
    promises.push(
      fetchFromUKContractsFinder({ keyword, page: safePage, pageSize: safePageSize })
        .then((data) => {
          const releases = data.releases || [];
          console.log(`[UK Contracts Finder] Got ${releases.length} results`);
          const contracts = releases.map(mapUKContract);
          allContracts.push(...contracts);
          sources.push("contracts-finder");
        })
        .catch((err) => {
          console.error(`[UK Contracts Finder Error] ${err.message}`);
          errors.push(`contracts-finder: ${err.message}`);
        })
    );
  }

  if (searchAU) {
    promises.push(
      fetchFromAusTender({ keyword, page: safePage, pageSize: safePageSize })
        .then((data) => {
          const releases = data.releases || [];
          console.log(`[AusTender] Got ${releases.length} results`);
          let contracts = releases.map(mapAUContract);
          // Client-side keyword filter since AusTender dates endpoint doesn't support keyword
          contracts = filterByKeyword(contracts, keyword);
          console.log(`[AusTender] ${contracts.length} results after keyword filter`);
          allContracts.push(...contracts);
          sources.push("austender");
        })
        .catch((err) => {
          console.error(`[AusTender Error] ${err.message}`);
          errors.push(`austender: ${err.message}`);
        })
    );
  }

  if (searchEU) {
    promises.push(
      fetchFromEUTED({ keyword, page: safePage, pageSize: safePageSize })
        .then((data) => {
          const notices = data.notices || data.results || [];
          console.log(`[EU TED] Got ${notices.length} results`);
          const contracts = notices.map(mapEUContract);
          allContracts.push(...contracts);
          sources.push("ted");
        })
        .catch((err) => {
          console.error(`[EU TED Error] ${err.message}`);
          errors.push(`ted: ${err.message}`);
        })
    );
  }

  // Wait for all API calls to complete
  await Promise.allSettled(promises);

  // Sort by posted date descending (newest first)
  allContracts.sort((a, b) => {
    const dateA = a.postedDate ? new Date(a.postedDate).getTime() : 0;
    const dateB = b.postedDate ? new Date(b.postedDate).getTime() : 0;
    return dateB - dateA;
  });

  // Paginate when searching ALL countries (individual APIs already paginated)
  let paginatedContracts = allContracts;
  let total = allContracts.length;

  if (countryUpper === "ALL") {
    const start = (safePage - 1) * safePageSize;
    paginatedContracts = allContracts.slice(start, start + safePageSize);
  }

  const result = {
    contracts: paginatedContracts,
    total,
    page: safePage,
    pageSize: safePageSize,
    source: sources.join("+") || "none",
    ...(errors.length > 0 && { errors }),
  };

  // Cache the result
  setCache(cacheKey, result);

  return result;
}
