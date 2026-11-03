import { ActionIcon, Anchor, Button, Group } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  DEPARTMENT_CHOICES,
  offerConsultationsQueryOptions,
  type ConsultationFile,
  type ConsultationTask,
} from '@/api/sales/offers';
import {
  DataTable,
  FaIcon,
  notify,
  StatusBadge,
  type DataTableColumn,
  type StatusFamily,
} from '@/ui';
import { ConsultationCommentsModal } from '../dialogs/ConsultationCommentsModal';
import { ConsultationFormModal } from '../dialogs/ConsultationFormModal';
import { canSendConsultations, shortDate } from '../logic';
import { TabFooter, type TabProps } from '../OfferModal';
import { ErrorText } from '../parts';
import css from '../OffersPage.module.css';

interface Row {
  task: ConsultationTask;
  department: string;
  title: string;
  status: string;
  assigned: string;
  deadline: string;
  notes: string;
  response: string;
}

const TASK_STATUS: Record<string, { label: string; family: StatusFamily }> = {
  pending: { label: 'Bekliyor', family: 'yellow' },
  in_progress: { label: 'Devam Ediyor', family: 'blue' },
  completed: { label: 'Tamamlandı', family: 'green' },
  cancelled: { label: 'İptal', family: 'red' },
};

async function copyNote(text: string) {
  if (!text) {
    notify.warning('Kopyalanacak not yok');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    notify.success('Not panoya kopyalandı');
  } catch {
    notify.error('Not kopyalanamadı');
  }
}

/** Long notes are cut at 80 characters; the whole text is in the tooltip and the copy button. */
function NoteCell({ value }: { value: string }) {
  const full = value.trim();
  if (!full) return <>-</>;
  return (
    <span>
      <span title={full}>{full.length > 80 ? `${full.slice(0, 80)}…` : full}</span>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="xs"
        ml={4}
        title="Notu panoya kopyala"
        aria-label="Notu panoya kopyala"
        onClick={(e) => {
          e.stopPropagation();
          void copyNote(full);
        }}
      >
        <FaIcon icon="fas fa-copy" />
      </ActionIcon>
    </span>
  );
}

function FileLinks({ files }: { files: ConsultationFile[] | undefined }) {
  if (!files?.length) return <>-</>;
  return (
    <Group gap={4}>
      {files.map((f) => {
        const name = f.filename || f.name || 'Dosya';
        return (
          <Anchor
            key={f.id}
            href={f.file_url}
            target="_blank"
            rel="noopener"
            className={css.fileChip}
            title={name}
          >
            {name}
          </Anchor>
        );
      })}
    </Group>
  );
}

const columns: DataTableColumn<Row>[] = [
  { key: 'department', header: 'Departman', sortable: true },
  { key: 'title', header: 'Başlık', sortable: true },
  {
    key: 'status',
    header: 'Durum',
    align: 'center',
    render: (row) => {
      const s = TASK_STATUS[row.status] ?? { label: row.status || '-', family: 'grey' as const };
      return <StatusBadge color={s.family}>{s.label}</StatusBadge>;
    },
  },
  { key: 'assigned', header: 'Atanan', sortable: true },
  { key: 'deadline', header: 'Hedef Tarih', sortable: true },
  { key: 'notes', header: 'Not', render: (row) => <NoteCell value={row.notes} /> },
  { key: 'response', header: 'Yanıt Notu', render: (row) => <NoteCell value={row.response} /> },
  {
    key: 'shared',
    header: 'Paylaşılan dosyalar',
    render: (row) => <FileLinks files={row.task.shared_files} />,
  },
  {
    key: 'completion',
    header: 'Yanıt dosyaları',
    render: (row) => <FileLinks files={row.task.completion_files} />,
  },
];

/** Legacy Departman Görüşleri: one row per consultation task of every department. */
export function ConsultationsTab({ offer }: TabProps) {
  const query = useQuery(offerConsultationsQueryOptions(offer.id));
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [comments, setComments] = useState<number | null>(null);
  const canSend = canSendConsultations(offer.status);

  const rows = useMemo<Row[]>(
    () =>
      (query.data ?? []).flatMap((c) => {
        const department =
          c.department_display ||
          DEPARTMENT_CHOICES.find((d) => d.value === c.department)?.label ||
          c.department ||
          '-';
        return (c.tasks ?? []).map((t) => {
          const deadline = t.target_completion_date ?? t.deadline ?? t.due_date;
          return {
            task: t,
            department,
            title: t.title || 'Görev',
            status: t.status ?? '',
            assigned: t.assigned_to_name || '-',
            deadline: deadline ? shortDate(deadline) : '-',
            notes: String(t.description ?? ''),
            response: String(t.notes ?? ''),
          };
        });
      }),
    [query.data],
  );

  return (
    <>
      {query.isError ? (
        <ErrorText>Departman görüşleri yüklenemedi.</ErrorText>
      ) : (
        <DataTable
          title="Departman Görüşleri"
          icon="fas fa-comments"
          data={rows}
          columns={columns}
          getRowId={(row) => String(row.task.id)}
          loading={query.isPending}
          rowActions={(row) => [
            {
              key: 'view_consultation_comments',
              label: 'Yorumlar',
              icon: 'fas fa-comments',
              onClick: () => setComments(row.task.id),
            },
            {
              key: 'edit_consultation',
              label: 'Düzenle',
              icon: 'fas fa-edit',
              color: 'primary',
              hidden: !canSend,
              onClick: () => setEditing(row.task.id),
            },
          ]}
          emptyMessage='Henüz departman görüşü gönderilmemiş. "Departman Görüşü Gönder" ile departmana danışma talebi oluşturabilirsiniz.'
        />
      )}

      {sending ? <ConsultationFormModal offer={offer} onClose={() => setSending(false)} /> : null}
      {editing !== null ? (
        <ConsultationFormModal offer={offer} taskId={editing} onClose={() => setEditing(null)} />
      ) : null}
      {comments !== null ? (
        <ConsultationCommentsModal
          offerId={offer.id}
          taskId={comments}
          onClose={() => setComments(null)}
        />
      ) : null}

      <TabFooter>
        {canSend ? (
          <Button
            leftSection={<FaIcon icon="fas fa-paper-plane" />}
            onClick={() => setSending(true)}
          >
            Departman Görüşü Gönder
          </Button>
        ) : null}
      </TabFooter>
    </>
  );
}
