import { Alert, Checkbox, NumberInput, Stack, Textarea, TextInput } from '@mantine/core';
import { useRef, useState } from 'react';
import {
  completeRevision,
  createRelease,
  resubmitRelease,
  selfStartRevision,
  useRejectRelease,
  type DrawingRelease,
  type ReleaseInput,
} from '@/api/projects/design';
import {
  completeDepartmentTask,
  getDepartmentTask,
  type DepartmentTask,
} from '@/api/projects/departmentTasks';
import { FaIcon, FormModal, ModalSection, notify, RichTextEditor } from '@/ui';
import { useDepartmentTasks } from '../context';
import { canSubmitNewDesignRelease, legacyErrorText } from '../logic';
import { jobOrderLabel } from '../tabs/SimpleTabs';

const FOLDER_PLACEHOLDER = 'C:\\CVSPDM\\CVS\\009_KAPTAN\\EAF\\009_34_EBT_PANEL\\PDF';
const CHANGELOG_PLACEHOLDER =
  '3_0003_1045_EBT_RIGHT_PANEL\n20.01.2026 REV. A1 (POZ-04 REVİZE EDİLDİ)\n\n@umit.bal @elvan.gunes @abdullah.anlas';

interface Props {
  onClose: () => void;
}

function hardcopy(value: number | string): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function ReleaseFields({
  task,
  values,
  set,
  folderRequired,
}: {
  task: DepartmentTask;
  values: { folder_path: string; revision_code: string; hardcopy_count: number | string };
  set: (key: 'folder_path' | 'revision_code' | 'hardcopy_count', value: string | number) => void;
  folderRequired: boolean;
}) {
  return (
    <>
      <TextInput
        label="İş Emri"
        value={jobOrderLabel(task)}
        readOnly
        description="İş emri (değiştirilemez)"
      />
      <TextInput
        label="Klasör Yolu"
        withAsterisk={folderRequired}
        placeholder={FOLDER_PLACEHOLDER}
        description="Ağ klasör yolu (maksimum 500 karakter)"
        maxLength={500}
        value={values.folder_path}
        onChange={(e) => set('folder_path', e.currentTarget.value)}
      />
      <TextInput
        label="Revizyon Kodu"
        placeholder="A1, B2, vb."
        description="Revizyon kodu (örn: A1, B2) - maksimum 10 karakter"
        maxLength={10}
        value={values.revision_code}
        onChange={(e) => set('revision_code', e.currentTarget.value)}
      />
      <NumberInput
        label="Hardcopy Sayısı"
        min={0}
        allowDecimal={false}
        placeholder="0"
        description="Hardcopy sayısı (varsayılan: 0)"
        value={values.hardcopy_count}
        onChange={(v) => set('hardcopy_count', v)}
      />
    </>
  );
}

/**
 * Legacy showCreateReleaseModal + its save (and showResubmitReleaseModal):
 * "Teknik Çizim Yayını Oluştur" for a design task.
 */
