/** A year: the scene is kept for a lead who opens the link again days later. */
const MAX_AGE_MS = 365 * 86_400_000;

/**
 * Names the cookie that keeps where this browser stopped on a demo. A cookie, so the server
 * reads it and the page opens straight on that scene.
 * @param slug The demo slug.
 * @returns The cookie name.
 */
export const demoProgressCookie = (slug: string) => `demo-progress-${slug}`;

/**
 * Reads a saved progress, kept only while the demo still has the same scenes.
 * @param options The saved value and the demo's scenes.
 * @param options.saved What the cookie holds, written as `scene/count`.
 * @param options.count How many scenes the demo has now.
 * @returns The scene to resume from, or null to start from the beginning.
 */
export const parseDemoProgress = (options: { saved: string | null; count: number }) => {
  const [scene, count] = (options.saved ?? '').split('/').map(Number);

  // A rebuilt demo has other scenes, and the first scene is the start anyway
  if (!scene || count !== options.count || !Number.isInteger(scene) || scene >= count) {
    return null;
  }

  return scene;
};

/**
 * Remembers the scene the visitor reached, so reloading or reopening the link opens there.
 * A browser without the Cookie Store API starts the demo over instead.
 * @param options The demo and the scene.
 * @param options.slug The demo slug.
 * @param options.scene The scene on screen.
 * @param options.count How many scenes the demo has.
 */
export const saveDemoProgress = async (options: { slug: string; scene: number; count: number }) => {
  if (!('cookieStore' in window)) {
    return;
  }

  try {
    await window.cookieStore.set({
      name: demoProgressCookie(options.slug),
      value: `${options.scene}/${options.count}`,
      path: '/',
      expires: Date.now() + MAX_AGE_MS,
      sameSite: 'lax',
    });
  } catch {
    // A browser that refuses cookies starts the demo over on reload
  }
};
