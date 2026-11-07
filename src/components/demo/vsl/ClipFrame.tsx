import { TRUST_CLIP } from './VideoScript';

/**
 * Holds the demo's one media element: hidden while it says the voices, between the top bar
 * and Gigi's bar while it plays the trust clip.
 * @param props Component props.
 * @param props.isClip Whether it plays the trust clip.
 * @param props.children The media element.
 * @returns The frame.
 */
export const ClipFrame = (props: { isClip: boolean; children: React.ReactNode }) => (
  <div
    className={
      props.isClip
        ? 'fixed inset-x-4 top-14 bottom-[calc(var(--demo-bar-h,6rem)+1rem)] z-10 mx-auto flex max-w-6xl'
        : 'hidden'
    }
  >
    {props.children}
  </div>
);

/**
 * Gives the media element the clip's first frame and name while it plays the trust clip.
 * @param isClip Whether it plays the trust clip.
 * @param label What the clip is, for screen readers.
 * @returns The attributes.
 */
export const clipAttributes = (isClip: boolean, label: string) =>
  isClip ? { poster: TRUST_CLIP.poster, 'aria-label': label } : {};
