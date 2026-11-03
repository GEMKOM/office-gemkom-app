import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import {
  markPlanningRequestItemCritical,
  unmarkPlanningRequestItemCritical,
} from '@/api/planning/planningItems';
import { jobOrderKeys, meetingBriefQueryOptions, meetingSectionQueryOptions } from '@/api/projects/jobOrders';
import { notify } from '@/ui';
import { MeetingModal, ModalLoading } from './MeetingModal';
import s from './MeetingView.module.css';
import { FETCHED_SECTIONS, SECTION_MODAL_TITLES, SectionBody, pdfKindLabel } from './SectionBodies';
import type { MeetingBrief, MeetingItem, ProcurementRow, SectionDetail, SectionKind } from './types';

/** A section drill-down: welding and files from the brief, the rest fetched on open. */
export function SectionModal({
  kind,
  item,
  onClose,
}: {
  kind: SectionKind;
  item: MeetingItem;
  onClose: () => void;
}) {
  const jobNo = item.job_no;
  const queryClient = useQueryClient();
  // The slide already holds the brief; this only reads (and follows) it.
  const brief = useQuery({ ...meetingBriefQueryOptions<MeetingBrief>(jobNo), enabled: false }).data;
  const fetched = FETCHED_SECTIONS.has(kind);
  const section = useQuery({
    ...meetingSectionQueryOptions<SectionDetail>(jobNo, kind),
    enabled: fetched,
  });
  const [pending, setPending] = useState<ReadonlyMap<number, boolean>>(new Map());

  // Writes into a cached payload without restarting its 60 s freshness clock
  // (legacy edited the cached object in place).
  function patchCache<T>(key: QueryKey, update: (old: T) => T) {
    const updatedAt = queryClient.getQueryState(key)?.dataUpdatedAt;
    queryClient.setQueryData<T>(key, (old) => (old === undefined ? old : update(old)), { updatedAt });
  }

  // Kritik: imalat bu kalem olmadan devam edemez. The forecast holds Üretim's
  // start until every critical item is delivered, so the plan is dropped too.
  async function toggleCritical(row: ProcurementRow, critical: boolean) {
    const id = row.id;
    if (id === undefined) return;
    setPending((prev) => new Map(prev).set(id, critical));
    try {
      if (critical) await markPlanningRequestItemCritical(id);
      else await unmarkPlanningRequestItemCritical(id);
      patchCache<SectionDetail>(jobOrderKeys.meetingSection(jobNo, 'procurement'), (old) => ({
        ...old,
        items: (old.items ?? []).map((i) => (i.id === id ? { ...i, is_critical: critical } : i)),
      }));
      if (row.stage !== 'delivered') {
        patchCache<MeetingBrief>(jobOrderKeys.meetingBrief(jobNo), (old) =>
          old.procurement
            ? {
                ...old,
                procurement: {
                  ...old.procurement,
                  critical_waiting: (Number(old.procurement.critical_waiting) || 0) + (critical ? 1 : -1),
                },
              }
            : old,
        );
      }
      void queryClient.invalidateQueries({ queryKey: jobOrderKeys.productionPlan(jobNo), refetchType: 'none' });
      notify.success(
        critical
          ? 'Kalem kritik olarak işaretlendi — imalat öngörüsü bu teslimatı bekleyecek'
          : 'Kritik işareti kaldırıldı',
      );
    } catch (error) {
      console.error('Critical toggle failed:', error);
      notify.error(error, { fallback: 'Kritik işareti güncellenemedi' });
    } finally {
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const pdf = { jobNo, kindLabel: pdfKindLabel(kind), title: item.title, customer: item.customer_name };

  const critical = {
    pending,
    onToggle: (row: ProcurementRow, value: boolean) => void toggleCritical(row, value),
  };
  let body;
  if (!brief) body = <ModalLoading />;
  else if (!fetched) body = <SectionBody kind={kind} brief={brief} detail={{}} critical={critical} />;
  else if (section.data) body = <SectionBody kind={kind} brief={brief} detail={section.data} critical={critical} />;
  else if (section.isError) body = <div className={`${s.textDanger} ${s.empty}`}>Detay yüklenemedi.</div>;
  else body = <ModalLoading />;

  return (
    <MeetingModal title={SECTION_MODAL_TITLES[kind]} jobNo={jobNo} onClose={onClose} pdf={pdf}>
      {body}
    </MeetingModal>
  );
}
