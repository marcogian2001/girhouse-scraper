import Image from 'next/image';

/**
 * Gigi talking on a muted loop, cut from his price video, with his still picture over it
 * while he is quiet. The voice plays apart, so the loop never has to match it word for word.
 * The muted loop autoplays everywhere; where it cannot, the still picture stays.
 * @param props Component props.
 * @param props.isTalking Whether his voice is playing.
 * @param props.video The loop, full figure or only the head.
 * @param props.className Size and frame classes.
 * @returns The animated Gigi.
 */
const GigiLoop = (props: {
  isTalking: boolean;
  video: 'talk' | 'talk-face';
  className: string;
}) => (
  <span className={`relative block shrink-0 overflow-hidden ${props.className}`}>
    <video
      src={`/demo/gigi-${props.video}.mp4`}
      poster={`/demo/gigi-${props.video}.jpg`}
      muted
      loop
      autoPlay
      playsInline
      preload="auto"
      aria-hidden
      className="size-full object-cover"
    />
    <Image
      src={`/demo/gigi-${props.video}.jpg`}
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
 * @returns The animated Gigi.
 */
export const GigiTalkingFull = (props: { isTalking: boolean }) => (
  <GigiLoop
    isTalking={props.isTalking}
    video="talk"
    className="aspect-[483/720] h-[min(18rem,29svh)] rounded-3xl mix-blend-multiply md:h-80"
  />
);

/**
 * Gigi's head in a circle, the mini Gigi talking in the corner of every scene.
 * @param props Component props.
 * @param props.isTalking Whether his voice is playing.
 * @param props.className Size classes.
 * @returns The animated avatar.
 */
export const GigiTalkingFace = (props: { isTalking: boolean; className?: string }) => (
  <GigiLoop
    isTalking={props.isTalking}
    video="talk-face"
    className={`rounded-full border-4 border-white bg-white shadow-xl ring-2 ring-amber-200 ${props.className ?? 'size-16'}`}
  />
);
