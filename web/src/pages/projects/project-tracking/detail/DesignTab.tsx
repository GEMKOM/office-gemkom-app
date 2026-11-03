import { Button, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  currentReleaseQueryOptions,
  jobOrderReleasesQueryOptions,
  releaseKeys,
  requestReleaseRevision,
  type DrawingRelease,
} from '@/api/projects/design';
import { formatDateTime } from '@/lib/format';
import {
  DataTable,
  FaIcon,
  FormModal,
  ModalSection,
  notify,
  StatusBadge,
  type DataTableColumn,
  type StatusFamily,
} from '@/ui';
import css from './JobOrderDetail.module.css';
import { ErrorState, fieldErrors, LoadingState } from './parts';

const STATUS_COLORS: Record<string, StatusFamily> = {
  released: 'green',
  in_revision: 'yellow',
  pending_revision: 'blue',
};

const STATUS_LABELS: Record<string, string> = {
  released: 'Yayınlandı',
  in_revision: 'Revizyonda',
  pending_revision: 'Revizyon Bekliyor',
};

function ReleaseStatus({ release }: { release: DrawingRelease }) {
  const status = release.status ?? '';
  return (
    <StatusBadge color={STATUS_COLORS[status] ?? 'grey'}>
      {release.status_display || STATUS_LABELS[status] || status}
    </StatusBadge>
  );
}

const revision = (r: DrawingRelease) => `(Rev. ${r.revision_number || '-'})`;
const hardcopies = (r: DrawingRelease) => Number(r.hardcopy_count) || 0;

/** Legacy requestRevisionModal: a reason, then POST request_revision. */
function RequestRevisionModal({
  releaseId,
  onClose,
}: {
  releaseId: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: { reason: '' },
    validate: { reason: (v) => (v.trim() ? null : 'Bu alan gereklidir') },
  });

  const save = async ({ reason }: { reason: string }) => {
    setBusy(true);
    try {
      await requestReleaseRevision(releaseId, { reason: reason.trim() });
      notify.success('Revizyon isteği gönderildi');
      onClose();
      await queryClient.invalidateQueries({ queryKey: releaseKeys.all });
    } catch (error) {
      console.error('Error requesting revision:', error);
      notify.error(fieldErrors(error, 'Revizyon isteği gönderilirken hata oluştu'));
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Revizyon İste"
      icon="fas fa-edit"
      size="lg"
      submitting={busy}
      onSubmit={form.onSubmit((values) => void save(values))}
    >
      <ModalSection title="Revizyon İsteği" icon="fas fa-edit">
        <Textarea
          label="Revizyon Nedeni"
          withAsterisk
          autosize
          minRows={3}
          placeholder="Revizyon nedenini açıklayın..."
          description="Revizyon nedenini detaylı olarak açıklayın"
          {...form.getInputProps('reason')}
        />
      </ModalSection>
    </FormModal>
  );
}

/** Dizayn: the active drawing release and every release of the job (legacy renderDrawingReleasesUI). */
export function DesignTab({ jobNo }: { jobNo: string }) {
  const releases = useQuery(jobOrderReleasesQueryOptions(jobNo));
  const current = useQuery(currentReleaseQueryOptions(jobNo));
  const [revisionFor, setRevisionFor] = useState<number | null>(null);
  const currentId = current.data?.id ?? null;

  const columns = useMemo<DataTableColumn<DrawingRelease>[]>(
    () => [
      {
        key: 'revision_code',
        header: 'Revizyon',
        render: (r) => (
          <>
            <strong>{r.revision_code || '-'}</strong> {revision(r)}
          </>
        ),
      },
      { key: 'status', header: 'Durum', render: (r) => <ReleaseStatus release={r} /> },
      { key: 'released_by_name', header: 'Yayınlayan', render: (r) => r.released_by_name || '-' },
      {
        key: 'released_at',
        header: 'Yayın Tarihi',
        render: (r) => (r.released_at ? formatDateTime(r.released_at) : '-'),
      },
      { key: 'hardcopy_count', header: 'Hardcopy', render: (r) => hardcopies(r) },
      {
        key: 'folder_path',
        header: 'Klasör Yolu',
        render: (r) => <code className={css.code}>{r.folder_path || '-'}</code>,
      },
      {
        key: 'changelog',
        header: 'Değişiklik Günlüğü',
        render: (r) =>
          r.changelog?.trim() ? <pre className={css.preCell}>{r.changelog.trim()}</pre> : '-',
      },
    ],
    [],
  );

  if (releases.isPending || current.isPending) return <LoadingState />;
  if (releases.isError || current.isError) {
    return <ErrorState>Teknik çizimler yüklenirken hata oluştu.</ErrorState>;
  }

  const list = releases.data;
  const active = current.data;

  return (
    <div>
      {active ? (
        <div className={css.card}>
          <h4 className={css.cardHead}>
            <FaIcon icon="fas fa-star" />
            Aktif Yayın
          </h4>
          <div className={css.cardBody}>
            <div className={css.releaseGrid}>
              <p>
                <strong>Revizyon:</strong> {active.revision_code || '-'} {revision(active)}
              </p>
              <p>
                <strong>Yayınlayan:</strong> {active.released_by_name || '-'}
              </p>
              <p>
                <strong>Durum:</strong> <ReleaseStatus release={active} />
              </p>
              <p>
                <strong>Yayın Tarihi:</strong>{' '}
                {active.released_at ? formatDateTime(active.released_at) : '-'}
              </p>
              <p>
                <strong>Klasör Yolu:</strong> {active.folder_path || '-'}
              </p>
              <p>
                <strong>Hardcopy Sayısı:</strong> {hardcopies(active)}
              </p>
            </div>
            {active.changelog ? (
              <div style={{ marginTop: 12 }}>
                <strong>Değişiklik Günlüğü:</strong>
                <pre className={css.pre}>{active.changelog}</pre>
              </div>
            ) : null}
            {active.status === 'released' ? (
              <Button
                mt="md"
                size="xs"
                variant="outline"
                leftSection={<FaIcon icon="fas fa-edit" />}
                onClick={() => setRevisionFor(active.id)}
              >
                Revizyon İste
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={css.card}>
        <h4 className={css.cardHead}>
          <FaIcon icon="fas fa-list" />
          Tüm Yayınlar ({list.length || 0})
        </h4>
        <div className={css.cardBody}>
          {list.length === 0 ? (
            <p className={css.state}>
              <FaIcon icon="fas fa-info-circle" /> Henüz teknik çizim yayını bulunmamaktadır.
            </p>
          ) : (
            <DataTable
              data={list}
              columns={columns}
              getRowId={(r) => String(r.id)}
              rowStyle={(r) => (r.id === currentId ? { backgroundColor: '#f8f9fa' } : undefined)}
              extraData={currentId}
            />
          )}
        </div>
      </div>

      {revisionFor !== null ? (
        <RequestRevisionModal releaseId={revisionFor} onClose={() => setRevisionFor(null)} />
      ) : null}
    </div>
  );
}
