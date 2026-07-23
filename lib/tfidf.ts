// A tiny, dependency-free TF-IDF + cosine-similarity engine. Runs entirely
// on-device in the background worker — the core of the "similarity nudge".

export type TermMap = Record<string, number>;

/** Inverse document frequency over a corpus of term-frequency maps. */
export interface Idf {
  weights: TermMap;
  /** IDF to use for a query term unseen in the corpus. */
  fallback: number;
}

export function buildIdf(docs: TermMap[]): Idf {
  const n = docs.length || 1;
  const df: TermMap = {};
  for (const doc of docs) {
    for (const term of Object.keys(doc)) df[term] = (df[term] ?? 0) + 1;
  }
  const weights: TermMap = {};
  for (const term of Object.keys(df)) {
    weights[term] = Math.log(1 + n / (1 + df[term]!));
  }
  return { weights, fallback: Math.log(1 + n) };
}

/** Weight a term-frequency map into a TF-IDF vector (sublinear tf). */
export function tfidf(tf: TermMap, idf: Idf): TermMap {
  const v: TermMap = {};
  for (const term of Object.keys(tf)) {
    v[term] = (1 + Math.log(tf[term]!)) * (idf.weights[term] ?? idf.fallback);
  }
  return v;
}

/** Cosine similarity of two sparse vectors, in [0, 1] for non-negative weights. */
export function cosine(a: TermMap, b: TermMap): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const t of Object.keys(a)) {
    const av = a[t]!;
    na += av * av;
    const bv = b[t];
    if (bv !== undefined) dot += av * bv;
  }
  for (const t of Object.keys(b)) nb += b[t]! * b[t]!;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Sum several term-frequency maps into one (e.g. a folder's bookmarks). */
export function mergeTf(maps: TermMap[]): TermMap {
  const out: TermMap = {};
  for (const m of maps) {
    for (const t of Object.keys(m)) out[t] = (out[t] ?? 0) + m[t]!;
  }
  return out;
}

/** Multiply every count in a term-frequency map (to weight a high-signal source
 *  like a hand-written note more heavily than incidental title/url words). */
export function scaleTf(tf: TermMap, factor: number): TermMap {
  const out: TermMap = {};
  for (const t of Object.keys(tf)) out[t] = tf[t]! * factor;
  return out;
}
