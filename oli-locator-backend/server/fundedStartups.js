import https from 'https';

// ============================================================
// fundedStartups.js
// Searches 3 free APIs (no keys needed) for recently funded /
// hiring / launched startups:
//   1. SEC EDGAR Full-Text Search (Form D filings)
//   2. Hacker News Algolia – "hiring" comments
//   3. Hacker News Algolia – "Show HN" stories (launches)
// ============================================================

// --------------- Cache (10-minute TTL) ---------------
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // key -> { timestamp, data }

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  console.log(`[fundedStartups] Cache hit for key: ${key}`);
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { timestamp: Date.now(), data });
}

export function clearStartupCache() {
  console.log(`[fundedStartups] Clearing cache (${cache.size} entries)`);
  cache.clear();
}

// --------------- HTTPS helper (Node built-in only) ---------------
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const requestOptions = {
      hostname: opts.hostname,
      port: opts.port || 443,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...headers,
      },
    };

    console.log(`[fundedStartups] Fetching: ${url}`);

    const req = https.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error from ${url}: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} from ${url}: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
    req.end();
  });
}

// --------------- 1. SEC EDGAR (Form D filings) ---------------
async function searchSECEdgar(keyword) {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];
  const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const encoded = encodeURIComponent(keyword);
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encoded}&dateRange=custom&startdt=${startDate}&enddt=${endDate}&forms=D`;

  try {
    const data = await fetchJSON(url, {
      'User-Agent': 'OliLocator/1.0 (contact@workitlikeapro.com)',
    });

    const hits = data?.hits?.hits || [];
    console.log(`[fundedStartups] SEC EDGAR returned ${hits.length} hits for "${keyword}"`);

    return hits.map((hit, idx) => {
      const src = hit._source || {};
      const companyName = src.entity_name || (src.display_names && src.display_names[0]) || 'Unknown Company';
      const fileDate = src.file_date || '';
      const fileNum = src.file_num || '';

      return {
        id: `sec-${fileNum || idx}-${fileDate}`,
        title: `${companyName} — Form D Filing`,
        description: truncate(`${companyName} filed Form D with SEC on ${fileDate}. This indicates a recent private capital raise (Regulation D exemption).`, 300),
        source: 'sec-edgar',
        type: 'funding',
        company: companyName,
        amount: '', // Form D index search doesn't always expose amount
        industry: '',
        postedDate: fileDate ? new Date(fileDate).toISOString() : new Date().toISOString(),
        location: '',
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${encodeURIComponent(fileNum)}&type=D&dateb=&owner=include&count=10`,
        signal: 'Just raised capital',
      };
    });
  } catch (err) {
    console.error(`[fundedStartups] SEC EDGAR error: ${err.message}`);
    return [];
  }
}

// --------------- 2. Hacker News – Hiring comments ---------------
async function searchHNHiring(keyword) {
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const encoded = encodeURIComponent(`${keyword} hiring`);
  const url = `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=comment&hitsPerPage=20&numericFilters=created_at_i>${thirtyDaysAgo}`;

  try {
    const data = await fetchJSON(url);
    const hits = data?.hits || [];
    console.log(`[fundedStartups] HN Hiring returned ${hits.length} hits for "${keyword}"`);

    return hits.map((hit) => {
      const text = hit.comment_text || hit.story_text || '';
      const plainText = stripHtml(text);
      const companyName = extractCompanyFromHNComment(plainText) || 'Unknown Company';

      return {
        id: `hn-hiring-${hit.objectID}`,
        title: `${companyName} is hiring (HN)`,
        description: truncate(plainText, 300),
        source: 'hackernews',
        type: 'hiring',
        company: companyName,
        amount: '',
        industry: '',
        postedDate: hit.created_at || new Date().toISOString(),
        location: extractLocation(plainText),
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        signal: 'Actively hiring',
      };
    });
  } catch (err) {
    console.error(`[fundedStartups] HN Hiring error: ${err.message}`);
    return [];
  }
}

