import { supabaseAdmin } from "./supabase";

// Best-effort site scrape. Jina Reader is primary; one fallback (direct fetch
// with a realistic browser UA, stripped to text). Successful scrapes are
// cached per domain in scrape_cache (~7 days) so retries and repeat prospects
// don't re-fetch. Returns "" on ANY failure — never throws.

const MAX_CHARS = 6000;
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function normalizeTarget(url: string): { target: string; domain: string } | null {
  let target = url.trim();
  if (!target) return null;
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  try {
    const domain = new URL(target).hostname.replace(/^www\./i, "").toLowerCase();
    return { target, domain };
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

async function jinaScrape(target: string): Promise<string> {
  const res = await fetchWithTimeout(`https://r.jina.ai/${target}`, { headers: { Accept: "text/plain" } });
  if (!res?.ok) return "";
  try {
    return (await res.text()).slice(0, MAX_CHARS);
  } catch {
    return "";
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&quot;|&#39;|&amp;|&lt;|&gt;|&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function directScrape(target: string): Promise<string> {
  const res = await fetchWithTimeout(target, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!res?.ok) return "";
  try {
    const html = await res.text();
    return htmlToText(html).slice(0, MAX_CHARS);
  } catch {
    return "";
  }
}

export async function scrapeSite(url: string | null | undefined): Promise<string> {
  if (!url) return "";
  const normalized = normalizeTarget(url);
  if (!normalized) return "";
  const { target, domain } = normalized;

  // Cache read — fully graceful if the scrape_cache table doesn't exist yet.
  try {
    const db = supabaseAdmin();
    const { data } = await db.from("scrape_cache").select("content, fetched_at").eq("domain", domain).maybeSingle();
    if (data?.content && Date.now() - new Date(data.fetched_at).getTime() < CACHE_TTL_MS) {
      return data.content;
    }
  } catch {
    // cache unavailable — proceed to live scrape
  }

  let text = await jinaScrape(target);
  if (!text) text = await directScrape(target);

  if (text) {
    try {
      const db = supabaseAdmin();
      await db.from("scrape_cache").upsert({ domain, content: text, fetched_at: new Date().toISOString() });
    } catch {
      // cache write is best-effort
    }
  }
  return text;
}
