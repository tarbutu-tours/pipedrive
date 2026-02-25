/**
 * Crawls the full agency website (tarbutu.co.il). Result cached 8 hours.
 * Automatic refresh every 8 hours.
 */

import axios from 'axios';
import { config } from '../config.js';

const BASE_URL = (config.websiteUrl || 'https://tarbutu.co.il').replace(/\/$/, '');
const CACHE_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const REFRESH_INTERVAL_MS = 8 * 60 * 60 * 1000; // 8 hours – periodic rescan
const MAX_TOTAL_LENGTH = 45000;   // total chars to send to AI
const MAX_PER_PAGE = 8000;        // trim each page
const MAX_PAGES = 120;            // max pages to crawl
const BATCH_SIZE = 5;             // concurrent requests
const DELAY_MS = 300;             // delay between batches (avoid overloading server)

let cachedText = '';
let cacheTime = 0;

/** Fallback when crawl fails completely */
const FALLBACK_CONTENT = `
טיולי תרבות, קרוזים וסמינרים מטיילים – תרבותו. טלפון 03-5260090.
קרוזים לפיורדים הנורבגיים, איסלנד, ים בלטי, איים בריטיים, דנובה, דואורו, סרדיניה, ונציה, גלאפגוס, אמירויות. שייט נהרות: דורדון, דנובה, ריין, סיין, מקונג.
`;

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[\n\r]+\s*/g, '\n')
    .trim();
}

/** Normalize URL: same domain only, no fragment, single trailing slash for path */
function normalizeUrl(href, base) {
  if (!href || typeof href !== 'string') return null;
  const u = href.trim().split('#')[0].trim();
  if (!u || u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('javascript:')) return null;
  let full;
  try {
    full = u.startsWith('http') ? new URL(u) : new URL(u, base);
  } catch {
    return null;
  }
  if (full.origin !== new URL(BASE_URL).origin) return null;
  let path = full.pathname.replace(/\/+/g, '/') || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path === '/' ? full.origin : full.origin + path;
}

/** Extract internal links from HTML */
function extractLinks(html, pageUrl) {
  const out = new Set();
  const base = pageUrl.endsWith('/') ? pageUrl : pageUrl + '/';
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = normalizeUrl(m[1], base);
    if (n) out.add(n);
  }
  return [...out];
}

const FETCH_OPTIONS = {
  timeout: 15000,
  responseType: 'text',
  headers: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
  },
  validateStatus: (s) => s >= 200 && s < 400,
};

async function fetchPage(url) {
  try {
    const { data } = await axios.get(url, FETCH_OPTIONS);
    return { html: data, ok: true };
  } catch {
    return { html: '', ok: false };
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Crawl site: start from homepage, follow all internal links, collect text.
 * Stops at MAX_PAGES or when total length >= MAX_TOTAL_LENGTH.
 */
export async function getWebsiteContext() {
  if (cachedText && Date.now() - cacheTime < CACHE_TTL_MS) {
    return cachedText;
  }

  const visited = new Set();
  const seed = normalizeUrl(BASE_URL + '/', BASE_URL) || BASE_URL;
  const toVisit = [seed];
  const pageTexts = [];
  let totalLength = 0;

  try {
    while (toVisit.length > 0 && visited.size < MAX_PAGES && totalLength < MAX_TOTAL_LENGTH) {
      const batch = toVisit.splice(0, BATCH_SIZE).filter((u) => !visited.has(u));
      if (batch.length === 0) break;

      const results = await Promise.all(batch.map((url) => fetchPage(url)));

      for (let i = 0; i < batch.length; i++) {
        const url = batch[i];
        const { html, ok } = results[i];
        visited.add(url);

        if (!ok || !html) continue;

        const text = stripHtml(html);
        if (text.length < 80) continue;

        const chunk = text.slice(0, MAX_PER_PAGE);
        pageTexts.push(chunk);
        totalLength += chunk.length;

        const links = extractLinks(html, url);
        for (const link of links) {
          if (!visited.has(link) && !toVisit.includes(link)) toVisit.push(link);
        }
      }

      if (batch.length > 0 && toVisit.length > 0) await sleep(DELAY_MS);
    }

    if (pageTexts.length > 0) {
      const combined = pageTexts.join('\n\n---\n\n').slice(0, MAX_TOTAL_LENGTH);
      cachedText = combined;
      cacheTime = Date.now();
      console.log(`[websiteContent] Crawled ${visited.size} pages, ${combined.length} chars`);
      return cachedText;
    }
  } catch (err) {
    console.warn('Website crawl error:', err.message);
  }

  if (cachedText && cachedText.length > 200) return cachedText;
  return FALLBACK_CONTENT;
}

export function preloadWebsiteContext() {
  getWebsiteContext().catch(() => {});
}

/** Start periodic rescan every 8 hours. Call once from server startup. */
export function startPeriodicRefresh() {
  setInterval(() => {
    cacheTime = 0;
    cachedText = '';
    getWebsiteContext().then(() => {
      console.log('[websiteContent] Periodic 8h refresh completed');
    }).catch((err) => {
      console.warn('[websiteContent] Periodic refresh failed:', err.message);
    });
  }, REFRESH_INTERVAL_MS);
}
