import { useDepartmentTasks, type TaskDialog } from '../context';
import {
  CreateTaskDialog,
  DeliveryDialog,
  EditInternalTeamDialog,
  EditSubcontractingDialog,
  ErpDialog,
  QcExcelDialog,
  SiblingDialog,
} from './OtherDialogs';
import {
  CompleteRevisionDialog,
  RejectReleaseDialog,
  ReleaseDialog,
  SelfStartRevisionDialog,
  SubtaskCompleteDialog,
} from './ReleaseDialogs';

/** The one dialog open over the page or the task modal. */
export function TaskDialogs({ dialog }: { dialog: TaskDialog | null }) {
  const { closeDialog: onClose } = useDepartmentTasks();
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'create-task':
      return <CreateTaskDialog onClose={onClose} />;
    case 'release':
      return <ReleaseDialog task={dialog.task} resubmit={dialog.resubmit} onClose={onClose} />;
    case 'subtask-complete':
      return <SubtaskCompleteDialog task={dialog.task} onClose={onClose} />;
    case 'complete-revision':
      return <CompleteRevisionDialog task={dialog.task} onClose={onClose} />;
    case 'reject-release':
      return (
        <RejectReleaseDialog
          releaseId={dialog.releaseId}
          taskId={dialog.taskId}
          onClose={onClose}
        />
      );
    case 'self-start':
      return <SelfStartRevisionDialog task={dialog.task} onClose={onClose} />;
    case 'erp':
      return <ErpDialog taskId={dialog.taskId} codes={dialog.codes} onClose={onClose} />;
    case 'delivery':
      return <DeliveryDialog task={dialog.task} onClose={onClose} />;
    case 'edit-subcontracting':
      return (
        <EditSubcontractingDialog
          task={dialog.task}
          assignment={dialog.assignment}
          onClose={onClose}
        />
      );
    case 'edit-internal-team':
      return (
        <EditInternalTeamDialog
          task={dialog.task}
          assignment={dialog.assignment}
          onClose={onClose}
        />
      );
    case 'sibling':
      return <SiblingDialog taskId={dialog.taskId} onClose={onClose} />;
    case 'qc-excel':
      return <QcExcelDialog onImport={dialog.onImport} onClose={onClose} />;
  }
}
