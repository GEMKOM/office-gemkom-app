import { Alert, Button, Center, Checkbox, Loader, Text, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  jobCompletionTreeQueryOptions,
  useForceCompleteJobOrders,
  type ForceCompleteSummary,
} from '@/api/it/jobCompletion';
import {
  confirm,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  Panel,
  StatusBadge,
  useUrlFilters,
  type FilterConfig,
  type StatusFamily,
} from '@/ui';
import {
  buildTree,
  computeSelectedCounts,
  computeVisible,
  isActionable,
  normalize,
  withSelection,
  type TreeNode,
} from './completionTree';
import css from './JobCompletionPage.module.css';

const STATUS_COLORS: Record<string, StatusFamily> = {
  draft: 'grey',
  active: 'blue',
  on_hold: 'orange',
  completed: 'green',
  cancelled: 'red',
};

const DEPARTMENT_LABELS: Record<string, string> = {
  design: 'Dizayn',
  planning: 'Planlama',
  procurement: 'Satın Alma',
  manufacturing: 'İmalat',
  quality_control: 'Kalite Kontrol',
  logistics: 'Lojistik',
  sales: 'Satış',
  finance: 'Finans',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Tamamlanmamışlar' },
  { value: 'all', label: 'Tüm durumlar' },
  { value: 'draft', label: 'Taslak' },
  { value: 'active', label: 'Aktif' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

const FILTERS: FilterConfig<'search' | 'status'>[] = [
  { key: 'search', type: 'text', placeholder: 'İş no, iş adı veya müşteri ara...' },
  { key: 'status', type: 'select', label: 'Durum', options: STATUS_OPTIONS },
];

const EMPTY_SET: ReadonlySet<string> = new Set();

function hasWarnings(summary: ForceCompleteSummary | null) {
  return (
    (summary?.skipped?.length ?? 0) > 0 ||
    (summary?.missing?.length ?? 0) > 0 ||
    (summary?.overridden?.open_ncr_job_orders?.length ?? 0) > 0
  );
}

/** Legacy buildResultMessage. */
function ResultMessage({ summary }: { summary: ForceCompleteSummary | null }) {
  const overridden = summary?.overridden ?? {};
  const byDept = Object.entries(summary?.tasks_by_department ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div>
        <strong>{summary?.completed_job_orders?.length ?? 0}</strong> iş emri ve{' '}
        <strong>{summary?.tasks_completed ?? 0}</strong> departman görevi tamamlandı.
      </div>
      {byDept.length ? (
        <Text size="xs" c="dimmed">
          {byDept.map(([dept, count]) => `${DEPARTMENT_LABELS[dept] ?? dept}: ${count}`).join(' · ')}
        </Text>
      ) : null}
      {overridden.qc_missing_approval ? (
        <Text size="xs">
          KK onayı olmadan tamamlanan görev: <strong>{overridden.qc_missing_approval}</strong>
        </Text>
      ) : null}
      {overridden.erp_entry_unconfirmed ? (
        <Text size="xs">
          ERP ürün girişi onaylanmadan tamamlanan imalat görevi: <strong>{overridden.erp_entry_unconfirmed}</strong>
        </Text>
      ) : null}
      {overridden.open_ncr_job_orders?.length ? (
        <Text size="xs" c="red">
          Açık NCR&apos;ı olan iş emirleri kapatılmadı, NCR&apos;lar açık kaldı:{' '}
          {overridden.open_ncr_job_orders.join(', ')}
        </Text>
      ) : null}
      {summary?.already_completed?.length ? (
        <Text size="xs" c="dimmed">
          Zaten tamamlanmış: {summary.already_completed.join(', ')}
        </Text>
      ) : null}
      {summary?.skipped?.length ? (
        <Text size="xs" c="dimmed">
          İptal edildiği için atlandı: {summary.skipped.map((s) => s.job_no).join(', ')}
        </Text>
      ) : null}
      {summary?.missing?.length ? (
        <Text size="xs" c="dimmed">
          Bulunamadı: {summary.missing.join(', ')}
        </Text>
      ) : null}
    </div>
  );
}

/**
 * Port of it/job-completion (job-completion.js): the job-order tree with
 * cascading selection, and a forced completion that skips every workflow gate.
 */
export function JobCompletionPage() {
  const query = useQuery(jobCompletionTreeQueryOptions());
  const complete = useForceCompleteJobOrders();
  const filters = useUrlFilters({ search: '', status: 'open' });
  const [selectedRaw, setSelected] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(EMPTY_SET);

  useEffect(() => {
    if (query.isError) notify.error(query.error, { fallback: 'İş emirleri yüklenemedi.' });
  }, [query.isError, query.error]);

  const tree = useMemo(() => buildTree(query.data ?? []), [query.data]);
  const search = normalize(filters.values.search.trim());
  const status = filters.values.status || 'open';

  // Selections are job numbers, so they survive a reload, but a job that is
  // gone or no longer actionable drops out.
  const selected = useMemo(() => {
    const kept = [...selectedRaw].filter((jobNo) => {
      const node = tree.nodes.get(jobNo);
      return node && isActionable(node);
    });
    return kept.length === selectedRaw.size ? selectedRaw : new Set(kept);
  }, [selectedRaw, tree]);

  const visible = useMemo(() => computeVisible(tree, search, status), [tree, search, status]);
  const selectedCounts = useMemo(() => computeSelectedCounts(tree, selected), [tree, selected]);

  // An active search expands everything it surfaced; otherwise the user's own state wins.
  const isExpanded = (node: TreeNode) => Boolean(search) || expanded.has(node.job_no);

  const rows: TreeNode[] = [];
  const walk = (node: TreeNode, seen: Set<string>) => {
    if (!visible.has(node.job_no) || seen.has(node.job_no)) return;
    seen.add(node.job_no);
    rows.push(node);
    if (isExpanded(node)) node.children.forEach((child) => walk(child, seen));
  };
  const seen = new Set<string>();
  tree.roots.forEach((root) => walk(root, seen));

  const selectedNodes = [...selected].map((jobNo) => tree.nodes.get(jobNo)).filter((n): n is TreeNode => !!n);
  const openTasks = selectedNodes.reduce((sum, node) => sum + Number(node.open_task_count || 0), 0);
  const selectable = [...visible].map((jobNo) => tree.nodes.get(jobNo)).filter((n): n is TreeNode => !!n && isActionable(n));
  const selectedVisible = selectable.filter((node) => selected.has(node.job_no)).length;

  const toggleNode = (node: TreeNode, on: boolean) => {
    setSelected(withSelection(selected, node, on));
    // Ticking a parent pulls in its subtree, so show it.
    if (on && node.children.length) setExpanded((prev) => new Set([...prev, node.job_no]));
  };

  const toggleVisible = (on: boolean) => {
    const next = new Set(selected);
    for (const node of selectable) {
      if (on) next.add(node.job_no);
      else next.delete(node.job_no);
    }
    setSelected(next);
  };

  const toggleExpanded = (node: TreeNode) => {
    // Search forces everything open; collapsing would fight the filter.
    if (search) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(node.job_no)) next.delete(node.job_no);
      else next.add(node.job_no);
      return next;
    });
  };

  const askAndComplete = async () => {
    const jobNos = selectedNodes.map((node) => node.job_no).sort();
    if (!jobNos.length) return;
    const hidden = jobNos.filter((jobNo) => !visible.has(jobNo)).length;
    const preview = jobNos.slice(0, 25);
    const ok = await confirm({
      title: 'İş Emirlerini Tamamla',
      icon: 'fas fa-triangle-exclamation',
      message: `${jobNos.length} iş emri tamamlanacak`,
      description:
        'Kalite kontrol onayı, ERP ürün girişi, satın alma teslimatı, açık NCR, alt görev ve bağımlılık kontrolleri atlanacak. Bu işlem geri alınamaz.',
      details: (
        <div>
          <div>
            <strong>{jobNos.length}</strong> iş emri ve bunlara bağlı <strong>{openTasks}</strong> açık departman
            görevi tamamlanacak.
          </div>
          {hidden ? (
            <Text size="sm" c="red" mt={4}>
              <FaIcon icon="fas fa-eye-slash" /> Bunların {hidden} tanesi geçerli filtrede görünmüyor.
            </Text>
          ) : null}
          <ul className={css.confirmList}>
            {preview.map((jobNo) => (
              <li key={jobNo}>{jobNo}</li>
            ))}
          </ul>
          {jobNos.length > preview.length ? (
            <Text size="xs" c="dimmed">
              …ve {jobNos.length - preview.length} iş emri daha
            </Text>
          ) : null}
        </div>
      ),
      confirmLabel: 'Evet, Tamamla',
      danger: true,
    });
    if (!ok) return;
    try {
      const summary = await complete.mutateAsync(jobNos);
      setSelected(EMPTY_SET);
      notify.show(<ResultMessage summary={summary} />, hasWarnings(summary) ? 'warning' : 'success', {
        autoClose: 12000,
      });
    } catch (error) {
      notify.error(`İşlem başarısız: ${error instanceof Error && error.message ? error.message : 'Bilinmeyen hata'}`, {
        autoClose: 8000,
      });
    }
  };

  const count = selected.size;

  const body = (() => {
    if (query.isPending) {
      return (
        <tr>
          <td colSpan={6}>
            <Center py="xl" c="dimmed">
              <Loader size="sm" mr="xs" /> Yükleniyor...
            </Center>
          </td>
        </tr>
      );
    }
    if (query.isError) {
      return (
        <tr>
          <td colSpan={6}>
            <Center py="xl" c="red">
              <FaIcon icon="fas fa-circle-exclamation" style={{ marginRight: 8 }} />
              İş emirleri yüklenemedi. Sayfayı yenileyin.
            </Center>
          </td>
        </tr>
      );
    }
    if (!rows.length) {
      return (
        <tr>
          <td colSpan={6}>
            <Center py="xl" c="dimmed">
              <FaIcon icon="fas fa-filter" style={{ marginRight: 8 }} />
              Filtreye uyan iş emri yok.
            </Center>
          </td>
        </tr>
      );
    }
    return rows.map((node) => {
      const checked = selected.has(node.job_no);
      const partial = !checked && (selectedCounts.get(node.job_no) ?? 0) > 0;
      const actionable = isActionable(node);
      const hasChildren = node.children.length > 0;
      const open = isExpanded(node);
      const pct = Number(node.completion_percentage || 0);
      const openCount = Number(node.open_task_count || 0);
      return (
        <tr
          key={node.job_no}
          className={css.row}
          data-selected={checked || undefined}
          data-resolved={!actionable || undefined}
          data-job-no={node.job_no}
        >
          <td className={css.colCheck}>
            <Checkbox
              size="xs"
              aria-label={`${node.job_no} seç`}
              checked={checked}
              indeterminate={partial}
              disabled={!actionable}
              title={actionable ? undefined : 'Tamamlanmış veya iptal edilmiş iş emri'}
              onChange={(event) => toggleNode(node, event.currentTarget.checked)}
            />
          </td>
          <td>
            <div className={css.node} style={{ paddingLeft: node.depth * 18 }}>
              {hasChildren ? (
                <UnstyledButton
                  className={css.caret}
                  aria-label={open ? `${node.job_no} daralt` : `${node.job_no} genişlet`}
                  aria-expanded={open}
                  onClick={() => toggleExpanded(node)}
                >
                  <FaIcon icon={open ? 'fas fa-chevron-down' : 'fas fa-chevron-right'} />
                </UnstyledButton>
              ) : (
                <span className={css.caret} aria-hidden />
              )}
              <span className={css.jobNo}>{node.job_no}</span>
              <span className={css.title}>{node.title || ''}</span>
              {hasChildren ? <span className={css.childCount}>({node.children.length} alt iş)</span> : null}
            </div>
          </td>
          <td className={css.customer}>{node.customer_name || '-'}</td>
          <td>
            <StatusBadge color={STATUS_COLORS[node.status ?? ''] ?? 'grey'}>
              {node.status_display || node.status || '-'}
            </StatusBadge>
          </td>
          <td>
            <div className={css.progress}>
              <div className={css.progressBar}>
                <div className={css.progressFill} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
              </div>
              <span className={css.progressValue}>{pct.toFixed(0)}%</span>
            </div>
          </td>
          <td className={css.tasks}>
            <span className={openCount ? css.openCount : css.openCountZero}>{openCount}</span>
            <Text span c="dimmed" size="sm">
              {' '}
              / {Number(node.task_count || 0)}
            </Text>
          </td>
        </tr>
      );
    });
  })();

  return (
    <>
      <PageHeader
        title="İş Emri Tamamlama"
        subtitle="Seçilen iş emirlerini ve tüm departman görevlerini kontrolleri atlayarak tamamla"
        icon="fas fa-check-double"
        backTo="/it/"
      />

      <Alert color="red" icon={<FaIcon icon="fas fa-triangle-exclamation" />} mb="md">
        <strong>Bu işlem tüm kontrolleri atlar.</strong> Seçilen iş emirleri ve bunlara bağlı <em>tüm</em> departman
        görevleri, kalite kontrol onayı, ERP ürün girişi, satın alma teslimatı, alt görev ve bağımlılık sırası
        gözetilmeden tamamlanmış olarak işaretlenir. İşlem geri alınamaz.
      </Alert>

      <Panel padded={false}>
        {/* Legacy toolbar: the filters, then expand/collapse on the left and the selection on the right. */}
        <div className={css.filters}>
          <FilterBar
            inline
            filters={FILTERS}
            values={filters.values}
            onApply={filters.apply}
            onClear={filters.reset}
          />
        </div>
        <div className={css.toolbar}>
          <div className={css.toolbarGroup}>
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-angles-down" />}
              onClick={() =>
                setExpanded(new Set([...tree.nodes.values()].filter((n) => n.children.length).map((n) => n.job_no)))
              }
            >
              Tümünü Genişlet
            </Button>
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-angles-up" />}
              onClick={() => setExpanded(EMPTY_SET)}
            >
              Tümünü Daralt
            </Button>
          </div>
          <div className={css.toolbarGroup}>
            <span className={count ? css.summaryActive : css.summary} data-testid="selection-summary">
              {count ? `${count} iş emri • ${openTasks} açık görev seçildi` : 'Seçim yok'}
            </span>
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-eraser" />}
              disabled={count === 0}
              onClick={() => setSelected(EMPTY_SET)}
            >
              Seçimi Temizle
            </Button>
            <Button
              size="xs"
              color="red"
              leftSection={<FaIcon icon="fas fa-check-double" />}
              disabled={count === 0}
              loading={complete.isPending}
              onClick={() => void askAndComplete()}
            >
              Seçilenleri Tamamla
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              aria-label="Yenile"
              onClick={() => void query.refetch()}
              loading={query.isFetching && !query.isPending}
            >
              <FaIcon icon="fas fa-sync-alt" />
            </Button>
          </div>
        </div>
        <div className={css.scroll}>
          <table className={css.table}>
            <thead>
              <tr>
                <th className={css.colCheck}>
                  <Checkbox
                    size="xs"
                    aria-label="Filtreye uyan tüm iş emirlerini seç"
                    title="Filtreye uyan tüm iş emirlerini seç"
                    checked={selectable.length > 0 && selectedVisible === selectable.length}
                    indeterminate={selectedVisible > 0 && selectedVisible < selectable.length}
                    disabled={selectable.length === 0}
                    onChange={(event) => toggleVisible(event.currentTarget.checked)}
                  />
                </th>
                <th>İş Emri</th>
                <th className={css.colCustomer}>Müşteri</th>
                <th className={css.colStatus}>Durum</th>
                <th className={css.colProgress}>İlerleme</th>
                <th className={css.colTasks}>Açık Görev</th>
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