export function ReleaseDialog({
  task,
  resubmit,
  onClose,
}: Props & { task: DepartmentTask; resubmit?: { releaseId: number; release: DrawingRelease } }) {
  const { config, applyTask, refreshRow } = useDepartmentTasks();
  const release = resubmit?.release;
  const isSubtask = Boolean(task.parent);
  const [values, setValues] = useState({
    folder_path: release?.folder_path || '',
    revision_code: release?.revision_code || '',
    hardcopy_count: (release?.hardcopy_count as number | undefined) ?? ('' as number | string),
    changelog: release?.changelog || (isSubtask && task.title ? task.title : ''),
    auto_complete_design_task: !isSubtask,
  });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  const save = async () => {
    if (inFlight.current) return;
    try {
      const fresh = await getDepartmentTask(task.id);
      if (!fresh.job_order) return void notify.error('İş emri bulunamadı');
      if (!resubmit && !canSubmitNewDesignRelease(config, fresh)) {
        notify.warning(
          fresh.pending_approval_release_id
            ? 'Bu iş emri için zaten inceleme bekleyen bir yayın var.'
            : 'Reddedilmiş yayın var. Lütfen yeniden gönderin.',
        );
        return;
      }
      const data: ReleaseInput = {
        job_order: fresh.job_order,
        folder_path: values.folder_path,
        changelog: values.changelog.trim(),
        revision_code: values.revision_code,
      };
      // Only a main task auto-completes; a subtask is completed right after.
      if (!fresh.parent)
        data.auto_complete_design_task = values.auto_complete_design_task !== false;
      const copies = hardcopy(values.hardcopy_count);
      if (copies !== undefined) data.hardcopy_count = copies;
      if (!data.folder_path.trim()) return void notify.error('Klasör yolu gereklidir');

      inFlight.current = true;
      setBusy(true);
      if (resubmit) {
        await resubmitRelease(resubmit.releaseId, data);
        notify.success('Yayın düzenlendi ve yeniden incelemeye gönderildi');
      } else {
        await createRelease(data);
        if (fresh.parent) applyTask((await completeDepartmentTask(task.id))?.task);
        notify.success(
          'Teknik çizim yayını incelemeye gönderildi. Görev, 2 değerlendirme sonrası tamamlanacaktır.',
        );
      }
      onClose();
      await refreshRow(task.id);
    } catch (error) {
      notify.error(legacyErrorText(error, 'Yayın oluşturulurken hata oluştu'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Teknik Çizim Yayını Oluştur"
      icon="fas fa-file-export"
      onSubmit={() => void save()}
      submitting={busy}
    >
      <ModalSection
        title={resubmit ? 'Yayını Düzenle ve Yeniden Gönder' : 'Yayın Bilgileri'}
        icon="fas fa-info-circle"
      >
        <Stack gap="sm">
          {!resubmit ? (
            <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />}>
              Yayın oluşturulduktan sonra tasarım ekibinden 2 değerlendirme gerekir. İnceleme
              tamamlandıktan sonra görev tamamlanır.
            </Alert>
          ) : null}
          <ReleaseFields task={task} values={values} set={set} folderRequired />
        </Stack>
      </ModalSection>
      <ModalSection title="Değişiklik Günlüğü" icon="fas fa-edit">
        <Stack gap="sm">
          <RichTextEditor
            label="Değişiklik Günlüğü"
            description="Değişiklik günlüğü (@mention ile kullanıcıları bildirebilirsiniz) - Opsiyonel"
            placeholder={CHANGELOG_PLACEHOLDER}
            value={values.changelog}
            onChange={(v) => set('changelog', v)}
          />
          <Checkbox
            label="Son dağıtım"
            description="İşaretlendiğinde görev, çizim incelemesi tamamlandıktan sonra otomatik tamamlanır"
            checked={values.auto_complete_design_task}
            onChange={(e) => set('auto_complete_design_task', e.currentTarget.checked)}
          />
        </Stack>
      </ModalSection>
    </FormModal>
  );
}

/** Legacy showSubtaskCompleteModal: complete a design subtask, with or without a release. */
export function SubtaskCompleteDialog({ task, onClose }: Props & { task: DepartmentTask }) {
  const { config, applyTask } = useDepartmentTasks();
  const blocked = !canSubmitNewDesignRelease(config, task);
  const [hasRelease, setHasRelease] = useState(false);
  const [values, setValues] = useState({
    folder_path: '',
    revision_code: '',
    hardcopy_count: '' as number | string,
    changelog: task.title || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (hasRelease) {
        const fresh = await getDepartmentTask(task.id);
        if (!fresh.job_order) return void notify.error('İş emri bulunamadı');
        if (!canSubmitNewDesignRelease(config, fresh)) {
          notify.warning(
            fresh.pending_approval_release_id
              ? 'Bu iş emri için zaten inceleme bekleyen bir yayın var.'
              : 'Reddedilmiş yayın var. Ana görevden yeniden gönderin.',
          );
          return;
        }
        const data: ReleaseInput = {
          job_order: fresh.job_order,
          folder_path: values.folder_path,
          changelog: values.changelog.trim(),
          revision_code: values.revision_code,
        };
        const copies = hardcopy(values.hardcopy_count);
        if (copies !== undefined) data.hardcopy_count = copies;
        if (!data.folder_path.trim()) return void notify.error('Klasör yolu gereklidir');
        await createRelease(data);
        const response = await completeDepartmentTask(task.id);
        notify.success('Yayın oluşturuldu ve görev tamamlandı');
        applyTask(response?.task);
      } else {
        const response = await completeDepartmentTask(task.id);
        notify.success('Görev tamamlandı');
        applyTask(response?.task);
      }
      onClose();
    } catch (error) {
      notify.error(
        legacyErrorText(
          error,
          hasRelease ? 'Yayın oluşturulurken hata oluştu' : 'Görev tamamlanırken hata oluştu',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Teknik Çizim Yayını Oluştur"
      icon="fas fa-file-export"
      onSubmit={() => void save()}
      submitting={busy}
    >
      <ModalSection title="Görevi Tamamla" icon="fas fa-check-circle">
        <Stack gap="sm">
          {blocked ? (
            <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />}>
              Bu iş emrinde reddedilmiş bir yayın var. Alt görev tamamlanabilir ancak yeni yayın
              oluşturulamaz.
            </Alert>
          ) : null}
          <Checkbox
            label="Yayın var mı?"
            disabled={blocked}
            description={
              blocked
                ? 'Yayın oluşturma bu iş emri için kapalı'
                : 'İşaretlendiğinde yayın bilgileri girilebilir'
            }
            checked={hasRelease}
            onChange={(e) => setHasRelease(e.currentTarget.checked)}
          />
        </Stack>
      </ModalSection>
      {hasRelease ? (
        <>
          <ModalSection title="Yayın Bilgileri" icon="fas fa-info-circle">
            <Stack gap="sm">
              <ReleaseFields task={task} values={values} set={set} folderRequired />
            </Stack>
          </ModalSection>
          <ModalSection title="Değişiklik Günlüğü" icon="fas fa-edit">
            <RichTextEditor
              label="Değişiklik Günlüğü"
              description="Değişiklik günlüğü (@mention ile kullanıcıları bildirebilirsiniz) - Opsiyonel"
              placeholder={CHANGELOG_PLACEHOLDER}
              value={values.changelog}
              onChange={(v) => set('changelog', v)}
            />
          </ModalSection>
        </>
      ) : null}
    </FormModal>
  );
}

/** Legacy showCompleteRevisionModal + completeRevisionModal save. */
export function CompleteRevisionDialog({ task, onClose }: Props & { task: DepartmentTask }) {
  const { refreshRow } = useDepartmentTasks();
  const [values, setValues] = useState({
    folder_path: '',
    revision_code: '',
    hardcopy_count: '' as number | string,
    changelog: '',
    topic_content: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) => setValues((v) => ({ ...v, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      const fresh = await getDepartmentTask(task.id);
      const releaseId = fresh.active_revision_release_id;
      if (!releaseId) return void notify.error('Aktif revizyon yayını bulunamadı');
      if (!values.folder_path.trim()) return void notify.error('Klasör yolu gereklidir');
      if (!values.revision_code.trim()) return void notify.error('Revizyon kodu gereklidir');
      if (!values.changelog.trim()) return void notify.error('Değişiklik günlüğü gereklidir');
      const copies = hardcopy(values.hardcopy_count);
      await completeRevision(releaseId, {
        folder_path: values.folder_path,
        revision_code: values.revision_code,
        changelog: values.changelog.trim(),
        ...(copies !== undefined ? { hardcopy_count: copies } : {}),
        ...(values.topic_content.trim() ? { topic_content: values.topic_content.trim() } : {}),
      });
      notify.success(
        'Revizyon tamamlandı ve yeni yayın incelemeye gönderildi. İş emri inceleme tamamlandıktan sonra devam edecektir.',
      );
      onClose();
      await refreshRow(task.id);
    } catch (error) {
      notify.error(legacyErrorText(error, 'Revizyon tamamlanırken hata oluştu'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Revizyonu Tamamla"
      icon="fas fa-check-circle"
      submitLabel="Tamamla"
      onSubmit={() => void save()}
      submitting={busy}
    >
      <ModalSection title="Revizyon Tamamlama" icon="fas fa-check-circle">
        <Stack gap="sm">
          <TextInput
            label="İş Emri"
            value={jobOrderLabel(task)}
            readOnly
            description="İş emri (değiştirilemez)"
          />
          <TextInput
            label="Klasör Yolu"
            withAsterisk
            placeholder={FOLDER_PLACEHOLDER}
            description="Ağ klasör yolu (maksimum 500 karakter)"
            maxLength={500}
            value={values.folder_path}
            onChange={(e) => set('folder_path', e.currentTarget.value)}
          />
          <TextInput
            label="Revizyon Kodu"
            withAsterisk
            placeholder="A1, B2, vb."
            description="Revizyon kodu (örn: A1, B2) - maksimum 10 karakter"
            maxLength={10}
            value={values.revision_code}
            onChange={(e) => set('revision_code', e.currentTarget.value)}
          />
          <NumberInput
            label="Hardcopy Sayısı"
            min={0}
            allowDecimal={false}
            placeholder="0"
            description="Hardcopy sayısı (opsiyonel)"
            value={values.hardcopy_count}
            onChange={(v) => set('hardcopy_count', v)}
          />
        </Stack>
      </ModalSection>
      <ModalSection title="Değişiklik Günlüğü" icon="fas fa-edit">
        <RichTextEditor
          label="Değişiklik Günlüğü"
          withAsterisk
          description="Değişiklik günlüğü (@mention destekli)"
          placeholder={'Değişiklikleri yazın...\n\n@mention ile kullanıcıları bildirebilirsiniz'}
          value={values.changelog}
          onChange={(v) => set('changelog', v)}
        />
      </ModalSection>
      <ModalSection title="Konu Mesajı (Opsiyonel)" icon="fas fa-comment-dots">
        <RichTextEditor
          label="Konu Mesajı"
          description="Opsiyonel"
          placeholder={
            'İlgilileri bilgilendirmek için mesaj yazın...\n\n@mention ile kullanıcıları etiketleyebilirsiniz'
          }
          value={values.topic_content}
          onChange={(v) => set('topic_content', v)}
        />
      </ModalSection>
    </FormModal>
  );
}

/** Legacy handleRejectReleaseFromTask + releaseApprovalRejectModal save. */
export function RejectReleaseDialog({
  releaseId,
  taskId,
  onClose,
}: Props & { releaseId: number; taskId: number }) {
  const { refreshRow, closeTask } = useDepartmentTasks();
  const reject = useRejectRelease();
  const [reason, setReason] = useState('');
  const save = async () => {
    if (!reason.trim()) return void notify.error('Reddetme nedeni gereklidir');
    try {
      await reject.mutateAsync({ id: releaseId, reason: reason.trim() });
      notify.success('Yayın reddedildi');
      onClose();
      await refreshRow(taskId);
      closeTask();
    } catch {
      notify.error('Yayın reddedilirken hata oluştu');
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      size="md"
      title="Yayını Reddet"
      icon="fas fa-times-circle"
      submitLabel="Reddet"
      onSubmit={() => void save()}
      submitting={reject.isPending}
    >
      <ModalSection title="Reddetme Nedeni" icon="fas fa-times-circle">
        <Textarea
          label="Reddetme Nedeni"
          withAsterisk
          rows={4}
          placeholder="Reddetme nedenini açıklayın..."
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
        />
      </ModalSection>
    </FormModal>
  );
}

/**
 * Legacy handleSelfStartRevisionFromTable: a confirm with a required reason.
 * An empty reason keeps it open; an API error closes it (legacy).
 */
export function SelfStartRevisionDialog({ task, onClose }: Props & { task: DepartmentTask }) {
  const { refreshRow } = useDepartmentTasks();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!reason.trim()) return void notify.error('Lütfen revizyon nedenini girin');
    setBusy(true);
    try {
      await selfStartRevision(task.current_release_id!, reason.trim());
      notify.success('Revizyon başlatıldı');
      void refreshRow(task.id);
    } catch (error) {
      notify.error(legacyErrorText(error, 'Revizyon başlatılırken hata oluştu'));
    } finally {
      setBusy(false);
      onClose();
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      size="md"
      title="Onay"
      icon="fas fa-rotate"
      submitLabel="Evet, Başlat"
      submitIcon="fas fa-rotate"
      onSubmit={() => void save()}
      submitting={busy}
    >
      <p style={{ marginTop: 0 }}>
        Bu yayın için revizyonu dış talep olmadan kendi başınıza başlatmak istediğinize emin
        misiniz?
      </p>
      <Textarea
        label="Revizyon Nedeni"
        withAsterisk
        rows={3}
        placeholder="Revizyon nedenini açıklayın..."
        description="Revizyon nedenini belirtmek zorunludur."
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
    </FormModal>
  );
}
