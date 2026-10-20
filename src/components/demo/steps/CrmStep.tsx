import type { DemoSnapshot } from '@/models/Schema';
import { CrmContactBar, CrmProfile } from './crm/CrmContactBar';
import { CrmInbox } from './crm/CrmInbox';
import { CrmPipeline } from './crm/CrmPipeline';
import { CrmTimeline } from './crm/CrmTimeline';

/**
 * The same customer as in the chat, seen from the business's side, one view at a time:
 * the contact card, the timeline, the pipeline and the shared inbox.
 * @param props Component props.
 * @param props.data The demo snapshot.
 * @param props.part Which view this scene shows, from 1 to 4.
 * @returns The CRM mockup.
 */
export const CrmStep = (props: { data: DemoSnapshot; part: number }) => (
  <div className="space-y-4">
    <CrmContactBar data={props.data} />
    <div key={props.part} className="animate-in duration-500 fade-in slide-in-from-bottom-4">
      {props.part === 1 && <CrmProfile data={props.data} />}
      {props.part === 2 && <CrmTimeline data={props.data} />}
      {props.part === 3 && <CrmPipeline data={props.data} />}
      {props.part >= 4 && <CrmInbox data={props.data} />}
    </div>
  </div>
);
