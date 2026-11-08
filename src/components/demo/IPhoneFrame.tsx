/**
 * A current-generation iPhone: titanium frame, side buttons, Dynamic Island and status bar.
 * Its width follows the screen's height, so the whole phone fits above Gigi's bar and keeps
 * its shape on a short laptop screen. It keeps room for the tour's header, a hair of padding
 * and a scene label, whether the scene shows one or not, so the phone is the same in every scene.
 * @param props Component props.
 * @param props.children The screen content, below the status bar.
 * @param props.statusBarClassName Colours of the status bar, to match the app on screen.
 * @returns The phone mockup.
 */
export const IPhoneFrame = (props: { children: React.ReactNode; statusBarClassName?: string }) => (
  <div className="relative mx-auto w-[clamp(12rem,var(--phone-w),300px)] shrink-0 [--phone-reserve:5.5rem] [--phone-w:calc((100svh-var(--demo-bar-h,12rem)-var(--phone-reserve)-24px)*9/19.5+24px)] sm:w-[clamp(12rem,var(--phone-w),320px)] md:[--phone-reserve:10rem]">
    {/* Side buttons */}
    <span className="absolute top-28 -left-[3px] h-8 w-[3px] rounded-l bg-neutral-400" />
    <span className="absolute top-40 -left-[3px] h-14 w-[3px] rounded-l bg-neutral-400" />
    <span className="absolute top-56 -left-[3px] h-14 w-[3px] rounded-l bg-neutral-400" />
    <span className="absolute top-44 -right-[3px] h-20 w-[3px] rounded-r bg-neutral-400" />

    <div className="rounded-[3.4rem] bg-gradient-to-br from-neutral-300 via-neutral-100 to-neutral-400 p-[3px] shadow-2xl">
      <div className="rounded-[3.3rem] bg-neutral-950 p-[9px]">
        <div className="relative flex aspect-[9/19.5] w-full flex-col overflow-hidden rounded-[2.75rem] bg-white">
          <div
            className={`relative z-10 flex h-12 shrink-0 items-center justify-between px-[9%] pt-1 text-[13px] font-semibold ${props.statusBarClassName ?? 'bg-white text-neutral-900'}`}
          >
            <span>9:41</span>
            {/* Sized on the screen like a real iPhone's, so it never covers the time on a narrow phone */}
            <span className="absolute top-2.5 left-1/2 aspect-[125/37] w-[32%] -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1">
              <svg viewBox="0 0 18 12" className="h-3 w-[18px] fill-current" aria-hidden>
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
                <rect x="10" y="3" width="3" height="9" rx="1" />
                <rect x="15" y="0" width="3" height="12" rx="1" />
              </svg>
              <svg viewBox="0 0 16 12" className="h-3 w-4 fill-current" aria-hidden>
                <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10 10 0 0 0 8 .4 10 10 0 0 0 .8 3.3L2 4.6a8.4 8.4 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.6 6.6 0 0 0 8 4a6.6 6.6 0 0 0-4.7 1.8l1.3 1.3A4.8 4.8 0 0 1 8 5.8Zm0 3.5c-.6 0-1.1.2-1.5.6L8 11.5l1.5-1.6c-.4-.4-.9-.6-1.5-.6Z" />
              </svg>
              <span className="relative ml-0.5 h-[11px] w-6 rounded-[3px] border border-current/50 p-[1.5px]">
                <span className="block h-full w-4/5 rounded-[1.5px] bg-current" />
              </span>
            </span>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">{props.children}</div>

          <span className="absolute bottom-2 left-1/2 h-[5px] w-32 -translate-x-1/2 rounded-full bg-neutral-900/80" />
        </div>
      </div>
    </div>
  </div>
);
