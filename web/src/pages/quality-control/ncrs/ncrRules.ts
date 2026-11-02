import type { LegacyUser } from '@legacy/authService.js';
import type { StatusFamily } from '@/ui';
import type { Ncr, NcrGroup } from '@/api/quality-control/ncrs';

// Who may do what with an NCR, as ncrs.js decided it.

/** `all` in the URL: an explicit "no restriction", unlike a missing param (= the default). */
export const ALL_VALUE = 'all';
export const DEFAULT_STATUS_FILTER = ['draft', 'submitted', 'rejected', 'approved'];
const QC_GROUP_SLUG = 'kalite-kontrol';
const QC_GROUP_ID = 5;

type Membership = string | number | { id?: unknown; name?: unknown; slug?: unknown };

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isSuperuser(user: LegacyUser | null | undefined): boolean {
  return Boolean(user && (user.is_superuser === true || user.is_admin === true));
}

/** Kalite Kontrol members and superusers edit, approve and reject NCRs. */
export function canDecideNcrs(user: LegacyUser | null | undefined): boolean {
  if (!user) return false;
  if (isSuperuser(user)) return true;
  return isQcMember(user);
}

/** Real Kalite Kontrol membership; superusers don't count. */
export function isQcMember(user: LegacyUser | null | undefined): boolean {
  if (!user) return false;
  return (
    list(user.user_groups).some((s) => String(s || '').toLowerCase() === QC_GROUP_SLUG) ||
    list(user.user_group_ids).some((id) => Number(id) === QC_GROUP_ID)
  );
}

export interface AssignedTeam {
  id: number | string | null;
  name: string;
  slug: string;
  groupName: string;
}

/** The assigned team from a list row or detail (assigned_team_data first). */
export function assignedTeam(row: Ncr): AssignedTeam {
  const data = row.assigned_team_data;
  return {
    id: data?.id ?? row.assigned_team_id ?? row.assigned_team ?? null,
    name: data?.name ?? row.assigned_team_name ?? '',
    slug: data?.slug ?? row.assigned_team_slug ?? '',
    groupName: row.assigned_team_group_name ?? '',
  };
}

function hasAssignedTeam(row: Ncr): boolean {
  const team = assignedTeam(row);
  if (team.id !== null && team.id !== '') return true;
  return Boolean(team.slug || team.name || team.groupName);
}

/** Django groups, organization group slugs and organization group PKs from /users/me/. */
function memberships(user: LegacyUser): Membership[] {
  return [...list(user.groups), ...list(user.user_groups), ...list(user.user_group_ids)].filter(
    (m): m is Membership => m !== null && m !== undefined && m !== '',
  );
}

function matches(membership: Membership, team: AssignedTeam): boolean {
  const labels = [team.slug, team.name, team.groupName].filter(Boolean);
  if (typeof membership === 'string' || typeof membership === 'number') {
    const token = String(membership);
    if (team.id !== null && token === String(team.id)) return true;
    return labels.some((label) => token === label);
  }
  if (
    team.id !== null &&
    membership.id !== null &&
    membership.id !== undefined &&
    String(membership.id) === String(team.id)
  ) {
    return true;
  }
  return labels.some((label) => membership.name === label || membership.slug === label);
}

/** Is the NCR's team one of the user's own groups? (no superuser shortcut) */
export function isOwnTeam(user: LegacyUser | null | undefined, row: Ncr): boolean {
  if (!user || !hasAssignedTeam(row)) return false;
  const team = assignedTeam(row);
  return memberships(user).some((m) => matches(m, team));
}

/** Members of the assigned team, or a superuser. */
export function isInAssignedTeam(user: LegacyUser | null | undefined, row: Ncr): boolean {
  if (!user) return false;
  if (isSuperuser(user)) return true;
  return isOwnTeam(user, row);
}

const status = (ncr: Ncr | null | undefined) => String(ncr?.status ?? '').toLowerCase();
export const isSubmitted = (ncr: Ncr | null | undefined) => status(ncr) === 'submitted';
export const isSubmittable = (ncr: Ncr | null | undefined) =>
  ['draft', 'rejected'].includes(status(ncr));
export const isClosable = (ncr: Ncr | null | undefined) => status(ncr) === 'approved';

/** Draft or rejected NCRs go to QC from the assigned team (or a superuser). */
export function canSubmit(user: LegacyUser | null | undefined, ncr: Ncr): boolean {
  return isSubmittable(ncr) && isInAssignedTeam(user, ncr);
}

/**
 * Groups the list starts narrowed to. QC members and superusers oversee every
 * group's NCRs, so they start unfiltered.
 */
