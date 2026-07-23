// Localisation. Static UI text lives in `public/_locales/<lang>/messages.json`
// and the browser picks the file matching its UI language, falling back to the
// `default_locale` (en) for anything we don't ship. Code calls `t()`; markup
// carries `data-i18n` attributes resolved by `localizeDom()` on load.

/** A message name from `_locales`. WXT derives this union from messages.json
 *  when it generates types, so a typo in a key is a compile error. */
export type MessageKey = Parameters<typeof browser.i18n.getMessage>[0];

/** Look up a message, substituting $1…$9. Falls back to the key itself so a
 *  missing string shows up as an obvious `some_key` rather than a blank. */
export function t(key: MessageKey, subs?: string | string[]): string {
  return browser.i18n.getMessage(key, subs) || key;
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
