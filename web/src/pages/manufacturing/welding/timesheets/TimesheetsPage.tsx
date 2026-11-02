import { Alert, Button, Group, Text, TextInput } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  approveCleanSubmissions,
  approveSubmission,
  dailyStatusQueryOptions,
  timesheetKeys,
  type DailyWelder,
  type DayState,
} from '@/api/welding/timesheets';
import { formatTime } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  Panel,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type StatusFamily,
} from '@/ui';
import { SubmissionEditorModal } from './SubmissionEditorModal';
import { dayName, fmtHours, hoursWords, jobLabel, jobTitle, rangesText, shiftIso, toIso } from './timesheetCells';
import css from './TimesheetsPage.module.css';

const STATE_BADGE: Record<DayState, [StatusFamily, string]> = {
  none: ['grey', 'Girilmedi'],
  pending: ['orange', 'Kontrol bekliyor'],
  approved: ['green', 'Onaylandı'],
  blank: ['grey', 'Çalışmadı'],
};

const FILTERS: FilterConfig<'q' | 'state'>[] = [
  { key: 'q', type: 'text', placeholder: 'İsim / ekip ara' },
  {
    key: 'state',
    type: 'select',
    label: 'Durum',
    options: [
      { value: 'pending', label: 'Kontrol bekliyor' },
      { value: 'none', label: 'Girilmedi' },
      { value: 'approved', label: 'Onaylandı' },
      { value: 'blank', label: 'Çalışmadı' },
    ],
  },
];

const EMPTY_ROWS: DailyWelder[] = [];

