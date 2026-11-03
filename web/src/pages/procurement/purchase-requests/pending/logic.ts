import type { PurchaseRequestDetail, PurchaseRequestRow } from '@/api/procurement/purchaseRequests';

/** Legacy userHasDecided: the user decided in any stage (hides Onayla/Reddet in the modal). */
export function userHasDecided(
  request: PurchaseRequestDetail,
  userId: number | undefined,
): boolean {
  if (userId === undefined) return false;
  return (request.approval?.stage_instances ?? []).some((stage) =>
    (stage.decisions ?? []).some((d) => d.approver === userId),
  );
}

export type ApprovalCellInfo =
  | { kind: 'none' }
  | { kind: 'done'; label: string }
  | { kind: 'waiting'; stage: string; remaining: number; names: string };

/**
 * getApprovalInfo of the "Onayladığınız Talepler" table. Names are
 * `approvers.slice(approved_count)`: positional, as legacy did.
 */
export function approvalInfo(row: PurchaseRequestRow): ApprovalCellInfo {
  if (!row.approval || row.status !== 'submitted') return { kind: 'none' };
  const stage = (row.approval.stage_instances ?? []).find((s) => !s.is_complete && !s.is_rejected);
  if (!stage) return { kind: 'done', label: 'Tamamlandı' };
  const remaining = stage.required_approvals - stage.approved_count;
  if (remaining <= 0) return { kind: 'done', label: stage.name };
  const names = (stage.approvers ?? [])
    .slice(stage.approved_count)
    .map((a) => a.full_name || a.username)
    .join(', ');
  return { kind: 'waiting', stage: stage.name, remaining, names };
}
