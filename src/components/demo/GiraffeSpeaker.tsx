import Image from 'next/image';
import type { HighlightSegment } from './Highlights';
import { sliceHighlights, visibleLength } from './Highlights';

/**
 * Renders the typed part of a line, keeping its bold and highlighted runs.
 * @param props Component props.
 * @param props.segments The runs of the line.
 * @param props.typed How many characters are shown.
 * @returns The styled text.
 */
export const TypedText = (props: { segments: HighlightSegment[]; typed: number }) => {
  const isTyping = props.typed < visibleLength(props.segments);

  return (
    <>
      {sliceHighlights(props.segments, props.typed).map((segment, index) => {
        const key = `${index}-${segment.style}`;

        if (segment.style === 'bold') {
          return (
            <strong key={key} className="font-bold text-neutral-950">
              {segment.text}
            </strong>
          );
        }

        if (segment.style === 'mark') {
          return (
            <mark key={key} className="rounded-sm bg-yellow-200 px-0.5 text-neutral-950">
              {segment.text}
            </mark>
          );
        }

        return <span key={key}>{segment.text}</span>;
      })}
      {isTyping && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-neutral-400 align-middle" />
      )}
    </>
  );
};

/**
 * Gigi's round face, moving as if talking while a line is typed.
 * @param props Component props.
 * @param props.isTalking Whether a line is being typed.
 * @param props.className Size classes.
 * @returns The avatar.
 */
export const GiraffeFace = (props: { isTalking: boolean; className?: string }) => (
  <span
    className={`block shrink-0 ${props.isTalking ? 'animate-giraffe-talk' : 'animate-giraffe-idle'} motion-reduce:animate-none`}
  >
    <Image
      src="/demo/giraffe-face.jpg"
      alt=""
      width={96}
      height={96}
      className={`rounded-full border-4 border-white bg-white object-cover shadow-xl ring-2 ring-amber-200 ${props.className ?? 'size-20'}`}
    />
  </span>
);
