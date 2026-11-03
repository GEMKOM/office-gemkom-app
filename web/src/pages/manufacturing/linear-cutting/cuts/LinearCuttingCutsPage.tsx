import { Alert, Badge, Button, Grid, Group, Loader, Select, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { isApiError } from '@/api/client';
import { linearCuttingTaskQueryOptions } from '@/api/manufacturing/linearCutting';
import {
  confirmLinearSession,
  createLinearPartsBulk,
  deleteLinearPart,
  downloadLinearSessionPdf,
  lcSessionKeys,
  linearPartsQueryOptions,
  linearSessionPdfUrl,
  linearSessionQueryOptions,
  linearSessionsQueryOptions,
  optimizeLinearSession,
  patchLinearPart,
  patchLinearSession,
  type LinearConfirmResult,
  type LinearCuttingSession,
  type LinearOptimizationResult,
} from '@/api/manufacturing/linearCuttingSessions';
import { confirm, FaIcon, notify, PageHeader, Panel } from '@/ui';
import { ConfirmResultModal, CreatePlanModal, StockBarsModal } from './CutsModals';
import { EmptyState, OptimizationResult } from './OptimizationResult';
import {
  castNumber,
  copyRow,
  emptyRow,
  partsToRows,
  toPayload,
  validatePayload,
  type PartRow,
} from './partRows';
import { PartsTable } from './PartsTable';

interface PlanDetails {
  title: string;
  stock: string;
  kerf: string;
  notes: string;
}

function planDetails(session: LinearCuttingSession): PlanDetails {
  return {
    title: session.title || '',
    stock: session.stock_length_mm != null ? String(session.stock_length_mm) : '',
    kerf: String(Number(session.kerf_mm ?? 0) || ''),
    notes: session.notes || '',
  };
}

/** The selector's text: key — title · N bar · Stok: Tamam/Eksik. */
function sessionLabel(s: LinearCuttingSession) {
  const summary = Array.isArray(s.optimization_summary) ? s.optimization_summary : [];
  const bars = summary.reduce((acc, g) => acc + (Number(g.bars_needed ?? 0) || 0), 0);
  const stock = s.stock_entry_complete ? 'Stok: Tamam' : 'Stok: Eksik';
  return `${s.key}  —  ${s.title || ''}${bars ? ` · ${bars} bar` : ''} · ${stock}`;
}

/** Port of manufacturing/linear-cutting/cuts: cutting plans, their parts and the optimizer. */
export function LinearCuttingCutsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const taskKey = searchParams.get('task');
  // A ?task= link opens the plan of that bar task once it is known.
  const sessionKey = taskKey ? null : searchParams.get('session') || null;

  const task = useQuery({
    ...linearCuttingTaskQueryOptions(taskKey ?? ''),
    enabled: Boolean(taskKey),
  });
  useEffect(() => {
    if (!taskKey || task.isPending) return;
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    if (task.data?.session) next.set('session', task.data.session);
    setSearchParams(next, { replace: true });
  }, [taskKey, task.isPending, task.data, searchParams, setSearchParams]);

  const sessions = useQuery(linearSessionsQueryOptions());
  const sessionQuery = useQuery({
    ...linearSessionQueryOptions(sessionKey ?? ''),
    enabled: Boolean(sessionKey),
  });
  const partsQuery = useQuery({
    ...linearPartsQueryOptions(sessionKey ?? ''),
    enabled: Boolean(sessionKey),
  });
  const session = sessionKey ? sessionQuery.data : undefined;

  useEffect(() => {
    if (sessions.isError) notify.error(sessions.error);
  }, [sessions.isError, sessions.error]);
  useEffect(() => {
    if (sessionQuery.isError) notify.error(sessionQuery.error);
  }, [sessionQuery.isError, sessionQuery.error]);
  useEffect(() => {
    if (partsQuery.isError) notify.error(partsQuery.error);
  }, [partsQuery.isError, partsQuery.error]);

  // ---- plan form: filled from the plan each time it is (re)loaded ----
  const [details, setDetails] = useState<PlanDetails>({
    title: '',
    stock: '',
    kerf: '',
    notes: '',
  });
  const [detailsFrom, setDetailsFrom] = useState<LinearCuttingSession | undefined>(undefined);
  if (session !== detailsFrom) {
    setDetailsFrom(session);
    if (session) setDetails(planDetails(session));
  }

  // ---- parts: saved rows from the server, new rows and the row in edit here ----
  const [drafts, setDrafts] = useState<PartRow[]>([]);
  const [editing, setEditing] = useState<PartRow | null>(null);
  const [rowsFor, setRowsFor] = useState(sessionKey);
  if (rowsFor !== sessionKey) {
    setRowsFor(sessionKey);
    setDrafts([]);
    setEditing(null);
  }
  const serverParts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);
  const rows = useMemo(() => {
    const saved = partsToRows(serverParts).map((r) =>
      editing && editing.rowId === r.rowId ? editing : r,
    );
    return [...drafts, ...saved];
  }, [serverParts, drafts, editing]);

  // ---- optimization: the plan's saved result until this page runs a new one ----
  const [optimized, setOptimized] = useState<{
    key: string;
    result: LinearOptimizationResult;
    at: number;
  } | null>(null);
  const result =
    optimized && optimized.key === sessionKey && optimized.at > sessionQuery.dataUpdatedAt
      ? optimized.result
      : (session?.optimization_result ?? null);
  useEffect(() => {
    // Data-quality warnings from the backend (e.g. an implausible Kesit).
    (result?.warnings ?? []).forEach((w) => notify.warning(w));
  }, [result]);

  const [creating, setCreating] = useState(false);
  const [stockBarsOpen, setStockBarsOpen] = useState(false);
  const [confirmResult, setConfirmResult] = useState<LinearConfirmResult | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'pdf' | 'optimize' | 'confirm' | 'bulk'>(null);
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const selectSession = (key: string | null) => setSearchParams(key ? { session: key } : {});

  const refetchParts = () =>
    sessionKey
      ? queryClient.invalidateQueries({ queryKey: lcSessionKeys.parts(sessionKey) })
      : Promise.resolve();

  const reloadSession = async () => {
    if (!sessionKey) return;
    await queryClient.refetchQueries({ queryKey: lcSessionKeys.detail(sessionKey) });
  };

  // ---- plan actions ----
  const saveSession = async () => {
    if (!sessionKey) return;
    setBusy('save');
    try {
      const saved = await patchLinearSession(sessionKey, {
        title: details.title,
        stock_length_mm: castNumber(details.stock, 6000),
        kerf_mm: castNumber(details.kerf, 3),
        notes: details.notes,
      });
      queryClient.setQueryData(lcSessionKeys.detail(sessionKey), saved);
      void queryClient.invalidateQueries({ queryKey: lcSessionKeys.list() });
      notify.success('Plan kaydedildi.');
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(null);
    }
  };

  const optimize = async () => {
    if (!sessionKey) return;
    if (drafts.length) {
      notify.warning('Önce yeni parçaları "Toplu Kaydet" ile kaydedin.');
      return;
    }
    if (!serverParts.length) {
      notify.warning('Önce en az bir parça ekleyin.');
      return;
    }
    if (serverParts.some((p) => !p.item)) {
      notify.warning('Optimizasyon için tüm parçalarda profil (malzeme kartı) seçilmelidir.');
      return;
    }
    setBusy('optimize');
    try {
      const res = await optimizeLinearSession(sessionKey, {
        stock_length_mm: castNumber(details.stock, null),
        kerf_mm: castNumber(details.kerf, null),
      });
      setOptimized({ key: sessionKey, result: res, at: Date.now() });
      void queryClient.invalidateQueries({ queryKey: lcSessionKeys.list() });
      notify.success('Optimizasyon tamamlandı.');
    } catch (error) {
      notify.error(error, { fallback: 'Optimizasyon başarısız.' });
    } finally {
      setBusy(null);
    }
  };

  const confirmPlan = async () => {
    if (!sessionKey) return;
    const ok = await confirm({
      title: 'Planı Onayla',
      message: 'Bar görevleri ve planlama talebi oluşturulacak. Bu işlem geri alınamaz.',
      confirmLabel: 'Evet, Onayla',
    });
    if (!ok) return;
    setBusy('confirm');
    try {
      const res = await confirmLinearSession(sessionKey);
      setConfirmResult(res);
      await reloadSession();
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        notify.warning('Bu plan zaten onaylanmış.');
        await reloadSession();
      } else {
        notify.error(error, { fallback: 'Onaylanamadı.' });
      }
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    if (!sessionKey) return;
    setBusy('pdf');
    try {
      await downloadLinearSessionPdf(sessionKey);
    } catch (error) {
      // Fallback: still open the direct URL for cookie-based auth setups.
      try {
        window.open(linearSessionPdfUrl(sessionKey), '_blank', 'noopener');
      } catch {
        /* ignore */
      }
      notify.error(error, { fallback: 'PDF indirilemedi.' });
    } finally {
      setBusy(null);
    }
  };

  // ---- part actions ----
  const changeRow = (row: PartRow) => {
    if (!row.id) setDrafts((prev) => prev.map((r) => (r.rowId === row.rowId ? row : r)));
    else if (editing && editing.rowId === row.rowId) setEditing(row);
  };

  const scrollToTable = () =>
    requestAnimationFrame(() =>
      tableRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }),
    );

  const addRow = () => {
    if (!sessionKey) {
      notify.warning('Önce bir plan seçin.');
      return;
    }
    setDrafts((prev) => [emptyRow(rows), ...prev]);
    scrollToTable();
  };

  const duplicate = (row: PartRow) => {
    if (!sessionKey) {
      notify.warning('Önce bir plan seçin.');
      return;
    }
    setDrafts((prev) => [copyRow(row, rows), ...prev]);
    scrollToTable();
  };

  const saveRow = async (row: PartRow) => {
    if (!sessionKey || !row.id) return;
    const payload = toPayload(row, sessionKey);
    const problem = validatePayload(payload, rows);
    if (problem) {
      notify.warning(problem);
      return;
    }
    if (!payload.label) payload.label = `Parça ${row.id}`;
    setSavingRow(row.rowId);
    try {
      await patchLinearPart(row.id, payload);
      notify.success('Parça güncellendi.');
      setEditing(null);
      await refetchParts();
    } catch (error) {
      notify.error(error, { fallback: 'Parça kaydedilirken hata oluştu.' });
    } finally {
      setSavingRow(null);
    }
  };

  const deleteRow = async (row: PartRow) => {
    if (!row.id) return;
    const ok = await confirm({
      title: 'Parçayı Sil',
      message: `"${row.label || row.id}" parçasını silmek istiyor musunuz?`,
      confirmLabel: 'Evet, Sil',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteLinearPart(row.id);
      notify.success('Parça silindi.');
      if (editing?.rowId === row.rowId) setEditing(null);
      await refetchParts();
    } catch (error) {
      notify.error(error, { fallback: 'Silinemedi.' });
    }
  };

  const bulkSave = async () => {
    if (!sessionKey) {
      notify.warning('Önce bir plan seçin.');
      return;
    }
    if (!drafts.length) {
      notify.info('Kaydedilecek yeni satır yok.');
      return;
    }
    if (editing) {
      notify.warning('Önce düzenlenen satırı kaydedin veya iptal edin.');
      return;
    }
    const payloads = [];
    const blankLabel = new Set<number>();
    for (const [i, row] of drafts.entries()) {
      const payload = toPayload(row, sessionKey);
      const problem = validatePayload(payload, rows, `Satır ${i + 1}`);
      if (problem) {
        notify.warning(problem);
        return;
      }
      if (!payload.label) blankLabel.add(i);
      payloads.push(payload);
    }
    setBusy('bulk');
    try {
      const created = await createLinearPartsBulk(payloads);
      // A part left without a name is called "Parça {id}"; name them all at once.
      await Promise.allSettled(
        created.flatMap((p, i) =>
          blankLabel.has(i) && p?.id ? [patchLinearPart(p.id, { label: `Parça ${p.id}` })] : [],
        ),
      );
      notify.success(`${payloads.length} parça kaydedildi.`);
      setDrafts([]);
      await refetchParts();
    } catch (error) {
      notify.error(error, { fallback: 'Toplu kayıt başarısız.' });
    } finally {
      setBusy(null);
    }
  };

  // ---- render ----
  const confirmed = Boolean(session?.tasks_created || session?.planning_request_created);
  const stockBars = Array.isArray(session?.stock_bars) ? session.stock_bars : [];
  const declaredBars = stockBars.reduce((acc, bar) => acc + (Number(bar?.quantity ?? 0) || 0), 0);

  const sessionOptions = useMemo(
    () => (sessions.data ?? []).map((s) => ({ value: s.key, label: sessionLabel(s) })),
    [sessions.data],
  );

  const resultKey =
    optimized && result === optimized.result ? `opt-${optimized.at}` : `s-${sessionKey}`;

  return (
    <>
      <PageHeader
        title="Lineer Kesim"
        subtitle="Kesim planları, parça yönetimi ve optimizasyon"
        icon="ruler-horizontal"
        backTo="/manufacturing/linear-cutting/"
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Kesim Planı
          </Button>
        }
      />

      <Panel
        title="Kesim Planı"
        icon="fas fa-stream"
        actions={
          <>
            {confirmed ? (
              <Badge
                color="green"
                variant="light"
                tt="none"
                leftSection={<FaIcon icon="fas fa-check-circle" />}
              >
                Görevler Oluşturuldu
              </Badge>
            ) : null}
            <Button
              size="xs"
              variant="default"
              leftSection={<FaIcon icon="fas fa-sync" />}
              loading={sessions.isFetching}
              title="Listeyi Yenile"
              onClick={() => void sessions.refetch()}
            >
              Yenile
            </Button>
          </>
        }
      >
        <Grid align="flex-end">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Select
              label="Kesim Planı Seç"
              placeholder={sessions.isPending ? 'Yükleniyor...' : '— Seçiniz —'}
              leftSection={<FaIcon icon="fas fa-folder-open" color="var(--mantine-color-blue-6)" />}
              data={sessionOptions}
              value={sessionKey}
              onChange={selectSession}
              searchable
              clearable
              nothingFoundMessage="Plan bulunamadı"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Button
              fullWidth
              color="green"
              leftSection={<FaIcon icon="fas fa-check-circle" />}
              disabled={!sessionKey}
              loading={busy === 'confirm'}
              onClick={() => void confirmPlan()}
            >
              Onayla &amp; Görevler
            </Button>
          </Grid.Col>
        </Grid>
        {confirmed ? (
          <Text c="dimmed" size="sm" mt="xs">
            <FaIcon icon="fas fa-info-circle" style={{ marginRight: 4 }} />
            Bu plan daha önce onaylanmış.
          </Text>
        ) : null}
      </Panel>

      {!sessionKey ? (
        taskKey ? (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        ) : (
          <EmptyState icon="fas fa-ruler-horizontal">
            Bir kesim planı seçin veya <strong>Yeni Kesim Planı</strong> oluşturun.
          </EmptyState>
        )
      ) : !session ? (
        sessionQuery.isError ? (
          <EmptyState icon="fas fa-triangle-exclamation">Kesim planı yüklenemedi.</EmptyState>
        ) : (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        )
      ) : (
        <>
          <Panel
            title="Kesim Planı Detayları"
            icon="fas fa-edit"
            actions={
              <>
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<FaIcon icon="fas fa-save" />}
                  loading={busy === 'save'}
                  onClick={() => void saveSession()}
                >
                  Kaydet
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  color="cyan"
                  leftSection={<FaIcon icon="fas fa-bars-staggered" />}
                  disabled={!stockBars.length}
                  onClick={() => setStockBarsOpen(true)}
                >
                  Stok Barlar{stockBars.length ? ` (${declaredBars})` : ''}
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-file-pdf" />}
                  loading={busy === 'pdf'}
                  onClick={() => void downloadPdf()}
                >
                  PDF
                </Button>
              </>
            }
          >
            <Grid gap="sm">
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput label="Plan No" value={session.key} readOnly />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Başlık"
                  placeholder="Plan başlığı"
                  value={details.title}
                  onChange={(e) => setDetails({ ...details, title: e.currentTarget.value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput
                  label="Stok Boyu (mm)"
                  type="number"
                  min={1}
                  value={details.stock}
                  onChange={(e) => setDetails({ ...details, stock: e.currentTarget.value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 3 }}>
                <TextInput
                  label="Kerf (mm)"
                  type="number"
                  min={0}
                  value={details.kerf}
                  onChange={(e) => setDetails({ ...details, kerf: e.currentTarget.value })}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <TextInput
                  label="Not"
                  placeholder="Opsiyonel not"
                  value={details.notes}
                  onChange={(e) => setDetails({ ...details, notes: e.currentTarget.value })}
                />
              </Grid.Col>
            </Grid>
          </Panel>

          <Panel
            title="Parçalar"
            icon="fas fa-puzzle-piece"
            actions={
              <>
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<FaIcon icon="fas fa-save" />}
                  disabled={!drafts.length}
                  loading={busy === 'bulk'}
                  onClick={() => void bulkSave()}
                >
                  Toplu Kaydet
                </Button>
                <Button size="xs" leftSection={<FaIcon icon="fas fa-plus" />} onClick={addRow}>
                  Parça Ekle
                </Button>
              </>
            }
          >
            <Alert color="blue" p="xs" mb="sm" icon={<FaIcon icon="fas fa-info-circle" />}>
              <strong>İpucu:</strong> Satır içinden düzenleyebilir, kaydedebilir veya iptal
              edebilirsiniz.
            </Alert>
            <div ref={tableRef}>
              {partsQuery.isPending ? (
                <Group justify="center" p="md">
                  <Loader size="sm" />
                </Group>
              ) : (
                <PartsTable
                  rows={rows}
                  editingId={editing?.rowId ?? null}
                  savingId={savingRow}
                  sessionStockMm={session.stock_length_mm}
                  onChange={changeRow}
                  onEdit={(row) => setEditing(row)}
                  onSave={(row) => void saveRow(row)}
                  onCancel={() => setEditing(null)}
                  onCopy={duplicate}
                  onRemoveNew={(row) =>
                    setDrafts((prev) => prev.filter((r) => r.rowId !== row.rowId))
                  }
                  onDelete={(row) => void deleteRow(row)}
                />
              )}
            </div>
          </Panel>

          <Panel
            title="Optimizasyon Sonucu"
            icon="fas fa-chart-bar"
            actions={
              <Button
                size="xs"
                variant="outline"
                color="green"
                leftSection={<FaIcon icon="fas fa-play" />}
                loading={busy === 'optimize'}
                onClick={() => void optimize()}
              >
                Optimize Et
              </Button>
            }
          >
            <Alert color="gray" p="xs" mb="md" icon={<FaIcon icon="fas fa-circle-info" />}>
              Boylar uzun kenardan (en uzun nokta) girilir. Açı işareti: <strong>+</strong> alt
              kenar uzun, <strong>&minus;</strong> üst kenar uzun. Şekil sütunu parçanın gerçek
              görünümünü gösterir.
            </Alert>
            <OptimizationResult key={resultKey} result={result} />
          </Panel>

          <StockBarsModal
            bars={stockBars}
            opened={stockBarsOpen}
            onClose={() => setStockBarsOpen(false)}
          />
        </>
      )}

      <ConfirmResultModal result={confirmResult} onClose={() => setConfirmResult(null)} />

      {creating ? (
        <CreatePlanModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            void queryClient.invalidateQueries({ queryKey: lcSessionKeys.list() });
            selectSession(created.key);
          }}
        />
      ) : null}
    </>
  );
}
