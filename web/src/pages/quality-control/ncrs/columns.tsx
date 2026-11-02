import type { LegacyUser } from '@legacy/authService.js';
import { Text, Tooltip } from '@mantine/core';
import type { Ncr, NcrGroup } from '@/api/quality-control/ncrs';
import { formatDate } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { QcReviewLink } from './NcrPaperForm';
import { assignedTeam, nextAction, qcReviewId, statusLabel } from './ncrRules';

// The list shows severity as a symbol only; the shape differs, not just the colour.
const SEVERITY_ICON: Record<string, { label: string; icon: string; color: string }> = {
  minor: { label: 'Minör', icon: 'fas fa-circle-info', color: 'var(--mantine-color-blue-7)' },
  major: {
    label: 'Majör',
    icon: 'fas fa-triangle-exclamation',
    color: 'var(--mantine-color-orange-7)',
  },
  critical: {
    label: 'Kritik',
    icon: 'fas fa-circle-exclamation',
    color: 'var(--mantine-color-red-7)',
  },
};

const CREATED_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

function PendingAction({ row, user, groups }: { row: Ncr; user: LegacyUser; groups: NcrGroup[] }) {
  const next = nextAction(row, user, groups);
  return (
    <div>
      <div style={{ whiteSpace: 'nowrap', display: 'flex', gap: 4, alignItems: 'center' }}>
        <span title={next.actor ? `Durum: ${statusLabel(row)}` : undefined}>
          <StatusBadge color={next.color}>
            <FaIcon icon={next.icon} style={{ fontSize: 11, marginRight: 4 }} />
            {next.actor ?? next.task}
          </StatusBadge>
        </span>
        {next.isMine ? (
          <span title="Sıradaki adım sizin grubunuzda">
            <StatusBadge color="red">Sizde</StatusBadge>
          </span>
        ) : null}
      </div>
      {next.actor ? (
        <Text size="xs" c={next.actorMissing ? 'red' : 'dimmed'} mt={3} lh={1.3}>
          {next.task}
        </Text>
      ) : null}
    </div>
  );
}

/** Port of the ncrs.js table; the pending-action and team columns need the user and the groups. */
// Sortable = NCRViewSet.ordering_fields (created_at, severity, status); other
// orderings are silently ignored by the backend.
export function ncrColumns(user: LegacyUser, groups: NcrGroup[]): DataTableColumn<Ncr>[] {
  return [
    {
      key: 'ncr_number',
      header: 'NCR No',
      sortable: false,
      width: 100,
      // NCR-2026-0001 → 2026-0001: the header already says "NCR".
      render: (row) =>
        row.ncr_number ? (
          <span className={uiClasses.code} title={row.ncr_number}>
            {String(row.ncr_number).replace(/^NCR-/i, '')}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'job_order',
      header: 'İş Emri',
      sortable: false,
      width: 110,
      render: (row) =>
        row.job_order ? (
          <span className={uiClasses.code} title={row.job_order_title ?? undefined}>
            {row.job_order}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'title',
      header: 'Başlık',
      sortable: false,
      render: (row) =>
        row.title ? (
          <Text size="sm" fw={600}>
            {row.title}
          </Text>
        ) : (
          '-'
        ),
    },
    {
      key: 'status',
      header: 'Bekleyen Aksiyon',
      sortable: true,
      width: 230,
      render: (row) => <PendingAction row={row} user={user} groups={groups} />,
    },
    {
      key: 'qc_review',
      header: 'KK İnceleme',
      sortable: false,
      width: 100,
      render: (row) => {
        const id = qcReviewId(row);
        return id ? <QcReviewLink id={id} /> : '-';
      },
    },
    {
      key: 'severity',
      header: 'Önem',
      sortable: true,
      width: 70,
      align: 'center',
      render: (row) => {
        const severity = SEVERITY_ICON[String(row.severity)];
        if (!severity) return row.severity_display || row.severity || '-';
        return (
          <Tooltip label={severity.label} withArrow>
            <span aria-label={severity.label} style={{ color: severity.color, fontSize: 16 }}>
              <FaIcon icon={severity.icon} />
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: 'defect_type_display',
      header: 'Kusur Tipi',
      sortable: false,
      width: 110,
      render: (row) =>
        row.defect_type_display ? (
          <StatusBadge color="grey">{row.defect_type_display}</StatusBadge>
        ) : (
          '-'
        ),
    },
    {
      key: 'submission_count',
      header: 'Gönd.',
      sortable: false,
      width: 65,
      align: 'center',
      render: (row) => {
        const count = Number.parseInt(String(row.submission_count ?? 0), 10) || 0;
        return (
          <Text
            span
            size="sm"
            fw={600}
            c={count > 1 ? 'orange.9' : undefined}
            title="Gönderim sayısı"
          >
            {count}
          </Text>
        );
      },
    },
    {
      key: 'assigned_team_name',
      header: 'Atanan Grup',
      sortable: false,
      width: 120,
      render: (row) => {
        const team = assignedTeam(row);
        const group = groups.find((g) => String(g.id) === String(team.id));
        const name =
          row.assigned_team_name || team.name || group?.display_name || group?.name || team.id;
        return name && name !== '-' ? <StatusBadge color="grey">{String(name)}</StatusBadge> : '-';
      },
    },
    {
      key: 'created_at',
      header: 'Tarih',
      sortable: true,
      width: 100,
      render: (row) => formatDate(row.created_at, CREATED_FORMAT),
    },
  ];
}
