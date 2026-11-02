import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  NumberInput,
  SimpleGrid,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import { ncrQueryOptions, ncrsQueryOptions } from '@/api/quality-control/ncrs';
import {
  bulkSubmitQCReviews,
  qcReviewsQueryOptions,
  type QCReviewInput,
} from '@/api/quality-control/qcReviews';
import { FaIcon, notify } from '@/ui';
import { useDepartmentTasks } from '../context';
import classes from '../DepartmentTasks.module.css';
import { legacyErrorText, type QcReviewDraft } from '../logic';
import { jobOrderLabel, TabTitle } from './SimpleTabs';

function dateTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('tr-TR') : '-';
}

function Loading() {
  return (
    <Center py="lg">
      <Loader size="sm" />
    </Center>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />}>
      {children}
    </Alert>
  );
}

// ---- KK'ya Gönder (manufacturing) ----

interface ReviewRow {
  id: number;
  location: string;
  quantity: number | string;
  drawing_no: string;
  position_no: string;
  notes: string;
}

let reviewRowId = 0;
function newRow(draft?: Partial<QcReviewDraft>): ReviewRow {
  return {
    id: ++reviewRowId,
    location: draft?.location ?? '',
    quantity: draft?.quantity_inspected ?? '',
    drawing_no: draft?.drawing_no ?? '',
    position_no: draft?.position_no ?? '',
    notes: draft?.notes ?? '',
  };
}

/** Legacy renderSubmitQCActionForm + setupQCReviewsBuilderInline + handleSubmitQCActionSubmit. */
export function SubmitQcTab({ task }: { task: DepartmentTask }) {
  const { closeTask, openDialog, refreshRow } = useDepartmentTasks();
  const [rows, setRows] = useState<ReviewRow[]>(() => [newRow()]);
  const [busy, setBusy] = useState(false);
  const update = (id: number, patch: Partial<ReviewRow>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const submit = async () => {
    if (rows.length === 0) return void notify.error('En az bir inceleme eklemelisiniz');
    // Empty rows still go as {} (legacy).
    const reviews: QCReviewInput[] = rows.map((row) => {
      const review: QCReviewInput = {};
      if (row.location.trim()) review.location = row.location.trim();
      if (row.quantity !== '')
        review.quantity_inspected = Number.parseInt(String(row.quantity), 10) || null;
      if (row.position_no.trim()) review.position_no = row.position_no.trim();
      if (row.drawing_no.trim()) review.drawing_no = row.drawing_no.trim();
      if (row.notes.trim()) review.notes = row.notes.trim();
      return review;
    });
    setBusy(true);
    try {
      const response = await bulkSubmitQCReviews(task.id, reviews);
      const count = Array.isArray(response) ? response.length : 1;
      notify.success(`${count} inceleme kalite kontrolüne gönderildi`);
      closeTask();
      void refreshRow(task.id);
    } catch (error) {
      notify.error(legacyErrorText(error, 'Kalite kontrolüne gönderilirken hata oluştu', true));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TabTitle icon="fas fa-clipboard-check">Kalite Kontrolüne Gönder</TabTitle>
      <SimpleGrid cols={2} mb="md">
        <TextInput label="İş Emri" value={jobOrderLabel(task)} readOnly />
        <TextInput label="Görev" value={task.title || '-'} readOnly />
      </SimpleGrid>
      <Group justify="space-between" mb="xs">
        <Text fw={600}>
          <FaIcon icon="fas fa-clipboard-list" style={{ marginRight: 8 }} />
          İnceleme Bilgileri
        </Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="outline"
            color="green"
            leftSection={<FaIcon icon="fas fa-file-excel" />}
            onClick={() =>
              openDialog({
                kind: 'qc-excel',
                onImport: (reviews) => setRows((r) => [...r, ...reviews.map((d) => newRow(d))]),
              })
            }
          >
            Excel&apos;den İçe Aktar
          </Button>
          <Button
            size="xs"
            variant="outline"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setRows((r) => [...r, newRow()])}
          >
            İnceleme Ekle
          </Button>
        </Group>
      </Group>
      <Table withTableBorder verticalSpacing={4} mb="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Konum</Table.Th>
            <Table.Th>İncelenen Miktar</Table.Th>
            <Table.Th>Çizim No</Table.Th>
            <Table.Th>Pozisyon No</Table.Th>
            <Table.Th>Notlar</Table.Th>
            <Table.Th>İşlem</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, i) => (
            <Table.Tr key={row.id}>
              <Table.Td>
                <TextInput
                  size="xs"
                  aria-label={`Konum ${i + 1}`}
                  placeholder="Örn: Atölye B, Raf 3"
                  value={row.location}
                  onChange={(e) => update(row.id, { location: e.currentTarget.value })}
                />
              </Table.Td>
              <Table.Td>
                <NumberInput
                  size="xs"
                  aria-label={`İncelenen Miktar ${i + 1}`}
                  placeholder="0"
                  min={0}
                  allowDecimal={false}
                  value={row.quantity}
                  onChange={(v) => update(row.id, { quantity: v })}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  size="xs"
                  aria-label={`Çizim No ${i + 1}`}
                  placeholder="Örn: GEM-254-01-A"
                  value={row.drawing_no}
                  onChange={(e) => update(row.id, { drawing_no: e.currentTarget.value })}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  size="xs"
                  aria-label={`Pozisyon No ${i + 1}`}
                  placeholder="Örn: POS-07"
                  value={row.position_no}
                  onChange={(e) => update(row.id, { position_no: e.currentTarget.value })}
                />
              </Table.Td>
              <Table.Td>
                <TextInput
                  size="xs"
                  aria-label={`Notlar ${i + 1}`}
                  placeholder="Notlar"
                  value={row.notes}
                  onChange={(e) => update(row.id, { notes: e.currentTarget.value })}
                />
              </Table.Td>
              <Table.Td>
                <ActionIcon
                  variant="outline"
                  color="red"
                  title="İncelemeyi Kaldır"
                  aria-label="İncelemeyi Kaldır"
                  onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                >
                  <FaIcon icon="fas fa-trash" />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Button
        type="submit"
        color="yellow"
        loading={busy}
        leftSection={<FaIcon icon="fas fa-clipboard-check" />}
      >
        KK&apos;ya Gönder
      </Button>
    </form>
  );
}

// ---- KK İncelemeleri ----

const QC_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: 'yellow', label: 'Beklemede' },
  approved: { color: 'green', label: 'Onaylandı' },
  rejected: { color: 'red', label: 'Reddedildi' },
};

