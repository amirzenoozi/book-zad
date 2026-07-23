// Text → tokens, plus page-text extraction. Deliberately tiny and dependency
// free: everything here runs on-device and nothing is transmitted.

// A compact English stop-word list. Good enough to keep TF-IDF focused on
// content words without pulling in a dependency.
const STOPWORDS = new Set(
  (
    'a about above after again against all am an and any are aren as at be because been before being below between ' +
    'both but by can cannot could did do does doing don down during each few for from further had has have having he ' +
    'her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not ' +
    'now of off on once only or other our ours ourselves out over own s so some such t than that the their theirs ' +
    'them themselves then there these they this those through to too under until up very was we were what when where ' +
    'which while who whom why will with would you your yours yourself yourselves also may many one two use using used ' +
    // url / markup noise that survives tokenising a link or page.
    'http https www com org net edu html htm php aspx index page home utm ref amp'
  ).split(' '),
);

/** Lowercase, split on non-letters/digits, drop stop-words and 1–2 char tokens. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || raw.length > 30) continue;
    if (STOPWORDS.has(raw)) continue;
    if (/^\d+$/.test(raw)) continue; // pure numbers rarely help
    out.push(raw);
  }
  return out;
}

/** Turn a token list into a term-frequency map. */
export function termFrequencies(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  return tf;
}

/**
 * Extract a page's readable text (content-script side). Prefers the main
 * article region, falls back to the body, and caps length so tokenising a huge
 * page stays cheap. Also includes the title and meta description, which carry a
 * lot of signal.
 */
export function extractPageText(doc: Document, maxChars = 20000): string {
  const parts: string[] = [];
  if (doc.title) parts.push(doc.title);

  const desc = doc.querySelector<HTMLMetaElement>('meta[name="description"]')?.content;
  if (desc) parts.push(desc);

  const main =
    doc.querySelector('main') ??
    doc.querySelector('article') ??
    doc.querySelector('[role="main"]') ??
    doc.body;
  if (main) parts.push(main.innerText || main.textContent || '');

  return parts.join('\n').slice(0, maxChars);
}
