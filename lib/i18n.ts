// Localisation. Static UI text lives in `public/_locales/<lang>/messages.json`
// and the browser picks the file matching its UI language, falling back to the
// `default_locale` (en) for anything we don't ship. Code calls `t()`; markup
// carries `data-i18n` attributes resolved by `localizeDom()` on load.

import type { UiLanguage } from './types';

/** A message name from `_locales`. WXT derives this union from messages.json
 *  when it generates types, so a typo in a key is a compile error. */
export type MessageKey = Parameters<typeof browser.i18n.getMessage>[0];

/** Literal paths — `runtime.getURL` is typed against the known public files, so
 *  it won't accept a path built by string concatenation. */
const LOCALE_FILES = {
  en: '/_locales/en/messages.json',
  fa: '/_locales/fa/messages.json',
} as const;

/**
 * Messages for a manually chosen language. `browser.i18n` is fixed to the
 * browser's UI language and can't be redirected, so an explicit choice is
 * served from the bundled file instead. Null means "follow the browser".
 */
let overrides: Record<string, { message: string }> | null = null;

/**
 * Load the language the user picked. Call once, before first paint, in every
 * context that renders UI. 'auto' costs nothing — it just leaves the i18n API
 * in charge. A failed fetch falls back to the browser's own pick rather than
 * leaving the UI blank.
 */
export async function initI18n(language: UiLanguage): Promise<void> {
  overrides = null;
  if (language === 'auto') return;
  try {
    const res = await fetch(browser.runtime.getURL(LOCALE_FILES[language]));
    overrides = (await res.json()) as Record<string, { message: string }>;
  } catch {
    overrides = null;
  }
}

/** Look up a message, substituting $1…$9. Falls back to the key itself so a
 *  missing string shows up as an obvious `some_key` rather than a blank. */
export function t(key: MessageKey, subs?: string | string[]): string {
  const override = overrides?.[key]?.message;
  if (override !== undefined) return substitute(override, subs);
  return browser.i18n.getMessage(key, subs) || key;
}

/** What `browser.i18n.getMessage` does for us when we're not overriding: fill
 *  $1…$9 from the substitution list, and unescape a literal $$. */
function substitute(message: string, subs?: string | string[]): string {
  if (subs === undefined) return message.replace(/\$\$/g, '$');
  const list = Array.isArray(subs) ? subs : [subs];
  return message.replace(/\$(\$|\d)/g, (whole, c: string) =>
    c === '$' ? '$' : (list[Number(c) - 1] ?? whole),
  );
}

/** Locale actually in use — the one whose messages.json got picked, which is
 *  not necessarily the browser UI language (we fall back to English). */
export function localeCode(): string {
  return t('locale_code');
}

export function isRtl(): boolean {
  return t('locale_dir') === 'rtl';
}

/**
 * Stamp `<html lang/dir>`. Everything directional keys off `dir`: the CSS uses
 * logical properties, and `[dir='rtl']` puts Vazirmatn at the front of the font
 * stack. Call this before first paint to avoid a flash of the wrong direction.
 */
export function applyDirection(): void {
  const el = document.documentElement;
  el.lang = localeCode();
  el.dir = isRtl() ? 'rtl' : 'ltr';
}

/**
 * Resolve `data-i18n` (textContent), `data-i18n-placeholder` and
 * `data-i18n-title` across a tree. Static markup only — anything rendered from
 * script calls `t()` directly.
 */
export function localizeDom(root: ParentNode = document): void {
  // Attribute values are plain strings, so the key union can't be checked here
  // — a bad name renders as itself, which is visible at a glance.
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n as MessageKey);
  }
  for (const el of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    el.placeholder = t(el.dataset.i18nPlaceholder as MessageKey);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle as MessageKey);
  }
}

/** "3 bookmarks" / "1 bookmark" — the i18n API has no plural rules, so pick the
 *  key and let each locale decide (Persian uses one form for both). */
export function plural(count: number, oneKey: MessageKey, otherKey: MessageKey): string {
  return t(count === 1 ? oneKey : otherKey, String(count));
}
