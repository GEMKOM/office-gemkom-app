import { useMemo } from 'react';
import { getDrawingRelease } from '@/api/projects/design';
import {
  completeDepartmentTask,
  countCncParts,
  countMachiningParts,
  deleteDepartmentTask,
  getDepartmentTask,
  skipDepartmentTask,
  startDepartmentTask,
  uncompleteDepartmentTask,
  unskipDepartmentTask,
  type DepartmentTask,
} from '@/api/projects/departmentTasks';
import { confirm, notify } from '@/ui';
import { useDepartmentTasks, type DepartmentTasksContextValue } from './context';
import { approvalProgress, legacyErrorText } from './logic';

/**
 * The task actions both the table rows and the modal tabs run (legacy
 * handleStartTask, handleCompleteTask, handleSkipTask...). Each resolves true
 * when the action went through.
 */
export function useTaskActions() {
  const ctx = useDepartmentTasks();
  return useMemo(() => taskActions(ctx), [ctx]);
}

export function taskActions(ctx: DepartmentTasksContextValue) {
  const { config, applyTask, refreshRow, reloadList, closeTask, openDialog } = ctx;

  async function start(id: number): Promise<boolean> {
    if (!(await confirm({ message: 'Bu görevi başlatmak istediğinize emin misiniz?', confirmLabel: 'Evet, Başlat' }))) {
      return false;
    }
    try {
      const response = await startDepartmentTask(id);
      notify.success('Görev başlatıldı');
      // Legacy left the row as it was; the port refreshes just that row.
      if (response?.task) applyTask(response.task);
      else await refreshRow(id);
      return true;
    } catch (error) {
      notify.error(legacyErrorText(error, 'Görev başlatılırken hata oluştu'));
      return false;
    }
  }

  async function standardComplete(id: number): Promise<boolean> {
    if (!(await confirm({ message: 'Bu görevi tamamlamak istediğinize emin misiniz?', confirmLabel: 'Evet, Tamamla' }))) {
      return false;
    }
    try {
      const response = await completeDepartmentTask(id);
      notify.success('Görev tamamlandı');
      applyTask(response?.task);
      return true;
    } catch (error) {
      notify.error(legacyErrorText(error, 'Görev tamamlanırken hata oluştu'));
      return false;
    }
  }

  /** Legacy handleCompleteTask: picks the completion flow for the row. */
  async function complete(row: DepartmentTask): Promise<void> {
    if (row.task_type === 'procurement_item' && row.planning_request_item_id) {
      openDialog({ kind: 'delivery', task: row });
      return;
    }
    if (config.releaseFlow) {
      if (row.parent) {
        // showSubtaskCompleteModal fetched the task first.
        try {
          const task = await getDepartmentTask(row.id);
          if (!task.job_order) {
            notify.error('İş emri bulunamadı');
            return;
          }
          if (task.pending_approval_release_id) {
            notify.warning(
              `Bu iş emri için inceleme bekleyen bir yayın var (${approvalProgress(task)}). Yeni yayın oluşturulamaz.`,
            );
            return;
          }
          openDialog({ kind: 'subtask-complete', task });
        } catch {
          notify.error('Görev bilgileri yüklenirken hata oluştu');
        }
      } else if (!row.job_order) {
        // Standalone design task: no drawing to release.
        await standardComplete(row.id);
      } else if (row.pending_approval_release_id) {
        notify.warning(
          `Yayın inceleme bekliyor (${approvalProgress(row)}). Tasarım ekibi değerlendirmesini tamamlayana kadar görev tamamlanamaz.`,
        );
      } else if (row.rejected_release_id) {
        await openResubmit(row);
      } else if (row.is_under_revision) {
        await openCompleteRevision(row.id);
      } else {
        await openCreateRelease(row.id);
      }
      return;
    }
    const isMfgMain = Boolean(row.is_manufacturing_main || (row.department === 'manufacturing' && !row.parent));
    if (isMfgMain) {
      let codes = row.erp_product_codes;
      if (codes === undefined) {
        try {
          codes = (await getDepartmentTask(row.id)).erp_product_codes || '';
        } catch {
          codes = '';
        }
      }
      openDialog({ kind: 'erp', taskId: row.id, codes: (codes || '').trim() });
      return;
    }
    await standardComplete(row.id);
  }

  async function openCreateRelease(id: number): Promise<void> {
    try {
      const task = await getDepartmentTask(id);
      if (!task.job_order) {
        notify.error('İş emri bulunamadı');
        return;
      }
      if (task.pending_approval_release_id) {
        notify.warning(`Zaten inceleme bekleyen bir yayın var (${approvalProgress(task)})`);
        return;
      }
      openDialog({ kind: 'release', task });
    } catch {
      notify.error('Görev bilgileri yüklenirken hata oluştu');
    }
  }

  async function openResubmit(row: DepartmentTask): Promise<void> {
    if (!row.rejected_release_id) {
      notify.error('Reddedilmiş yayın bulunamadı');
      return;
    }
    try {
      const release = await getDrawingRelease(row.rejected_release_id);
      const task = await getDepartmentTask(row.id);
      if (!task.job_order) {
        notify.error('İş emri bulunamadı');
        return;
      }
      openDialog({ kind: 'release', task, resubmit: { releaseId: row.rejected_release_id, release } });
    } catch {
      notify.error('Yeniden gönderme formu açılırken hata oluştu');
    }
  }

  async function openCompleteRevision(id: number): Promise<void> {
    try {
      const task = await getDepartmentTask(id);
      if (!task.job_order) return void notify.error('İş emri bulunamadı');
      if (!task.is_under_revision) return void notify.error('Bu görev revizyonda değil');
      if (!task.active_revision_release_id) return void notify.error('Aktif revizyon yayını bulunamadı');
      openDialog({ kind: 'complete-revision', task });
    } catch {
      notify.error('Revizyon tamamlama modalı açılırken hata oluştu');
    }
  }

  async function uncomplete(id: number): Promise<boolean> {
    if (
      !(await confirm({
        message: 'Bu görevin tamamlanma durumunu geri almak istediğinize emin misiniz?',
        confirmLabel: 'Evet, Geri Al',
      }))
    ) {
      return false;
    }
    try {
      const response = await uncompleteDepartmentTask(id);
      notify.success('Görev tamamlanma durumu geri alındı');
      applyTask(response?.task);
      return true;
    } catch (error) {
      notify.error(legacyErrorText(error, 'Görev tamamlanma durumu geri alınırken hata oluştu'));
      return false;
    }
  }

  async function skip(id: number): Promise<boolean> {
    if (!(await confirm({ message: 'Bu görevi atlamak istediğinize emin misiniz?', confirmLabel: 'Evet, Atla' }))) {
      return false;
    }
    try {
      const response = await skipDepartmentTask(id);
      notify.success('Görev atlandı');
      applyTask(response?.task);
      return true;
    } catch (error) {
      notify.error(legacyErrorText(error, 'Görev atlanırken hata oluştu'));
      return false;
    }
  }

  async function unskip(id: number): Promise<boolean> {
    if (
      !(await confirm({
        message: 'Bu görevin atlama durumunu geri almak istediğinize emin misiniz?',
        confirmLabel: 'Evet, Geri Al',
      }))
    ) {
      return false;
    }
    try {
      const response = await unskipDepartmentTask(id);
      notify.success('Görev atlama durumu geri alındı');
      applyTask(response?.task);
      return true;
    } catch (error) {
      notify.error(legacyErrorText(error, 'Görev atlama durumu geri alınırken hata oluştu'));
      return false;
    }
  }

  /** Legacy handleDeleteDepartmentTask: eligibility first, then the confirm. */
  async function remove(id: number): Promise<void> {
    let task: DepartmentTask;
    try {
      task = await getDepartmentTask(id);
      if ((task.subtasks_count || 0) > 0) {
        notify.warning('Alt görevi olan görev silinemez.');
        return;
      }
      if (task.type === 'cnc_part' && (await countCncParts(task.job_order)) > 0) {
        notify.warning('Bu iş emrine bağlı CNC parça(lar) var. Silmeden önce CNC parçaları silin.');
        return;
      }
      if (task.type === 'machining_part' && (await countMachiningParts(task.job_order)) > 0) {
        notify.warning('Bu iş emrine bağlı talaşlı parça(lar) var. Silmeden önce parçaları silin.');
        return;
      }
    } catch (error) {
      notify.error(error, { fallback: 'Silme kontrolü sırasında hata oluştu' });
      return;
    }
    const ok = await confirm({
      title: 'Görevi Sil',
      message: 'Bu alt görevi silmek istediğinize emin misiniz?',
      details: task.title || `#${task.id}`,
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDepartmentTask(id);
      notify.success('Görev silindi');
      await reloadList();
      closeTask();
    } catch (error) {
      notify.error(error, { fallback: 'Görev silinirken hata oluştu' });
    }
  }

  return { start, complete, uncomplete, skip, unskip, remove, standardComplete };
}
