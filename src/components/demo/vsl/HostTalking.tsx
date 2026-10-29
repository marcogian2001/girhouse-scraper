import Image from 'next/image';

/** Gianmarco talking, made once by Kling Avatar from his photo and his own voice. */
const HOST_LOOP = {
  full: '/demo/gianmarco/host-talk',
  face: '/demo/gianmarco/host-talk-face',
};

/**
 * Gianmarco talking on a muted loop, with his still picture over it while he is quiet. The
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
 * Gianmarco from the chest up, for the screens he has to himself.
 * @param props Component props.
 * @param props.isTalking Whether his voice is playing.
 * @returns The animated host.
 */
export const HostTalkingFull = (props: { isTalking: boolean }) => (
  <HostLoop
    isTalking={props.isTalking}
    loop={HOST_LOOP.full}
    className="aspect-[468/720] h-[min(20rem,34svh)] rounded-3xl shadow-2xl ring-4 ring-white md:h-96"
  />
);

/**
 * Gianmarco's face in a circle, talking in the corner of every scene.
 * @param props Component props.
 * @param props.isTalking Whether his voice is playing.
 * @param props.className Size classes.
 * @returns The animated avatar.
 */
export const HostTalkingFace = (props: { isTalking: boolean; className?: string }) => (
  <HostLoop
    isTalking={props.isTalking}
    loop={HOST_LOOP.face}
    className={`rounded-full border-4 border-white bg-white shadow-xl ring-2 ring-(--demo-primary)/30 ${props.className ?? 'size-16'}`}
  />
);

/** Gianmarco's still picture, for the start screen. */
export const HOST_POSTER = { src: `${HOST_LOOP.full}.jpg`, width: 468, height: 720 };
