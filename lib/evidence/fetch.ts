import 'server-only';

/**
 * Controlled evidence retrieval layer.
 *
 * Fetches a submitted deliverable server-side and extracts structured,
 * inspectable evidence: HTTP status, content type, page title, plain text,
 * and structural signals (headings, contact form fields, images, viewport meta).
 *
 * The AI agent reasons over THIS evidence — it never fetches URLs itself.
 * If something cannot be established from the available evidence, the agent
 * must mark the criterion INCONCLUSIVE (honesty over optimism).
 */

export interface FetchedEvidence {
  url: string;
  finalUrl: string;
  httpStatus: number | null;
  ok: boolean;
  contentType: string | null;
  title: string | null;
  text: string;
  htmlSnippet: string;
  signals: {
    hasContactForm: boolean;
    formFieldNames: string[];
    hasSubmitButton: boolean;
    headings: string[];
    imageCount: number;
    hasViewportMeta: boolean;
    linkCount: number;
  };
  error: string | null;
  fetchedAt: string;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB cap
const MAX_TEXT_CHARS = 8000;
const MAX_HTML_CHARS = 4000;
const FETCH_TIMEOUT_MS = 10_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSignals(html: string, text: string) {
  const formMatch = html.match(/<form[\s\S]*?<\/form>/i);
  const formHtml = formMatch ? formMatch[0] : '';
  const fieldNames = Array.from(formHtml.matchAll(/<(?:input|textarea|select)[^>]*name=["']([^"']+)["']/gi)).map(
    (m) => m[1]
  );
  const hasSubmitButton = /<button[^>]*type=["']?submit["']?[^>]*>/i.test(formHtml) || /<input[^>]*type=["']submit["']/i.test(formHtml);
  const headings = Array.from(html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi))
    .map((m) => stripHtml(m[1]).slice(0, 120))
    .filter((h) => h.length > 0)
    .slice(0, 25);
  const imageCount = (html.match(/<img[\s>]/gi) || []).length;
  const hasViewportMeta = /<meta[^>]*name=["']viewport["']/i.test(html);
  const linkCount = (html.match(/<a[\s>]/gi) || []).length;
  return {
    hasContactForm: !!formMatch,
    formFieldNames: fieldNames,
    hasSubmitButton,
    headings,
    imageCount,
    hasViewportMeta,
    linkCount,
    textLength: text.length,
  };
}

export async function fetchDeliverable(rawUrl: string): Promise<FetchedEvidence> {
  const fetchedAt = new Date().toISOString();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      url: rawUrl, finalUrl: rawUrl, httpStatus: null, ok: false, contentType: null, title: null,
      text: '', htmlSnippet: '',
      signals: { hasContactForm: false, formFieldNames: [], hasSubmitButton: false, headings: [], imageCount: 0, hasViewportMeta: false, linkCount: 0 },
      error: 'Invalid URL', fetchedAt,
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      url: rawUrl, finalUrl: rawUrl, httpStatus: null, ok: false, contentType: null, title: null,
      text: '', htmlSnippet: '',
      signals: { hasContactForm: false, formFieldNames: [], hasSubmitButton: false, headings: [], imageCount: 0, hasViewportMeta: false, linkCount: 0 },
      error: `Unsupported protocol: ${url.protocol}`, fetchedAt,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'TrustLockEvidenceBot/1.0 (+hackathon demo)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const contentType = res.headers.get('content-type');
    const buf = Buffer.from(await res.arrayBuffer());
    const html = buf.subarray(0, MAX_BYTES).toString('utf8');
    const text = stripHtml(html).slice(0, MAX_TEXT_CHARS);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 200) : null;
    return {
      url: rawUrl,
      finalUrl: res.url || rawUrl,
      httpStatus: res.status,
      ok: res.ok,
      contentType,
      title,
      text,
      htmlSnippet: html.slice(0, MAX_HTML_CHARS),
      signals: extractSignals(html, text),
      error: res.ok ? null : `HTTP ${res.status}`,
      fetchedAt,
    };
  } catch (err: any) {
    return {
      url: rawUrl, finalUrl: rawUrl, httpStatus: null, ok: false, contentType: null, title: null,
      text: '', htmlSnippet: '',
      signals: { hasContactForm: false, formFieldNames: [], hasSubmitButton: false, headings: [], imageCount: 0, hasViewportMeta: false, linkCount: 0 },
      error: err?.name === 'AbortError' ? `Fetch timed out after ${FETCH_TIMEOUT_MS}ms` : (err?.message ?? 'Fetch failed'),
      fetchedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch an additional evidence reference (best-effort, errors are recorded). */
export async function fetchEvidenceRef(rawUrl: string): Promise<{ url: string; summary: string; fetched: FetchedEvidence }> {
  const fetched = await fetchDeliverable(rawUrl);
  const summary = fetched.error
    ? `${rawUrl} → error: ${fetched.error}`
    : `${rawUrl} → HTTP ${fetched.httpStatus} ${fetched.contentType ?? ''} · title: ${fetched.title ?? 'n/a'} · ${fetched.text.length} chars of text`;
  return { url: rawUrl, summary, fetched };
}

/** Human-readable summary of fetched evidence for the agent prompt. */
export function summarizeFetchedEvidence(fetched: FetchedEvidence): string {
  if (fetched.error && !fetched.text) {
    return `- URL: ${fetched.url}\n- Result: ERROR — ${fetched.error}`;
  }
  const s = fetched.signals;
  return [
    `- URL: ${fetched.url} (final: ${fetched.finalUrl})`,
    `- HTTP status: ${fetched.httpStatus} (ok: ${fetched.ok})`,
    `- Content-Type: ${fetched.contentType ?? 'unknown'}`,
    `- Page title: ${fetched.title ?? 'n/a'}`,
    `- Detected headings: ${s.headings.length ? s.headings.map((h) => `"${h}"`).join(', ') : 'none'}`,
    `- Contact form detected: ${s.hasContactForm ? 'yes' : 'no'}${s.hasContactForm ? ` (fields: ${s.formFieldNames.join(', ') || 'none named'}; submit button: ${s.hasSubmitButton ? 'yes' : 'no'})` : ''}`,
    `- Images: ${s.imageCount} · Links: ${s.linkCount} · Viewport meta tag: ${s.hasViewportMeta ? 'present' : 'absent'}`,
    `- Extracted page text (truncated to ${fetched.text.length} chars):`,
    '"""',
    fetched.text.slice(0, 6000),
    '"""',
  ].join('\n');
}
