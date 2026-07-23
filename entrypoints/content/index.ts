import { sendMessage } from '@/lib/messaging';
import { getSettings } from '@/lib/settings';
import { extractPageText, tokenize, termFrequencies } from '@/lib/text';
import { showToast } from '@/lib/toast';

// Runs on every page. It (1) reads the page text and asks the background worker
// whether it resembles a saved folder — driving the toolbar badge and, if the
// user opted in, an in-page toast — and (2) tracks foreground dwell time to
// feed the bookmark scoring. Everything is compared on-device; page text never
// leaves the browser.

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  async main() {
    // Top frame only, and only real web pages (skip about:, data:, etc.).
    if (window.top !== window.self) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

    const text = extractPageText(document);
    const tokens = termFrequencies(tokenize(text));

    startDwellTracking(tokens);

    const settings = await getSettings();
    if (!settings.nudgeEnabled) return;

    const { matches } = await sendMessage('analyzePage', {
      url: location.href,
      title: document.title,
      text,
    });

    if (matches.length > 0 && settings.toastEnabled) {
      const top = matches[0];
      if (top) {
        showToast(top, {
          onAdd: async () => {
            const res = await sendMessage('addToFolder', {
              url: location.href,
              title: document.title,
              folderId: top.folderId,
            });
            return res.ok;
          },
          onOpen: () => {
            void sendMessage('openManagerAt', { folderId: top.folderId });
          },
        });
      }
    }
  },
});

/** Accumulate visible time and report it (with page tokens) when the page goes
 *  away, so the bookmark's usage score reflects real engagement. */
function startDwellTracking(tokens: Record<string, number>): void {
  let dwellMs = 0;
  let activeSince = document.visibilityState === 'visible' ? Date.now() : 0;

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      activeSince = Date.now();
    } else if (activeSince) {
      dwellMs += Date.now() - activeSince;
      activeSince = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    if (activeSince) {
      dwellMs += Date.now() - activeSince;
      activeSince = 0;
    }
    void sendMessage('recordVisit', {
      url: location.href,
      title: document.title,
      dwellMs,
      tokens,
    });
  };
  // pagehide fires on navigation, tab close and bfcache — the reliable exit hook.
  window.addEventListener('pagehide', report);
}
