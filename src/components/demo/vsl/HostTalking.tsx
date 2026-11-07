import Image from 'next/image';
import type { Narrator } from '@/utils/HostVoice';

/**
 * Each narrator's talking loops, chest up and face only, on a white background the page
 * blends away. Gigi's are cut from his price video; Gianmarco's come from
 * `scripts/generate-host-loop.ts`.
 */
const HOSTS = {
  gigi: {
    full: '/demo/gigi-talk',
    face: '/demo/gigi-talk-face',
    width: 483,
    height: 720,
    aspect: 'aspect-[483/720]',
    frame: 'rounded-3xl',
  },
  gianmarco: {
    full: '/demo/gianmarco/host-loop',
    face: '/demo/gianmarco/host-loop-face',
    width: 484,
    height: 720,
    aspect: 'aspect-[484/720]',
    // His arms reach the bottom edge: they fade out instead of stopping on a line
    frame: 'mask-b-from-80%',
  },
} satisfies Record<
  Narrator,
  { full: string; face: string; width: number; height: number; aspect: string; frame: string }
>;

/**
 * The narrator talking on a muted loop, with his still picture over it while he is quiet. The
 * voice plays apart, so the loop never has to match it word for word. The muted loop
 * autoplays everywhere; where it cannot, the still picture stays.
 * @param props Component props.
 * @param props.isTalking Whether his voice is playing.
 * @param props.loop The loop, from the chest up or only the face.
 * @param props.className Size and frame classes.
 * @returns The animated host.
 */
const HostLoop = (props: { isTalking: boolean; loop: string; className: string }) => (
  <span className={`relative block shrink-0 overflow-hidden ${props.className}`}>
    <video
      src={`${props.loop}.mp4`}
      poster={`${props.loop}.jpg`}
      muted
      loop
      autoPlay
      playsInline
      preload="auto"
      aria-hidden
      className="size-full object-cover"
    />
    <Image
      src={`${props.loop}.jpg`}
      alt=""
      fill
      sizes="(min-width: 768px) 20rem, 12rem"
      className={`object-cover transition-opacity duration-200 ${props.isTalking ? 'opacity-0' : 'opacity-100'}`}
    />
  </span>
);

/**
 * The narrator from the chest up, for the screens he has to himself.
 * @param props Component props.
 * @param props.narrator Who narrates.
 * @param props.isTalking Whether his voice is playing.
 * @returns The animated host.
 */
export const HostTalkingFull = (props: { narrator: Narrator; isTalking: boolean }) => {
  const host = HOSTS[props.narrator];

  return (
    <HostLoop
      isTalking={props.isTalking}
      loop={host.full}
      className={`h-[min(18rem,29svh)] mix-blend-multiply md:h-80 ${host.aspect} ${host.frame}`}
    />
  );
};

/**
 * The narrator's head in a circle, talking in the corner of every scene.
 * @param props Component props.
 * @param props.narrator Who narrates.
 * @param props.isTalking Whether his voice is playing.
 * @param props.className Size classes.
 * @returns The animated avatar.
 */
export const HostTalkingFace = (props: {
  narrator: Narrator;
  isTalking: boolean;
  className?: string;
}) => (
  <HostLoop
    isTalking={props.isTalking}
    loop={HOSTS[props.narrator].face}
    className={`rounded-full border-4 border-white bg-white shadow-xl ring-2 ring-amber-200 ${props.className ?? 'size-16'}`}
  />
);

/**
 * The narrator's still picture, for the start screen.
 * @param narrator Who narrates.
 * @returns The picture, its size and its frame classes.
 */
export const hostPoster = (narrator: Narrator) => {
  const host = HOSTS[narrator];

  return { src: `${host.full}.jpg`, width: host.width, height: host.height, frame: host.frame };
};
