'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Globe,
  Inbox,
  MapPin,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Star,
  Users,
  Wrench,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTimedSequence } from '../useTimedSequence';
import type { VslScene } from './VslScript';

const PATH: { key: 'search' | 'find' | 'write' | 'back'; icon: LucideIcon }[] = [
  { key: 'search', icon: Search },
  { key: 'find', icon: Star },
  { key: 'write', icon: MessageCircle },
  { key: 'back', icon: RefreshCw },
];

type Tile = {
  icon: LucideIcon;
  key: `video_graphic_${1 | 2 | 3 | 4 | 5 | 6}_${1 | 2 | 3}`;
};

/** The three moves each step of the video shows, in order. */
const TILES: Record<number, Tile[]> = {
  1: [
    { icon: MapPin, key: 'video_graphic_1_1' },
    { icon: Search, key: 'video_graphic_1_2' },
    { icon: Globe, key: 'video_graphic_1_3' },
  ],
  2: [
    { icon: CheckCircle2, key: 'video_graphic_2_1' },
    { icon: Send, key: 'video_graphic_2_2' },
    { icon: Star, key: 'video_graphic_2_3' },
  ],
  3: [
    { icon: MessageCircle, key: 'video_graphic_3_1' },
    { icon: BellRing, key: 'video_graphic_3_2' },
    { icon: Inbox, key: 'video_graphic_3_3' },
  ],
  4: [
    { icon: CalendarClock, key: 'video_graphic_4_1' },
    { icon: BellRing, key: 'video_graphic_4_2' },
    { icon: CalendarCheck, key: 'video_graphic_4_3' },
  ],
  5: [
    { icon: PackageCheck, key: 'video_graphic_5_1' },
    { icon: Users, key: 'video_graphic_5_2' },
    { icon: ShieldCheck, key: 'video_graphic_5_3' },
  ],
  6: [
    { icon: Send, key: 'video_graphic_6_1' },
    { icon: Wrench, key: 'video_graphic_6_2' },
    { icon: ShieldCheck, key: 'video_graphic_6_3' },
  ],
};

/** Scenes that leave room under them: the phones fill the screen on their own. */
const ROOMY_KINDS = new Set<VslScene['kind']>(['loss', 'google', 'offer', 'closing']);

const LINE_CLASS =
  'h-1 flex-1 animate-path-flow rounded-full bg-[length:24px_100%] bg-[repeating-linear-gradient(90deg,var(--demo-primary)_0_12px,transparent_12px_24px)]';

/**
 * The moving picture under a scene: the path from being looked for to coming back, with
 * the stretch on screen lit, and that stretch's three moves. It states no numbers.
 * @param props Component props.
 * @param props.scene The current scene.
 * @param props.isVideo Whether this is version C; version B has no graphic.
 * @returns The graphic, or nothing where it has no room.
 */
export const VideoGraphic = (props: { scene: VslScene; isVideo: boolean }) => {
  const t = useTranslations('DemoPage');
  const { step } = props.scene;
  const shown = useTimedSequence({ target: 3, intervalMs: 700, restartKey: step });
  const tiles = TILES[step];

  if (!props.isVideo || !tiles || !ROOMY_KINDS.has(props.scene.kind)) {
    return null;
  }

  return (
    <aside
      aria-hidden
      className="mx-auto mt-auto w-full max-w-5xl space-y-5 px-4 pt-6 pb-2 md:space-y-6"
    >
      <ol className="flex items-start">
        {PATH.map((node, index) => {
          // Steps past the path light it all: the offer covers every stretch
          const isLit = step > 4 || index + 1 === step;

          return (
            <li key={node.key} className="contents">
              {index > 0 && <span className={`mx-1 mt-5 md:mt-6 ${LINE_CLASS}`} />}
              <span className="flex w-16 shrink-0 flex-col items-center gap-1.5 md:w-24">
                <span
                  className={`flex size-10 items-center justify-center rounded-full transition-all duration-500 md:size-12 ${isLit ? 'scale-110 bg-(--demo-primary) text-(--demo-on-primary) shadow-lg' : 'bg-neutral-100 text-neutral-400'}`}
                >
                  <node.icon className="size-5" />
                </span>
                <span
                  className={`text-center text-xs font-semibold md:text-sm ${isLit ? 'text-neutral-950' : 'text-neutral-400'}`}
                >
                  {t(`video_path_${node.key}`)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <ul key={step} className="grid gap-2.5 md:grid-cols-3 md:gap-4">
        {tiles.slice(0, shown).map((tile) => (
          <li
            key={tile.key}
            className="flex animate-pop items-center gap-3 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-neutral-200 md:p-4"
          >
            <span className="flex size-10 shrink-0 animate-pulse items-center justify-center rounded-xl bg-(--demo-primary)/10 text-(--demo-primary)">
              <tile.icon className="size-5" />
            </span>
            <span className="text-sm font-semibold text-neutral-800">{t(tile.key)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
};
