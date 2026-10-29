import Image from 'next/image';

/**
 * Gigi talking, cut from his price video. Gianmarco's own loops, made with Kling Avatar from
 * his photo, are in `public/demo/gianmarco/host-talk*` for when he narrates instead.
 */
const HOST_LOOP = {
  full: '/demo/gigi-talk',
  face: '/demo/gigi-talk-face',
};

/**
 * Gigi talking on a muted loop, with his still picture over it while he is quiet. The
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
 * Gigi full figure, for the screens he has to himself.
 * @param props Component props.
 * @param props.isTalking Whether his voice is playing.
 * @returns The animated host.
 */
export const HostTalkingFull = (props: { isTalking: boolean }) => (
  <HostLoop
    isTalking={props.isTalking}
    loop={HOST_LOOP.full}
    className="aspect-[483/720] h-[min(18rem,29svh)] rounded-3xl mix-blend-multiply md:h-80"
  />
);

/**
 * Gigi's head in a circle, talking in the corner of every scene.
 * @param props Component props.
 * @param props.isTalking Whether his voice is playing.
 * @param props.className Size classes.
 * @returns The animated avatar.
 */
export const HostTalkingFace = (props: { isTalking: boolean; className?: string }) => (
  <HostLoop
    isTalking={props.isTalking}
    loop={HOST_LOOP.face}
    className={`rounded-full border-4 border-white bg-white shadow-xl ring-2 ring-amber-200 ${props.className ?? 'size-16'}`}
  />
);

/** Gigi's still picture, for the start screen. */
export const HOST_POSTER = { src: `${HOST_LOOP.full}.jpg`, width: 483, height: 720 };
