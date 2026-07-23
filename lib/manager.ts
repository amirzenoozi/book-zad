// Opens the full manager page, reusing an already-open tab if there is one.
// Shared by the popup ("Open manager") and the background (toast "Open folder").

export const MANAGER_PATH = '/manager.html';

export async function openManager(): Promise<void> {
  const url = browser.runtime.getURL(MANAGER_PATH);
  const open = await browser.tabs.query({ url });
  const first = open[0];
  if (first?.id !== undefined) {
    await browser.tabs.update(first.id, { active: true });
    if (first.windowId !== undefined) {
      await browser.windows.update(first.windowId, { focused: true });
    }
  } else {
    await browser.tabs.create({ url });
  }
}
