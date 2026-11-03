import { Center, Grid, Loader, Select, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  consultationTaskQueryOptions,
  DEPARTMENT_CHOICES,
  offerErrorMessage,
  offerFilesQueryOptions,
  patchConsultationTask,
  sendConsultations,
  useInvalidateOffers,
  type ConsultationTask,
  type OfferDetail,
} from '@/api/sales/offers';
import { FormModal, ModalSection, notify } from '@/ui';
import { toDateInput } from '../logic';
import { FileChecklist } from '../parts';

const NO_FILES_TEXT =
  'Teklifte henüz dosya yok. İstediğiniz dosyaları teklife ekledikten sonra görüş gönderebilirsiniz.';

/**
 * Without `taskId`: legacy showConsultationModal (send a consultation to a
 * department). With it: showEditConsultationModal (title, note, target date
 * and the shared files of a sent one).
 */
export function ConsultationFormModal({
  offer,
  taskId,
  onClose,
}: {
  offer: OfferDetail;
  taskId?: number;
  onClose: () => void;
}) {
  const task = useQuery({
    ...consultationTaskQueryOptions(offer.id, taskId ?? 0),
    enabled: taskId !== undefined,
  });

  useEffect(() => {
    if (task.isError) {
      notify.error(
        task.error instanceof Error && task.error.message
          ? task.error.message
          : 'Görüş görevi yüklenemedi',
      );
      onClose();
    }
  }, [task.isError, task.error, onClose]);

  if (taskId !== undefined && !task.data) {
    if (task.isError) return null;
    return (
      <FormModal
        opened
        onClose={onClose}
        title="Danışma Görevini Düzenle"
        icon="fas fa-edit"
        onSubmit={(e) => e.preventDefault()}
        submitDisabled
      >
        <Center py="xl">
          <Loader />
        </Center>
      </FormModal>
    );
  }
  return <ConsultationForm offer={offer} task={task.data ?? null} onClose={onClose} />;
}

function ConsultationForm({
  offer,
  task,
  onClose,
}: {
  offer: OfferDetail;
  task: ConsultationTask | null;
  onClose: () => void;
}) {
  const invalidate = useInvalidateOffers();
  const files = useQuery(offerFilesQueryOptions(offer.id));
  const [department, setDepartment] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState<string | null>(null);
  const [title, setTitle] = useState(String(task?.title ?? task?.request_title ?? ''));
  const [notes, setNotes] = useState(String(task?.description ?? ''));
  const [deadline, setDeadline] = useState(
    toDateInput(task?.target_completion_date ?? task?.deadline ?? task?.due_date),
  );
  const [selected, setSelected] = useState<number[]>(() =>
    (task?.shared_files ?? []).map((f) => f.id),
  );
  const [busy, setBusy] = useState(false);
  const response = String(task?.notes ?? '');

  const save = async () => {
    setBusy(true);
    try {
      if (task) {
        await patchConsultationTask(offer.id, task.id, {
          title,
          notes,
          deadline: deadline || null,
          file_ids: selected,
        });
        notify.success('Danışma görevi güncellendi');
      } else {
        if (!department) {
          setDepartmentError('Bu alan gereklidir');
          notify.warning('Departman seçin');
          return;
        }
        await sendConsultations(offer.id, [
          {
            department,
            title: offer.title || '',
            task_type: 'sales_consult',
            deadline: offer.offer_expiry_date || null,
            assigned_to: null,
            notes,
            file_ids: selected,
          },
        ]);
        notify.success('Departman görüşü gönderildi');
      }
      onClose();
      await invalidate();
    } catch (error) {
      notify.error(
        offerErrorMessage(error, task ? 'Güncelleme hatası' : 'Görüş gönderilirken hata oluştu'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title={task ? 'Danışma Görevini Düzenle' : 'Departman Görüşü Gönder'}
      icon={task ? 'fas fa-edit' : 'fas fa-paper-plane'}
      size="lg"
      submitting={busy}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <ModalSection
        title={task ? 'Görev Bilgileri' : 'Görüş Talebi'}
        icon={task ? 'fas fa-info-circle' : 'fas fa-building'}
      >
        <Grid gap="sm">
          {task ? (
            <Grid.Col span={12}>
              <TextInput
                label="Başlık"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
              />
            </Grid.Col>
          ) : (
            <Grid.Col span={12}>
              <Select
                label="Departman"
                withAsterisk
                placeholder="Departman seçin"
                data={DEPARTMENT_CHOICES}
                value={department}
                error={departmentError}
                onChange={(value) => {
                  setDepartment(value);
                  setDepartmentError(null);
                }}
              />
            </Grid.Col>
          )}
          {/* A new request asks for the note once a department is picked (legacy). */}
          {task || department ? (
            <Grid.Col span={12}>
              <Textarea
                label="Notlar"
                placeholder="Departmana iletmek istediğiniz notlar (isteğe bağlı)"
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
              />
            </Grid.Col>
          ) : null}
          {task && response.trim() ? (
            <Grid.Col span={12}>
              <Textarea
                label="Yanıt Notu (departmanın yanıtı, düzenlenemez)"
                value={response}
                readOnly
                rows={4}
              />
            </Grid.Col>
          ) : null}
          {task ? (
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                type="date"
                label="Hedef Tarih"
                value={deadline}
                onChange={(e) => setDeadline(e.currentTarget.value)}
              />
            </Grid.Col>
          ) : null}
        </Grid>
      </ModalSection>
      <ModalSection>
        <FileChecklist
          files={files.data}
          loading={files.isPending}
          error={files.isError}
          selected={selected}
          onChange={setSelected}
          withToolbar
          title={task ? 'Paylaşılacak dosyalar' : 'Departmanla paylaşılacak dosyalar'}
          hint={
            task
              ? 'Departmanın görmesini istediğiniz dosyaları işaretleyin. Mevcut setin yerine seçtiğiniz set geçer.'
              : 'Departmanın görmesini istediğiniz dosyaları işaretleyin.'
          }
          emptyTitle="Paylaşılacak dosya yok"
          emptyText={NO_FILES_TEXT}
        />
      </ModalSection>
    </FormModal>
  );
}
