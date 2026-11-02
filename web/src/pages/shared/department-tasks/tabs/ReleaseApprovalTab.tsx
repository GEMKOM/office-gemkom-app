import { Alert, Badge, Button, Center, Group, Loader, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { drawingReleaseQueryOptions, useApproveRelease } from '@/api/projects/design';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import { confirm, FaIcon, notify } from '@/ui';
import { useDepartmentTasks } from '../context';
import classes from '../DepartmentTasks.module.css';
import { TabTitle } from './SimpleTabs';

/** Legacy renderReleaseApprovalTab + handleApproveReleaseFromTask / handleRejectReleaseFromTask. */
export function ReleaseApprovalTab({ task }: { task: DepartmentTask }) {
  const { openDialog, refreshRow, closeTask } = useDepartmentTasks();
  const releaseId = task.pending_approval_release_id;
  const query = useQuery({
    ...drawingReleaseQueryOptions(releaseId ?? 0),
    enabled: Boolean(releaseId),
  });
  const approve = useApproveRelease();

  if (!releaseId) return <Text c="dimmed">İnceleme bekleyen yayın bulunamadı.</Text>;
  if (query.isPending) {
    return (
      <Center py="lg">
        <Loader size="sm" />
      </Center>
    );
  }
  if (query.isError) return <Text c="red">İçerik yüklenirken hata oluştu</Text>;
  const release = query.data;
  const state = {
    ...(task.pending_release_approval_state ?? {}),
    ...((release.approval_state as Record<string, unknown> | null) ?? {}),
  } as { approval_count?: number; required_count?: number; has_lead_approval?: boolean };
  const approvals = (release.approvals ?? []).filter((a) => a.decision === 'approved');

  const onApprove = async () => {
    const ok = await confirm({
      message: 'Bu teknik çizim yayınını olumlu değerlendirmek istediğinize emin misiniz?',
      confirmLabel: 'Evet, Olumlu',
    });
    if (!ok) return;
    try {
      const response = await approve.mutateAsync(release.id);
      notify.success(response?.message || 'Değerlendirmeniz kaydedildi');
      await refreshRow(task.id);
      closeTask();
    } catch {
      notify.error('Değerlendirme kaydedilirken hata oluştu');
    }
  };

  return (
    <>
      <TabTitle icon="fas fa-search">Çizim İncelemesi</TabTitle>
      <Alert color="blue" mb="md">
        <strong>İnceleme İlerlemesi:</strong> {state.approval_count || 0}/
        {state.required_count || 2}
        <br />
        <strong>Kıdemli üye değerlendirmesi:</strong>{' '}
        {state.has_lead_approval ? (
          <Badge color="green">Alındı</Badge>
        ) : (
          <Badge color="yellow">Bekleniyor</Badge>
        )}
      </Alert>
      <Text mb="xs">
        <strong>Revizyon:</strong> {release.revision_code || release.revision_number}
      </Text>
      <Text mb="xs">
        <strong>Klasör:</strong> {release.folder_path || '-'}
      </Text>
      <Text fw={700}>Değişiklikler:</Text>
      <pre
        className={classes.pre}
        style={{ background: 'var(--gk-surface-subtle)', padding: 8, borderRadius: 6 }}
      >
        {release.changelog || '-'}
      </pre>
      <Text fw={700} mt="xs">
        Olumlu değerlendirenler:
      </Text>
      <ul>
        {approvals.length ? (
          approvals.map((a, i) => (
            <li key={i}>
              {a.approver_name} —{' '}
              {a.created_at ? new Date(a.created_at).toLocaleString('tr-TR') : ''}
            </li>
          ))
        ) : (
          <li className={classes.muted}>Henüz olumlu değerlendirme yok</li>
        )}
      </ul>
      {release.release_topic_id ? (
        <Button
          component="a"
          href={`/design/release-approvals/?release_id=${release.id}`}
          target="_blank"
          size="xs"
          variant="outline"
          leftSection={<FaIcon icon="fas fa-comments" />}
        >
          İncelemeyi Aç
        </Button>
      ) : null}
      {release.can_approve ? (
        <Group mt="md">
          <Button
            color="green"
            loading={approve.isPending}
            leftSection={<FaIcon icon="fas fa-check" />}
            onClick={() => void onApprove()}
          >
            Olumlu
          </Button>
          <Button
            color="red"
            leftSection={<FaIcon icon="fas fa-times" />}
            onClick={() =>
              openDialog({ kind: 'reject-release', releaseId: release.id, taskId: task.id })
            }
          >
            Reddet
          </Button>
        </Group>
      ) : (
        <Text c="dimmed" mt="md">
          Bu yayını değerlendirme yetkiniz yok veya zaten oy kullandınız.
        </Text>
      )}
    </>
  );
}