export function defaultTeamSelection(
  user: LegacyUser | null | undefined,
  groups: NcrGroup[],
): string[] {
  if (!user || isSuperuser(user) || isQcMember(user)) return [ALL_VALUE];
  const known = list(user.user_group_ids)
    .map(String)
    .filter((id) => groups.some((g) => String(g.id) === id));
  return known.length ? known : [ALL_VALUE];
}

export function teamDisplayName(row: Ncr, groups: NcrGroup[]): string {
  const team = assignedTeam(row);
  const group = groups.find((g) => String(g.id) === String(team.id));
  return team.name || group?.display_name || group?.name || '';
}

export interface NextAction {
  actor: string | null;
  actorMissing?: boolean;
  task: string;
  color: StatusFamily;
  icon: string;
  isMine: boolean;
}

/**
 * Who has to move the NCR forward, and what they have to do.
 *   draft / rejected → the assigned group fills in and (re)submits
 *   submitted / approved → Kalite Kontrol decides / closes
 */
export function nextAction(
  row: Ncr,
  user: LegacyUser | null | undefined,
  groups: NcrGroup[],
): NextAction {
  const teamName = teamDisplayName(row, groups);
  switch (status(row)) {
    case 'draft':
      return {
        actor: teamName || 'Grup atanmamış',
        actorMissing: !teamName,
        task: 'Kök neden ve düzeltici faaliyeti girip göndermeli',
        color: 'orange',
        icon: 'fas fa-pen',
        isMine: isOwnTeam(user, row),
      };
    case 'rejected':
      return {
        actor: teamName || 'Grup atanmamış',
        actorMissing: !teamName,
        task: 'KK reddetti — düzeltip yeniden göndermeli',
        color: 'red',
        icon: 'fas fa-rotate-left',
        isMine: isOwnTeam(user, row),
      };
    case 'submitted':
      return {
        actor: 'Kalite Kontrol',
        task: 'İnceleyip onaylamalı veya reddetmeli',
        color: 'blue',
        icon: 'fas fa-gavel',
        isMine: isQcMember(user),
      };
    case 'approved':
      return {
        actor: 'Kalite Kontrol',
        task: 'Onaylandı — doğrulayıp kapatmalı',
        color: 'purple',
        icon: 'fas fa-lock',
        isMine: isQcMember(user),
      };
    case 'closed':
      return {
        actor: null,
        task: 'Kapatıldı',
        color: 'green',
        icon: 'fas fa-check',
        isMine: false,
      };
    default:
      return {
        actor: null,
        task: row.status_display || status(row) || '-',
        color: 'grey',
        icon: 'fas fa-circle',
        isMine: false,
      };
  }
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  submitted: 'Gönderildi',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  closed: 'Kapatıldı',
};

export function statusLabel(ncr: Ncr): string {
  return STATUS_LABEL[status(ncr)] || ncr.status_display || String(ncr.status ?? '') || '-';
}

/** The QC review the NCR came from, as an id. */
export function qcReviewId(ncr: Ncr): string | null {
  const review = ncr.qc_review;
  if (review === null || review === undefined || review === '') return null;
  if (typeof review === 'object') {
    const id = review.id ?? review.pk ?? review.review_id;
    return id !== undefined && id !== null && id !== '' ? String(id) : null;
  }
  return String(review);
}

/** Selection → list params. ALL (or nothing ticked) means "don't restrict". */
export function selectionParams(statuses: string[], teams: string[]) {
  const params: { status__in?: string; assigned_team?: string; assigned_team__in?: string } = {};
  const s = statuses.filter((v) => v !== ALL_VALUE);
  if (s.length && !statuses.includes(ALL_VALUE)) params.status__in = s.join(',');
  const t = teams.filter((v) => v !== ALL_VALUE);
  if (t.length && !teams.includes(ALL_VALUE)) {
    // One group uses the plain lookup, which older backends accept too.
    if (t.length === 1) params.assigned_team = t[0];
    else params.assigned_team__in = t.join(',');
  }
  return params;
}

/** URL value (comma list, `all`, or '' for the default) → selection. */
export function parseSelection(raw: string, fallback: string[]): string[] {
  if (raw === '') return fallback;
  if (raw === ALL_VALUE) return [];
  return raw.split(',').filter(Boolean);
}

/** Selection → URL value; nothing ticked is written as `all`. */
export function selectionToUrl(selection: string[]): string {
  const values = selection.filter((v) => v !== ALL_VALUE);
  return values.length ? values.join(',') : ALL_VALUE;
}
