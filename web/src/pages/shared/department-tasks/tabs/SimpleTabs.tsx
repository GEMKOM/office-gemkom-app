import { Alert, Button, Stack, Textarea, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { selfStartRevision } from '@/api/projects/design';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import { FaIcon, notify } from '@/ui';
import { useTaskActions } from '../actions';
import { useDepartmentTasks } from '../context';
import { isPotentiallyDeletable, legacyErrorText } from '../logic';

export function TabTitle({ icon, children }: { icon: string; children: string }) {
  return (
    <Title order={5} mb="md">
      <FaIcon icon={icon} style={{ marginRight: 8 }} />
      {children}
    </Title>
  );
}

const ACTION_TABS = {
  start: {
    title: 'Görevi Başlat',
    icon: 'fas fa-play',
    color: 'blue',
    alertIcon: 'fas fa-info-circle',
    message: 'Bu görevi başlatmak istediğinize emin misiniz?',
    button: 'Görevi Başlat',
    buttonColor: 'green',
  },
  uncomplete: {
    title: 'Tamamlanmayı Geri Al',
    icon: 'fas fa-undo',
    color: 'yellow',
    alertIcon: 'fas fa-exclamation-triangle',
    message: 'Bu görevin tamamlanmasını geri almak istediğinize emin misiniz?',
    button: 'Tamamlanmayı Geri Al',
    buttonColor: 'yellow',
  },
  unskip: {
    title: 'Atlamayı Geri Al',
    icon: 'fas fa-undo',
    color: 'blue',
    alertIcon: 'fas fa-info-circle',
    message: 'Bu görevin atlanmasını geri almak istediğinize emin misiniz?',
    button: 'Atlamayı Geri Al',
    buttonColor: 'yellow',
  },
} as const;

/**
 * Başlat / Tamamlanmayı Geri Al / Atlamayı Geri Al. Legacy closed the task
 * modal as soon as the button was pressed and asked in a confirm.
 */
export function ActionTab({
  kind,
  task,
}: {
  kind: keyof typeof ACTION_TABS;
  task: DepartmentTask;
}) {
  const { closeTask } = useDepartmentTasks();
  const actions = useTaskActions();
  const copy = ACTION_TABS[kind];
  const run = () => {
    closeTask();
    if (kind === 'start') void actions.start(task.id);
    else if (kind === 'uncomplete') void actions.uncomplete(task.id);
    else void actions.unskip(task.id);
  };
  return (
    <>
      <TabTitle icon={copy.icon}>{copy.title}</TabTitle>
      <Alert color={copy.color} icon={<FaIcon icon={copy.alertIcon} />} mb="md">
        {copy.message}
      </Alert>
      <Button color={copy.buttonColor} leftSection={<FaIcon icon={copy.icon} />} onClick={run}>
        {copy.button}
      </Button>
    </>
  );
}

export function DeleteTab({ task }: { task: DepartmentTask }) {
  const actions = useTaskActions();
  const allowed = isPotentiallyDeletable(task);
  return (
    <>
      <TabTitle icon="fas fa-trash">Görevi Sil</TabTitle>
      <Alert color="yellow" icon={<FaIcon icon="fas fa-exclamation-triangle" />} mb="md">
        {allowed
          ? 'Silme işlemi geri alınamaz. Silme koşulları kontrol edilecektir.'
          : 'Bu görev silme koşullarını sağlamıyor (sadece belirli alt görevler silinebilir).'}
      </Alert>
      <Button
        color="red"
        disabled={!allowed}
        leftSection={<FaIcon icon="fas fa-trash" />}
        onClick={() => void actions.remove(task.id)}
      >
        Sil
      </Button>
    </>
  );
}

export function jobOrderLabel(task: DepartmentTask): string {
  return task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-';
}

export function SelfStartRevisionTab({ task }: { task: DepartmentTask }) {
  const { closeTask, refreshRow } = useDepartmentTasks();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!task.current_release_id) return void notify.error('Mevcut yayın bulunamadı');
    if (!reason.trim()) return void notify.error('Lütfen revizyon nedenini girin');
    setBusy(true);
    try {
      await selfStartRevision(task.current_release_id, reason.trim());
      notify.success('Revizyon başlatıldı');
      closeTask();
      void refreshRow(task.id);
    } catch (error) {
      notify.error(legacyErrorText(error, 'Revizyon başlatılırken hata oluştu'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack gap="sm">
      <TabTitle icon="fas fa-rotate">Revizyonu Kendi Başlat</TabTitle>
      <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />}>
        Bu yayın için revizyonu dış talep olmadan kendi başınıza başlatmak istediğinize emin
        misiniz?
      </Alert>
      <TextInput label="İş Emri" value={jobOrderLabel(task)} readOnly />
      <TextInput label="Görev" value={task.title || '-'} readOnly />
      <Textarea
        label="Revizyon Nedeni"
        withAsterisk
        rows={3}
        placeholder="Revizyon nedenini açıklayın..."
        description="Revizyon nedenini belirtmek zorunludur."
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
      <div>
        <Button
          loading={busy}
          leftSection={<FaIcon icon="fas fa-rotate" />}
          onClick={() => void submit()}
        >
          Revizyonu Başlat
        </Button>
      </div>
    </Stack>
  );
}
