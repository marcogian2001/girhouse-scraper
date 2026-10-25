import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/StatusBadge';
import { TableFrame } from '@/components/TableFrame';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { leadSearchSchema } from '@/models/Schema';

type LeadSearchStatus = (typeof leadSearchSchema.$inferSelect)['status'];

/**
 * Shows how each region of a search split by region is doing against its share.
 * @param props Component props.
 * @param props.regions The per-region searches, north to south.
 * @returns The table of regions.
 */
export const RegionalSearchTable = (props: {
  regions: {
    id: string;
    location: string;
    maxResults: number;
    ready: number;
    status: LeadSearchStatus;
    errorMessage: string | null;
  }[];
}) => {
  const t = useTranslations('RegionalSearchTable');

  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('column_region')}</TableHead>
            <TableHead>{t('column_status')}</TableHead>
            <TableHead className="text-right">{t('column_ready')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {props.regions.map((region) => (
            <TableRow key={region.id}>
              <TableCell className="font-medium">
                {region.location}
                {region.errorMessage && (
                  <p className="text-xs font-normal text-destructive">{region.errorMessage}</p>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge kind="leadSearch" status={region.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {t('ready_of_share', { ready: region.ready, share: region.maxResults })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
};
