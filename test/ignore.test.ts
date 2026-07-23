import { describe, it, expect } from 'vitest';
import { toHost, isIgnored, PRESETS, DEFAULT_PRESET_KEY } from '@/lib/ignore';

describe('toHost', () => {
  it('reduces a url to a bare host', () => {
    expect(toHost('https://www.google.com/search?q=hello')).toBe('google.com');
    expect(toHost('http://example.com:8080/a/b')).toBe('example.com');
    expect(toHost('https://user:pass@example.com/x')).toBe('example.com');
  });

  it('accepts a domain typed by hand', () => {
    expect(toHost('  Example.COM  ')).toBe('example.com');
    expect(toHost('www.example.com')).toBe('example.com');
    expect(toHost('example.com.')).toBe('example.com');
    expect(toHost('example.com/maps')).toBe('example.com');
  });

  it('keeps subdomains distinct', () => {
    expect(toHost('https://mail.google.com')).toBe('mail.google.com');
  });

  it('rejects input with no usable host', () => {
    expect(toHost('')).toBe('');
    expect(toHost('   ')).toBe('');
    expect(toHost('not a domain')).toBe('');
    expect(toHost('about:blank')).toBe('');
    expect(toHost('single')).toBe('');
  });

  it('allows localhost as the one dotless host', () => {
    expect(toHost('http://localhost:3000/app')).toBe('localhost');
  });
});

describe('presets', () => {
  it('lists only already-normalised hosts', () => {
    for (const preset of PRESETS) {
      for (const site of preset.sites) {
        expect(toHost(site), `${preset.key}: ${site}`).toBe(site);
      }
    }
  });

  it('has unique keys and no duplicate sites within a preset', () => {
    const keys = PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const preset of PRESETS) {
      expect(new Set(preset.sites).size, preset.key).toBe(preset.sites.length);
    }
  });

  it('keeps groups disjoint, so toggling one off cannot silently unmute another', () => {
    for (const a of PRESETS) {
      for (const b of PRESETS) {
        if (a.key === b.key) continue;
        const shared = a.sites.filter((s) => b.sites.includes(s));
        expect(shared, `${a.key} ∩ ${b.key}`).toEqual([]);
      }
    }
  });

  it('mutes the common search engines by default', () => {
    const preset = PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY);
    expect(preset).toBeDefined();
    for (const url of [
      'https://www.google.com/search?q=dune',
      'https://duckduckgo.com/?q=dune',
      'https://www.bing.com/search?q=dune',
    ]) {
      expect(isIgnored(url, preset!.sites), url).toBe(true);
    }
    // ...without muting an ordinary site.
    expect(isIgnored('https://rottentomatoes.com/m/dune', preset!.sites)).toBe(false);
  });
});

describe('isIgnored', () => {
  const list = ['google.com', 'localhost'];

  it('matches the host itself', () => {
    expect(isIgnored('https://google.com/', list)).toBe(true);
    expect(isIgnored('https://www.google.com/search?q=x', list)).toBe(true);
  });

  it('matches subdomains of a listed domain', () => {
    expect(isIgnored('https://mail.google.com/inbox', list)).toBe(true);
  });

  it('does not match unrelated hosts', () => {
    expect(isIgnored('https://example.com/', list)).toBe(false);
  });

  it('does not match a domain that merely ends with the entry', () => {
    expect(isIgnored('https://notgoogle.com/', list)).toBe(false);
    expect(isIgnored('https://fakegoogle.com/', list)).toBe(false);
  });

  it('is false for an empty list or an unusable url', () => {
    expect(isIgnored('https://google.com/', [])).toBe(false);
    expect(isIgnored('about:blank', list)).toBe(false);
  });
});
