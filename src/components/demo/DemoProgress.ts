import { useSyncExternalStore } from 'react';

const keyOf = (slug: string) => `girhouse-demo-progress:${slug}`;

/**
 * Reads a saved progress, kept only while the demo still has the same scenes.
 * @param options The saved value and the demo's scenes.
 * @param options.saved What storage holds, written as `scene/count`.
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
 * Remembers the scene the visitor reached, so reloading or reopening the link resumes there.
 * @param options The demo and the scene.
 * @param options.slug The demo slug.
 * @param options.scene The scene on screen.
 * @param options.count How many scenes the demo has.
 */
export const saveDemoProgress = (options: { slug: string; scene: number; count: number }) => {
  try {
    localStorage.setItem(keyOf(options.slug), `${options.scene}/${options.count}`);
  } catch {
    // Private windows can refuse storage; the demo then starts over on reload
  }
};

const readDemoProgress = (options: { slug: string; count: number }) => {
  try {
    return parseDemoProgress({
      saved: localStorage.getItem(keyOf(options.slug)),
      count: options.count,
    });
  } catch {
    return null;
  }
};

// Another tab of the same demo moving on updates this one too
const subscribe = (onChange: () => void) => {
  window.addEventListener('storage', onChange);

  return () => {
    window.removeEventListener('storage', onChange);
  };
};

/**
 * Returns the scene this browser stopped on last time, read after hydration so the server
 * and the first render agree. A link to a step wins over it.
 * @param options The demo.
 * @param options.slug The demo slug.
 * @param options.count How many scenes the demo has.
 * @param options.initialStep The step the link opens on, if any.
 * @returns The scene to resume from, or null.
 */
export const useResumeScene = (options: {
  slug: string;
  count: number;
  initialStep: number | null;
}) =>
  useSyncExternalStore(
    subscribe,
    () => (options.initialStep ? null : readDemoProgress(options)),
    () => null,
  );