function JobsSummary({ row }: { row: DailyWelder }) {
  if (row.blank_day) {
    return (
      <Text span size="sm" c="dimmed">
        <FaIcon icon="fas fa-bed" style={{ marginRight: 4 }} />
        Bugün çalışmadım (izin / rapor)
      </Text>
    );
  }
  if (!row.rows?.length) return null;
  return (
    <table className={css.jobs}>
      <tbody>
        {row.rows.map((job, i) => (
          <tr key={`${job.job_no}-${i}`}>
            <td className={css.jobsNo}>{jobLabel(job.job_no)}</td>
            <td className={css.jobsTitle} title={jobTitle(job.job_no, job.title)}>
              {jobTitle(job.job_no, job.title)}
            </td>
            <td className={css.jobsRanges}>{rangesText(job.cells)}</td>
            <td className={css.jobsHours}>{hoursWords(job.hours)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FlagsSummary({ row }: { row: DailyWelder }) {
  const flags = row.flags ?? [];
  if (!flags.length) {
    return row.state === 'pending' ? (
      <Text span size="xs" c="green.8">
        <FaIcon icon="fas fa-check" style={{ marginRight: 4 }} />
        Uyarı yok
      </Text>
    ) : null;
  }
  return (
    <div className={css.flags}>
      {flags.slice(0, 2).map((f, i) => (
        <span key={i} className={`${css.flag} ${css.flagInline}`} data-level={f.level}>
          {f.text}
        </span>
      ))}
      {flags.length > 2 ? <Text span size="xs" c="dimmed">+{flags.length - 2}</Text> : null}
    </div>
  );
}

/**
 * Port of manufacturing/welding/timesheets (Puantaj Onayı): one row per
 * rostered welder for the chosen day; approve, correct in the phone-like
 * editor, or send back. `?date=` keeps the day, as legacy did.
 */
export function TimesheetsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get('date') || toIso(new Date());
  const filters = useUrlFilters({ q: '', state: '' });
  const daily = useQuery({ ...dailyStatusQueryOptions(date), placeholderData: keepPreviousData });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [approvingClean, setApprovingClean] = useState(false);

  const setDate = (next: string) => {
    if (!next) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('date', next);
        return params;
      },
      { replace: true },
    );
  };

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'daily'] }),
    [queryClient],
  );

  const all = daily.data?.results ?? EMPTY_ROWS;
  const counts = daily.data?.counts ?? {};
  const clean = all.filter((r) => r.state === 'pending' && r.scan_status === 'clean');

  const rows = useMemo(() => {
    const q = filters.values.q.trim().toLocaleLowerCase('tr-TR');
    const st = filters.values.state;
    return all.filter((r) => {
      if (st && r.state !== st) return false;
      if (!q) return true;
      return `${r.full_name} ${(r.team_names ?? []).join(' ')}`.toLocaleLowerCase('tr-TR').includes(q);
    });
  }, [all, filters.values.q, filters.values.state]);

  const approveRow = async (id: number) => {
    setApproving(id);
    try {
      const res = await approveSubmission(id);
      notify.success(res.created_count ? `${res.created_count} zaman kaydı oluşturuldu` : 'Boş gün olarak onaylandı');
      await reload();
    } catch (error) {
      notify.error(error, { fallback: 'Onaylanamadı' });
    } finally {
      setApproving(null);
    }
  };

  const approveClean = async () => {
    if (!clean.length) return;
    const ok = await confirm({
      title: 'Uyarısız girişleri onayla',
      icon: 'fas fa-check-double',
      message: `${clean.length} uyarısız giriş onaylanacak ve zaman kayıtları oluşturulacak. Devam edilsin mi?`,
      confirmLabel: 'Onayla',
    });
    if (!ok) return;
    setApprovingClean(true);
    try {
      const res = await approveCleanSubmissions({ date, submission_ids: clean.map((r) => Number(r.scan_id)) });
      const failed = (res.failed ?? []).length;
      notify.show(
        `${res.approved.length} giriş onaylandı${failed ? `, ${failed} giriş onaylanamadı` : ''}`,
        failed ? 'warning' : 'success',
      );
      await reload();
    } catch (error) {
      notify.error(error, { fallback: 'Toplu onay başarısız' });
    } finally {
      setApprovingClean(false);
    }
  };

  // One row per rostered welder (a few dozen); rebuilt with the approve state.
  const columns: DataTableColumn<DailyWelder>[] = [
      {
        key: 'full_name',
        header: 'Kaynakçı',
        render: (r) => (
          <>
            {r.full_name}
            <br />
            <Text span size="xs" c="dimmed">
              {(r.team_names ?? [])[0] ?? ''}
            </Text>
          </>
        ),
      },
      {
        key: 'state',
        header: 'Durum',
        render: (r) => {
          const [color, label] = STATE_BADGE[r.state] ?? ['grey', r.state];
          return <StatusBadge color={color}>{label}</StatusBadge>;
        },
      },
      {
        key: 'submitted_at',
        header: 'Gönderim',
        render: (r) =>
          r.state === 'approved' && r.approved_at ? (
            <Text span size="xs" c="dimmed">
              onay {formatTime(r.approved_at)}
              {r.approved_by ? ` · ${r.approved_by}` : ''}
            </Text>
          ) : r.submitted_at ? (
            formatTime(r.submitted_at)
          ) : (
            ''
          ),
      },
      {
        key: 'total_hours',
        header: 'Toplam',
        align: 'right',
        render: (r) => (r.blank_day || !r.total_hours ? '' : <strong>{fmtHours(r.total_hours)} sa</strong>),
      },
      {
        key: 'jobs',
        header: 'İşler ve saatler',
        render: (r) => (
          <>
            <JobsSummary row={r} />
            {r.note ? (
              <Text size="xs" c="dimmed">
                <FaIcon icon="fas fa-comment" style={{ marginRight: 4 }} />
                {r.note}
              </Text>
            ) : null}
          </>
        ),
      },
      { key: 'flags', header: 'Uyarılar', render: (r) => <FlagsSummary row={r} /> },
      {
        key: 'actions',
        header: '',
        align: 'right',
        exportable: false,
        render: (r) => {
          const id = r.scan_id;
          if (r.state === 'pending' && id) {
            return (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <Button
                  size="compact-xs"
                  color="green"
                  leftSection={<FaIcon icon="fas fa-check" />}
                  disabled={!!r.has_errors || approving !== null}
                  loading={approving === id}
                  title={r.has_errors ? 'Hata işaretli satırlar var' : undefined}
                  aria-label={`${r.full_name} onayla`}
                  onClick={() => void approveRow(id)}
                >
                  Onayla
                </Button>
                <Button
                  size="compact-xs"
                  variant="outline"
                  leftSection={<FaIcon icon="fas fa-pen" />}
                  aria-label={`${r.full_name} düzelt`}
                  onClick={() => setEditingId(id)}
                >
                  Düzelt
                </Button>
              </Group>
            );
          }
          if (id) {
            return (
              <Button
                size="compact-xs"
                variant="outline"
                color="gray"
                leftSection={<FaIcon icon="fas fa-eye" />}
                aria-label={`${r.full_name} görüntüle`}
                onClick={() => setEditingId(id)}
              >
                Görüntüle
              </Button>
            );
          }
          return null;
        },
      },
  ];

  useEffect(() => {
    if (daily.isError) notify.error(daily.error, { fallback: 'Günlük durum alınamadı' });
  }, [daily.isError, daily.error]);

  return (
    <>
      <PageHeader
        title="Puantaj Onayı"
        subtitle="Kaynakçıların telefondan gönderdiği günlük puantajları kontrol edin, düzeltin ve zaman kayıtlarına aktarın"
        icon="fas fa-clipboard-check"
        backTo="/manufacturing/welding/"
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            loading={daily.isFetching}
            onClick={() => void reload()}
          >
            Yenile
          </Button>
        }
      />

      <Panel>
        <Group gap="md" wrap="wrap" align="center">
          <Button.Group>
            <Button variant="default" aria-label="Önceki gün" title="Önceki gün" onClick={() => setDate(shiftIso(date, -1))}>
              <FaIcon icon="fas fa-chevron-left" />
            </Button>
            <Button variant="default" onClick={() => setDate(toIso(new Date()))}>
              Bugün
            </Button>
            <Button variant="default" aria-label="Sonraki gün" title="Sonraki gün" onClick={() => setDate(shiftIso(date, 1))}>
              <FaIcon icon="fas fa-chevron-right" />
            </Button>
          </Button.Group>
          <TextInput
            type="date"
            aria-label="Tarih"
            value={date}
            onChange={(event) => setDate(event.currentTarget.value)}
            style={{ maxWidth: 190 }}
          />
          <Text fw={600}>{dayName(date)}</Text>
          {daily.data ? (
            <Group gap={6} data-testid="timesheet-counts">
              <StatusBadge color="orange">{counts.pending ?? 0} kontrol bekliyor</StatusBadge>
              <StatusBadge color="green">{counts.approved ?? 0} onaylandı</StatusBadge>
              <StatusBadge color="grey">{counts.none ?? 0} girilmedi</StatusBadge>
              {counts.blank ? <StatusBadge color="grey">{counts.blank} çalışmadı</StatusBadge> : null}
            </Group>
          ) : null}
          <Group gap="xs" ml="auto">
            <Button
              color="green"
              leftSection={<FaIcon icon="fas fa-check-double" />}
              // Not while the previous day's rows are still shown after a date change.
              disabled={clean.length === 0 || daily.isPlaceholderData}
              loading={approvingClean}
              onClick={() => void approveClean()}
            >
              Uyarısız girişleri onayla{clean.length ? ` (${clean.length})` : ''}
            </Button>
            <Button
              component={AppLink}
              to="/manufacturing/welding/time-entries/"
              variant="default"
              leftSection={<FaIcon icon="fas fa-clock" />}
            >
              Zaman Kayıtları
            </Button>
          </Group>
        </Group>
      </Panel>

      {daily.isError ? (
        <Alert color="red" mt="md">
          {daily.error instanceof Error ? daily.error.message : 'Günlük durum alınamadı'}
        </Alert>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <DataTable
          // The filters take the title's place, so the count sits on the right.
          toolbar={
            <Text size="sm" fw={600}>
              Kaynakçılar{' '}
              <Text span c="dimmed" size="sm" data-testid="timesheet-count">
                ({rows.length}/{all.length})
              </Text>
            </Text>
          }
          data={rows}
          columns={columns}
          getRowId={(r, i) => String(r.scan_id ?? `${r.full_name}-${i}`)}
          loading={daily.isFetching}
          filters={<FilterBar inline filters={FILTERS} values={filters.values} onApply={filters.apply} onClear={filters.reset} />}
          rowStyle={(r) => (r.state === 'none' ? { color: 'var(--gk-muted)' } : undefined)}
          emptyMessage="Bu filtreyle eşleşen kaynakçı yok."
        />
      </div>

      {editingId !== null ? (
        <SubmissionEditorModal
          submissionId={editingId}
          onClose={() => {
            setEditingId(null);
            void reload();
          }}
        />
      ) : null}
    </>
  );
}