// --------------- 3. Hacker News – Show HN (launches) ---------------
async function searchHNLaunches(keyword) {
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const encoded = encodeURIComponent(`Show HN ${keyword}`);
  const url = `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=20&numericFilters=created_at_i>${thirtyDaysAgo}`;

  try {
    const data = await fetchJSON(url);
    const hits = data?.hits || [];
    console.log(`[fundedStartups] HN Launches returned ${hits.length} hits for "${keyword}"`);

    return hits.map((hit) => {
      const title = hit.title || '';
      const companyName = extractCompanyFromShowHN(title) || hit.author || 'Unknown';

      return {
        id: `hn-launch-${hit.objectID}`,
        title: title,
        description: truncate(hit.story_text ? stripHtml(hit.story_text) : `${title} — launched on Hacker News`, 300),
        source: 'producthunt',
        type: 'launch',
        company: companyName,
        amount: '',
        industry: '',
        postedDate: hit.created_at || new Date().toISOString(),
        location: '',
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        signal: 'Just launched',
      };
    });
  } catch (err) {
    console.error(`[fundedStartups] HN Launches error: ${err.message}`);
    return [];
  }
}

// --------------- Main exported function ---------------
export async function searchFundedStartups({ keyword = 'startup', page = 1, pageSize = 20 } = {}) {
  const cacheKey = `startups:${keyword}`;
  const cached = getCached(cacheKey);

  if (cached) {
    // Paginate cached results
    const start = (page - 1) * pageSize;
    const paged = cached.slice(start, start + pageSize);
    return {
      startups: paged,
      total: cached.length,
      page,
      pageSize,
      source: 'cache',
    };
  }

  console.log(`[fundedStartups] Searching all sources for keyword: "${keyword}"`);

  // Fire all 3 searches in parallel
  const [secResults, hnHiringResults, hnLaunchResults] = await Promise.all([
    searchSECEdgar(keyword),
    searchHNHiring(keyword),
    searchHNLaunches(keyword),
  ]);

  // Merge and sort by date descending
  const allResults = [...secResults, ...hnHiringResults, ...hnLaunchResults];
  allResults.sort((a, b) => {
    const dateA = new Date(a.postedDate).getTime() || 0;
    const dateB = new Date(b.postedDate).getTime() || 0;
    return dateB - dateA;
  });

  console.log(`[fundedStartups] Total merged results: ${allResults.length} (SEC: ${secResults.length}, HN Hiring: ${hnHiringResults.length}, HN Launches: ${hnLaunchResults.length})`);

  // Cache the full merged list
  setCache(cacheKey, allResults);

  // Paginate
  const start = (page - 1) * pageSize;
  const paged = allResults.slice(start, start + pageSize);

  return {
    startups: paged,
    total: allResults.length,
    page,
    pageSize,
    source: 'live',
  };
}

// --------------- Utility helpers ---------------

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCompanyFromHNComment(text) {
  // HN hiring comments typically start with "Company Name | ..."
  const pipeMatch = text.match(/^([^|]+)\s*\|/);
  if (pipeMatch) return pipeMatch[1].trim();

  // Or first line before a dash
  const dashMatch = text.match(/^([^—–\-\n]+)\s*[—–\-]/);
  if (dashMatch && dashMatch[1].trim().length < 60) return dashMatch[1].trim();

  // Fallback: first few words
  const words = text.split(/\s+/).slice(0, 3).join(' ');
  return words.length > 40 ? words.slice(0, 40) : words;
}

function extractCompanyFromShowHN(title) {
  // "Show HN: CompanyName – description"
  const match = title.match(/^Show HN:\s*([^—–\-:]+)/i);
  if (match) return match[1].trim();
  return '';
}

function extractLocation(text) {
  // Try to find common location patterns
  const patterns = [
    /\b(Remote)\b/i,
    /\b(San Francisco|SF|NYC|New York|Los Angeles|LA|Austin|Seattle|Boston|Chicago|Denver|Miami|London|Berlin|Toronto)\b/i,
    /\b([A-Z][a-z]+,\s*[A-Z]{2})\b/, // City, ST format
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return '';
}
