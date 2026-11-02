import type { ApprovalStage, UserGroupOption } from '@/api/it/approvalPolicies';

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  'vacation_requests.vacationrequest': 'İzin Talebi',
  'overtime.overtimerequest': 'Mesai Talebi',
  'procurement.purchaserequest': 'Satın Alma Talebi',
  'planning.planningrequest': 'Planlama Talebi',
  'subcontracting.subcontractorstatement': 'Taşeron Hakediş',
  'quality_control.ncr': 'UYR',
  'quality_control.qcreview': 'KK İncelemesi',
  'procurement.paymentlist': 'Ödeme Listesi',
};

export function subjectTypeLabel(raw: string | null | undefined): string {
  if (!raw) return '-';
  return SUBJECT_TYPE_LABELS[raw] || raw;
}

/** Only purchase requests carry € bounds (legacy checked this exact value). */
export const PURCHASE_REQUEST = 'purchase_request';

/** "2 kademe yukarı + Grup: … + Sabit: …", or null when the stage names nobody. */
export function resolverDesc(stage: ApprovalStage, groups: UserGroupOption[]): string | null {
  const parts: string[] = [];
  if (stage.climb_levels != null) parts.push(`${stage.climb_levels} kademe yukarı`);
  if (stage.role_user_group_name) {
    parts.push(`Grup: ${stage.role_user_group_name}`);
  } else if (stage.role_user_group != null) {
    const match = groups.find((g) => String(g.id) === String(stage.role_user_group));
    parts.push(`Grup: ${match?.display_name || match?.name || `#${stage.role_user_group}`}`);
  }
  const users = Array.isArray(stage.approver_users_detail) ? stage.approver_users_detail : [];
  if (users.length) parts.push(`Sabit: ${users.map((u) => u.full_name || u.username).join(', ')}`);
  else if (Array.isArray(stage.approver_users) && stage.approver_users.length) {
    parts.push(`Sabit kullanıcı: ${stage.approver_users.join(', ')}`);
  }
  return parts.length ? parts.join(' + ') : null;
}
