import type { DemoSnapshot } from '@/models/Schema';
import { IPhoneFrame } from '../IPhoneFrame';
import { WhatsAppChat } from '../WhatsAppChat';

/**
 * The example chat on an iPhone, centred on the screen. On a phone it starts where the
 * phones under a scene label start, so it does not jump from one scene to the next.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.upTo How many chat messages this scene plays up to.
 * @returns The step visual.
 */
export const WhatsAppStep = (props: { data: DemoSnapshot; upTo: number }) => (
  <div className="flex justify-center pt-8 md:pt-0">
    <IPhoneFrame statusBarClassName="bg-[#f6f6f6] text-neutral-900">
      <WhatsAppChat
        company={props.data.company}
        messages={props.data.chat.messages}
        upTo={props.upTo}
      />
    </IPhoneFrame>
  </div>
);