interface PartData {
  location?: string;
  quantity_inspected?: number | string;
  drawing_no?: string;
  position_no?: string;
}

/** Legacy renderQCReviewsTab: up to 100 reviews, NCR numbers of the rejected ones. */
export function QcReviewsTab({ task }: { task: DepartmentTask }) {
  const reviews = useQuery(
    qcReviewsQueryOptions({ task: task.id, ordering: '-submitted_at', page: 1, page_size: 100 }),
  );
  const rows = reviews.data?.results ?? [];
  const ncrIds = rows
    .filter((r) => r.status === 'rejected' && (r as { ncr?: number }).ncr)
    .map((r) => ({ reviewId: r.id, ncr: Number((r as { ncr?: number }).ncr) }));
  const ncrs = useQueries({
    queries: ncrIds.map((x) => ({ ...ncrQueryOptions(x.ncr), retry: false })),
  });
  const ncrByReview = new Map(ncrIds.map((x, i) => [x.reviewId, ncrs[i]?.data]));

  if (reviews.isPending) return <Loading />;
  if (reviews.isError) return <Text c="red">KK incelemeleri yüklenirken hata oluştu</Text>;
  const title = <TabTitle icon="fas fa-clipboard-check">KK İncelemeleri</TabTitle>;
  if (rows.length === 0) {
    return (
      <>
        {title}
        <Empty>Bu görev için henüz kalite kontrol incelemesi bulunmamaktadır.</Empty>
      </>
    );
  }
  return (
    <>
      {title}
      <Table.ScrollContainer minWidth={900}>
        <Table withTableBorder striped highlightOnHover fz="sm">
          <Table.Thead>
            <Table.Tr>
              {[
                'ID',
                'Konum',
                'İncelenen Miktar',
                'Çizim No',
                'Pozisyon No',
                'Durum',
                'Gönderen',
                'Gönderilme Tarihi',
                'İnceleyen',
                'İnceleme Tarihi',
                'Yorum',
                'NCR',
              ].map((h) => (
                <Table.Th key={h}>{h}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((review) => {
              const part = (review.part_data ?? {}) as PartData;
              const status = QC_STATUS[review.status ?? ''];
              const ncrId = (review as { ncr?: number }).ncr;
              const ncr = ncrByReview.get(review.id);
              return (
                <Table.Tr key={review.id}>
                  <Table.Td>
                    <a
                      href={`/quality-control/qc-reviews/?review=${review.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className={classes.keyLink}
                    >
                      #{review.id}
                    </a>
                  </Table.Td>
                  <Table.Td>{part.location || '-'}</Table.Td>
                  <Table.Td>{part.quantity_inspected || '-'}</Table.Td>
                  <Table.Td>{part.drawing_no || '-'}</Table.Td>
                  <Table.Td>{part.position_no || '-'}</Table.Td>
                  <Table.Td>
                    <Badge color={status?.color ?? 'gray'}>
                      {status?.label ?? (review.status || '-')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{review.submitted_by_name || '-'}</Table.Td>
                  <Table.Td>{dateTime(review.submitted_at)}</Table.Td>
                  <Table.Td>{review.reviewed_by_name || '-'}</Table.Td>
                  <Table.Td>{dateTime(review.reviewed_at)}</Table.Td>
                  <Table.Td>{review.comment || '-'}</Table.Td>
                  <Table.Td>
                    {review.status === 'rejected' && ncrId ? (
                      <Anchor
                        href={`/quality-control/ncrs/?ncr=${ncr?.ncr_number ? encodeURIComponent(ncr.ncr_number) : ncrId}`}
                        target="_blank"
                      >
                        <Badge leftSection={<FaIcon icon="fas fa-exclamation-triangle" />}>
                          {ncr?.ncr_number || `NCR #${ncrId}`}
                        </Badge>
                      </Anchor>
                    ) : (
                      '-'
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}

// ---- Uygunsuzluk Raporları ----

const NCR_STATUS: Record<string, { color: string; label: string }> = {
  draft: { color: 'gray', label: 'Taslak' },
  submitted: { color: 'yellow', label: 'Gönderildi' },
  approved: { color: 'green', label: 'Onaylandı' },
  rejected: { color: 'red', label: 'Reddedildi' },
  closed: { color: 'cyan', label: 'Kapatıldı' },
};

const NCR_SEVERITY: Record<string, { color: string; label: string }> = {
  minor: { color: 'yellow', label: 'Minör' },
  major: { color: 'orange', label: 'Majör' },
  critical: { color: 'red', label: 'Kritik' },
};

/** Legacy renderNCRsTab. */
export function NcrsTab({ task }: { task: DepartmentTask }) {
  const query = useQuery(
    ncrsQueryOptions({
      department_task: task.id,
      ordering: '-created_at',
      page: 1,
      page_size: 100,
    }),
  );
  if (query.isPending) return <Loading />;
  if (query.isError) return <Text c="red">Uygunsuzluk raporları yüklenirken hata oluştu</Text>;
  const rows = query.data.results;
  const title = <TabTitle icon="fas fa-exclamation-triangle">Uygunsuzluk Raporları</TabTitle>;
  if (rows.length === 0) {
    return (
      <>
        {title}
        <Empty>Bu görev için henüz uygunsuzluk raporu bulunmamaktadır.</Empty>
      </>
    );
  }
  return (
    <>
      {title}
      <Table.ScrollContainer minWidth={800}>
        <Table withTableBorder striped highlightOnHover fz="sm">
          <Table.Thead>
            <Table.Tr>
              {[
                'NCR No',
                'Başlık',
                'Durum',
                'Önem Derecesi',
                'Kusur Tipi',
                'Etkilenen Miktar',
                'Atanan Takım',
                'Oluşturulma Tarihi',
              ].map((h) => (
                <Table.Th key={h}>{h}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((ncr) => {
              const status = NCR_STATUS[String(ncr.status ?? '')];
              const severity = NCR_SEVERITY[ncr.severity ?? ''];
              return (
                <Table.Tr key={ncr.id}>
                  <Table.Td>
                    {ncr.ncr_number || ncr.id ? (
                      <a
                        href={`/quality-control/ncrs/?ncr=${ncr.ncr_number ? encodeURIComponent(ncr.ncr_number) : ncr.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={classes.keyLink}
                      >
                        {ncr.ncr_number || `NCR #${ncr.id}`}
                      </a>
                    ) : (
                      '-'
                    )}
                  </Table.Td>
                  <Table.Td>{ncr.title || '-'}</Table.Td>
                  <Table.Td>
                    <Badge color={status?.color ?? 'gray'}>
                      {status?.label ?? (ncr.status_display || ncr.status || '-')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={severity?.color ?? 'gray'}>
                      {severity?.label ?? (ncr.severity_display || ncr.severity || '-')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{ncr.defect_type_display || ncr.defect_type || '-'}</Table.Td>
                  <Table.Td>{ncr.affected_quantity || '-'}</Table.Td>
                  <Table.Td>
                    {ncr.assigned_team != null && ncr.assigned_team !== ''
                      ? String(ncr.assigned_team)
                      : '-'}
                  </Table.Td>
                  <Table.Td>{dateTime(ncr.created_at)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}
