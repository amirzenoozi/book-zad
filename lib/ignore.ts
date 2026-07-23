// The muted-sites list: hosts the similarity nudge stays quiet on — search
// engines, mail, dashboards, anything you pass through rather than collect.
// Stored in `storage.sync` under its own key so it roams with the profile and
// keeps a size quota separate from the settings object.

export const IGNORE_KEY = 'ignoredSites';

/** Set once the default preset has been seeded, so removing a seeded site
 *  doesn't bring it back on the next startup. */
const SEEDED_KEY = 'ignoreSeeded';

/** A one-click bundle of sites to mute. `sites` are already normalised hosts. */
export interface Preset {
  key: string;
  label: string;
  hint: string;
  sites: string[];
}

/**
 * Curated bundles the manager offers as buttons. These are surfaces you pass
 * *through* — you search, read mail or scroll a feed there, you don't collect
 * them — so a folder suggestion is noise. Only `search` is applied by default;
 * the rest are opt-in.
 */
export const PRESETS: Preset[] = [
  {
    key: 'search',
    label: 'Search engines',
    hint: 'Muted by default — you search from these, you don’t bookmark them.',
    sites: [
      'google.com',
      'bing.com',
      'duckduckgo.com',
      'search.yahoo.com',
      'search.brave.com',
      'ecosia.org',
      'startpage.com',
      'qwant.com',
      'baidu.com',
      'yandex.com',
      'ask.com',
    ],
  },
  {
    key: 'mail',
    label: 'Mail & messaging',
    hint: 'Inboxes and chat apps you keep open all day.',
    sites: [
      'mail.google.com',
      'outlook.com',
      'outlook.live.com',
      'outlook.office.com',
      'mail.yahoo.com',
      'mail.proton.me',
      'web.whatsapp.com',
      'web.telegram.org',
      'slack.com',
      'discord.com',
      'teams.microsoft.com',
    ],
  },
  {
    key: 'social',
    label: 'Social feeds',
    hint: 'Endless feeds — mute the site, or leave it on if you file posts.',
    sites: [
      'facebook.com',
      'x.com',
      'twitter.com',
      'instagram.com',
      'tiktok.com',
      'linkedin.com',
      'threads.net',
    ],
  },
];

/** The preset applied on a fresh install. */
export const DEFAULT_PRESET_KEY = 'search';

/**
 * Seed the default preset the first time the extension runs. Idempotent — the
 * seeded flag means a site you remove stays removed.
 */
export async function seedDefaultIgnores(): Promise<void> {
  const data = await browser.storage.sync.get([SEEDED_KEY, IGNORE_KEY]);
  if (data[SEEDED_KEY]) return;
  const existing = Array.isArray(data[IGNORE_KEY]) ? (data[IGNORE_KEY] as string[]) : [];
  const preset = PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY);
  await browser.storage.sync.set({
    [IGNORE_KEY]: [...new Set([...existing, ...(preset?.sites ?? [])])].sort(),
    [SEEDED_KEY]: true,
  });
}

/** Mute every site in a preset. Already-listed ones are left alone. */
export async function addPresetSites(sites: string[]): Promise<string[]> {
  const list = await getIgnoredSites();
  return save([...list, ...sites]);
}

/** Unmute every site in a preset, leaving anything you added yourself alone. */
export async function removePresetSites(sites: string[]): Promise<string[]> {
  const drop = new Set(sites);
  const list = await getIgnoredSites();
  return save(list.filter((entry) => !drop.has(entry)));
}

/**
 * Reduce a url — or a domain the user typed — to a bare host: lowercased, with
 * the scheme, credentials, "www.", port and path stripped. Returns '' when
 * there's nothing usable left, so callers can reject bad input by falsiness.
 */
export function toHost(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  s = s.replace(/^[^/@]*@/, ''); // user:pass@
  s = s.split(/[/?#]/)[0] ?? ''; // path / query / hash
  s = s.replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(s)) return '';
  // A real host has a dot; "localhost" is the one useful exception.
  if (!s.includes('.') && s !== 'localhost') return '';
  return s;
}

/** True when the url's host is a listed site, or a subdomain of one — muting
 *  "google.com" also mutes "mail.google.com". */
export function isIgnored(url: string, list: string[]): boolean {
  const host = toHost(url);
  if (!host) return false;
  return list.some((entry) => host === entry || host.endsWith('.' + entry));
}

export async function getIgnoredSites(): Promise<string[]> {
  const data = await browser.storage.sync.get(IGNORE_KEY);
  const list = data[IGNORE_KEY];
  return Array.isArray(list) ? (list as string[]) : [];
}

/** Add a site, given a url or a bare domain. No-op for unreadable input. */
export async function addIgnoredSite(input: string): Promise<string[]> {
  const host = toHost(input);
  const list = await getIgnoredSites();
  if (!host || list.includes(host)) return list;
  return save([...list, host]);
}

export async function removeIgnoredSite(host: string): Promise<string[]> {
  const list = await getIgnoredSites();
  return save(list.filter((entry) => entry !== host));
}

/** Drop every entry that mutes this url — the host itself *and* any parent
 *  domain covering it — so "suggest here again" actually unmutes the page. */
export async function unmuteUrl(url: string): Promise<string[]> {
  const host = toHost(url);
  if (!host) return getIgnoredSites();
  const list = await getIgnoredSites();
  return save(list.filter((entry) => !(host === entry || host.endsWith('.' + entry))));
}

async function save(list: string[]): Promise<string[]> {
  const sorted = [...new Set(list)].sort();
  await browser.storage.sync.set({ [IGNORE_KEY]: sorted });
  return sorted;
}
