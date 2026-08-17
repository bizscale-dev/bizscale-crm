// Fetches a WordPress-style page sitemap for a client's site and extracts the page
// URLs from it — used by the EOD Report page-picker (src/app/web-seo-manager/eod/)
// so a manager can pick which specific page their work applies to.
//
// Plain fetch + regex extraction, no XML parsing dependency — matches the codebase's
// existing rolled-by-hand parsing style (see parseCsv in src/lib/googleSheets.js).
// The regex `<loc>...</loc>` is safe against sitemap image extensions: real WordPress
// sitemaps also emit `<image:loc>` tags, but the literal 5-character sequence "<loc>"
// never occurs inside "<image:loc>" (the character right before "loc>" there is ":",
// not "<"), so those are never matched.

const FETCH_TIMEOUT_MS = 10000;

function extractLocs(xml) {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
  return matches.map(m => m.replace(/<\/?loc>/g, '').trim()).filter(Boolean);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function toOrigin(siteUrl) {
  try {
    const withScheme = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * Fetches the page list for a client's site. Tries the standard Yoast/WordPress
 * "page-sitemap.xml" first; if that's missing or empty, falls back to reading
 * sitemap_index.xml and following whichever listed sitemap looks like the pages one.
 *
 * Returns { pages: string[] } on success, or { error, allowManual: true } on failure
 * — allowManual tells the caller to fall back to letting the user type a page URL
 * in by hand rather than dead-ending.
 */
export async function getSitePages(siteUrl) {
  if (!siteUrl) {
    return { error: 'No website on file for this client', allowManual: true };
  }

  const origin = toOrigin(siteUrl);
  if (!origin) {
    return { error: 'Invalid website URL on file for this client', allowManual: true };
  }

  const directXml = await fetchText(`${origin}/page-sitemap.xml`);
  if (directXml) {
    const pages = extractLocs(directXml);
    if (pages.length > 0) return { pages };
  }

  const indexXml = await fetchText(`${origin}/sitemap_index.xml`);
  if (indexXml) {
    const sitemapLocs = extractLocs(indexXml);
    const pageSitemapUrl = sitemapLocs.find(loc => loc.toLowerCase().includes('page-sitemap'));
    if (pageSitemapUrl) {
      const fallbackXml = await fetchText(pageSitemapUrl);
      if (fallbackXml) {
        const pages = extractLocs(fallbackXml);
        if (pages.length > 0) return { pages };
      }
    }
  }

  return { error: 'Could not find a page sitemap for this site', allowManual: true };
}
