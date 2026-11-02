import { Button } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { userWorkHoursQueryOptions, type UserWorkHoursRow } from '@/api/welding/userWorkHours';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import { HOURS_PER_WEEKDAY, countWeekdays, userWorkHoursColumns } from './columns';
import { exportUserWorkHours } from './exportUserWorkHours';

type FilterKeys = 'date_after' | 'date_before';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'date', key: 'date_after', label: 'Başlangıç Tarihi', span: 3 },
  { type: 'date', key: 'date_before', label: 'Bitiş Tarihi', span: 3 },
];

const EMPTY_ROWS: UserWorkHoursRow[] = [];

/** Legacy default range: the current month, first to last day (local dates). */
function currentMonth(): FilterState {
  const today = dayjs();
  return {
    date_after: today.startOf('month').format('YYYY-MM-DD'),
    date_before: today.endOf('month').format('YYYY-MM-DD'),
  };
}

/** Legacy loadReport's checks, in its order. */
function rangeProblem({ date_after, date_before }: FilterState): 'missing' | 'inverted' | null {
  if (!date_after || !date_before) return 'missing';
  // YYYY-MM-DD strings compare as dates.
  if (date_after > date_before) return 'inverted';
  return null;
}

function warnAbout(problem: 'missing' | 'inverted') {
  if (problem === 'missing') notify.warning('Lütfen başlangıç ve bitiş tarihlerini seçin');
  else notify.error('Başlangıç tarihi bitiş tarihinden sonra olamaz');
}

/** Port of manufacturing/welding/reports/user-work-hours (user-work-hours.js). */
export function UserWorkHoursPage() {
  // Today's month is the default; only a different range goes in the URL.
  const [defaults] = useState(currentMonth);
  const { values, apply, reset } = useUrlFilters(defaults);
  const dates = useMemo<FilterState>(
    () => ({ date_after: values.date_after, date_before: values.date_before }),
    [values.date_after, values.date_before],
  );
  const problem = rangeProblem(dates);

  const report = useQuery({
    ...userWorkHoursQueryOptions(dates),
    enabled: problem === null,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (problem) warnAbout(problem);
  }, [problem, dates]);

  useEffect(() => {
    if (report.isError) notify.error(report.error, { fallback: 'Rapor yüklenirken hata oluştu' });
  }, [report.isError, report.error, report.errorUpdatedAt]);

  // Missing dates empty the table; an inverted range keeps the last report (legacy).
  const shown = problem === 'missing' || report.isError ? undefined : report.data;
  const rows = shown?.users ?? EMPTY_ROWS;

  // Expected hours for the range the shown report covers (9 per weekday).
  const range = {
    start: shown?.date_range?.start || dates.date_after,
    end: shown?.date_range?.end || dates.date_before,
  };
  const expected = countWeekdays(range.start, range.end) * HOURS_PER_WEEKDAY;
  const columns = useMemo(() => userWorkHoursColumns(expected), [expected]);

  const refresh = () => {
    if (problem) warnAbout(problem);
    else void report.refetch();
  };

  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    if (rows.length === 0) {
      notify.warning('Dışa aktarılacak veri bulunamadı');
      return;
    }
    setExporting(true);
    try {
      await exportUserWorkHours(rows, range);
      notify.success('Rapor başarıyla dışa aktarıldı');
    } catch (error) {
      console.error('Export error:', error);
      notify.error('Dışa aktarma sırasında hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Çalışan Çalışma Saatleri Raporu"
        subtitle="Çalışanların belirli bir tarih aralığındaki çalışma saatleri analizi"
        icon="user-clock"
        backTo="/manufacturing/welding/reports"
      />

      <DataTable
        title="Çalışan Çalışma Saatleri"
        icon="fas fa-user-clock"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={dates}
            onApply={(next) => apply(next)}
            // Temizle goes back to the current month.
            onClear={reset}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row, index) => String(row.employee_id ?? row.employee_username ?? index)}
        loading={report.isFetching}
        emptyMessage="Rapor verisi bulunamadı. Lütfen tarih aralığını kontrol edin."
        onRefresh={refresh}
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => void runExport()}
            loading={exporting}
            leftSection={<FaIcon icon="fas fa-file-excel" />}
          >
            Excel&apos;e Aktar
          </Button>
        }
      />
    </>
  );
}
