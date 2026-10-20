const STORAGE_KEY = 'girhouse-demo-session';

let fallback: string | undefined;

/**
 * Returns the random id of this browser tab's visit, so its events are grouped
 * without knowing who the visitor is.
 * @returns The same id for the life of the tab.
 */
export const getDemoSessionId = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);

    if (stored) {
      return stored;
    }

    const created = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, created);

    return created;
  } catch {
    // Private windows can refuse storage; the id then lasts as long as the page
    fallback ??= crypto.randomUUID();

    return fallback;
  }
};

/**
 * Reports one event of the demo page, surviving the tab being closed.
 * @param slug The demo slug.
 * @param event The event, without the session id.
 */
export const sendDemoEvent = (slug: string, event: { type: string; step?: number }) => {
  const body = JSON.stringify({ ...event, sessionId: getDemoSessionId() });

  navigator.sendBeacon(`/api/demo/${slug}/events`, new Blob([body], { type: 'application/json' }));
};
