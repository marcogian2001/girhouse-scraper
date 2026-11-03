import { useId } from 'react';

/** The seal's zigzag edge: 36 points, alternating between the tips and the notches. */
const EDGE = Array.from({ length: 72 }, (_unused, index) => {
  const radius = index % 2 === 0 ? 98 : 89;
  const angle = (index / 72) * Math.PI * 2;

  return `${(100 + radius * Math.cos(angle)).toFixed(1)},${(100 + radius * Math.sin(angle)).toFixed(1)}`;
}).join(' ');

/**
 * A five pointed star.
 * @param options The star.
 * @param options.x Its centre, across.
 * @param options.y Its centre, down.
 * @param options.size Its outer radius.
 * @returns The polygon's points.
 */
const starPoints = (options: { x: number; y: number; size: number }) =>
  Array.from({ length: 10 }, (_unused, index) => {
    const radius = index % 2 === 0 ? options.size : options.size * 0.45;
    const angle = (index / 10) * Math.PI * 2 - Math.PI / 2;

    return `${(options.x + radius * Math.cos(angle)).toFixed(1)},${(options.y + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

/**
 * The gold 30 day guarantee seal: a zigzag edge, a rope ring, "GARANZIA" along the top of
 * a black band and the 30 days at the centre.
 * @param props Component props.
 * @param props.className Size classes.
 * @returns The seal.
 */
export const GuaranteeSeal = (props: { className?: string }) => {
  const id = useId();
  const gold = `${id}-gold`;
  const top = `${id}-top`;

  return (
    <svg viewBox="0 0 200 200" aria-hidden className={props.className ?? 'size-16'}>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.45" stopColor="#f2b51a" />
          <stop offset="1" stopColor="#b7791f" />
        </linearGradient>
        <path id={top} d="M 42 100 A 58 58 0 0 1 158 100" />
      </defs>
      <polygon points={EDGE} fill={`url(#${gold})`} />
      <circle cx="100" cy="100" r="82" fill={`url(#${gold})`} stroke="#9a6412" strokeWidth="1.5" />
      <circle
        cx="100"
        cy="100"
        r="77"
        fill="none"
        stroke="#fff3c4"
        strokeWidth="3"
        strokeDasharray="3 3"
      />
      <circle cx="100" cy="100" r="72" fill="#1c1c1c" />
      <circle cx="100" cy="100" r="45" fill={`url(#${gold})`} stroke="#fff3c4" strokeWidth="2" />
      <text
        fill="#ffffff"
        fontSize="17"
        fontWeight="900"
        letterSpacing="3"
        fontFamily="Arial, sans-serif"
      >
        <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">
          GARANZIA
        </textPath>
      </text>
      <polygon points={starPoints({ x: 42, y: 100, size: 8 })} fill="#f2b51a" />
      <polygon points={starPoints({ x: 158, y: 100, size: 8 })} fill="#f2b51a" />
      <text
        x="100"
        y="104"
        textAnchor="middle"
        fill="#1c1c1c"
        fontSize="42"
        fontWeight="900"
        fontFamily="Arial, sans-serif"
      >
        30
      </text>
      <text
        x="100"
        y="123"
        textAnchor="middle"
        fill="#1c1c1c"
        fontSize="13"
        fontWeight="900"
        letterSpacing="1"
        fontFamily="Arial, sans-serif"
      >
        GIORNI
      </text>
      {[88, 100, 112].map((x) => (
        <polygon key={x} points={starPoints({ x, y: 134, size: 4 })} fill="#7c4a0a" />
      ))}
    </svg>
  );
};
