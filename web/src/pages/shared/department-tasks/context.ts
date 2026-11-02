import { createContext, useContext } from 'react';
import type { DrawingRelease } from '@/api/projects/design';
import type { DepartmentTask, StatusChoice } from '@/api/projects/departmentTasks';
import type { SubcontractingAssignment } from '@/api/subcontracting/assignments';
import type { InternalTeamAssignment } from '@/api/welding/internalTeamAssignments';
import type { DepartmentTasksConfig } from './config';
import type { QcReviewDraft } from './logic';

export interface TaskUser {
  id: number;
  username: string;
  /** full_name, as legacy read it (`name`). */
  name: string;
}

/** The dialogs that open over the page (legacy kept one modal instance each). */
export type TaskDialog =
  | { kind: 'create-task' }
  | { kind: 'release'; task: DepartmentTask; resubmit?: { releaseId: number; release: DrawingRelease } }
  | { kind: 'subtask-complete'; task: DepartmentTask }
  | { kind: 'complete-revision'; task: DepartmentTask }
  | { kind: 'reject-release'; releaseId: number; taskId: number }
  | { kind: 'erp'; taskId: number; codes: string }
  | { kind: 'delivery'; task: DepartmentTask }
  | { kind: 'self-start'; task: DepartmentTask }
  | { kind: 'edit-subcontracting'; task: DepartmentTask; assignment: SubcontractingAssignment }
  | { kind: 'edit-internal-team'; task: DepartmentTask; assignment: InternalTeamAssignment }
  | { kind: 'sibling'; taskId: number }
  | { kind: 'qc-excel'; onImport: (reviews: QcReviewDraft[]) => void };

export interface DepartmentTasksContextValue {
  config: DepartmentTasksConfig;
  users: TaskUser[];
  statuses: StatusChoice[];
  /** Opens the task modal (?task=<id>). */
  openTask: (id: number) => void;
  closeTask: () => void;
  openDialog: (dialog: TaskDialog) => void;
  closeDialog: () => void;
  /** Legacy loadTasks(): refetch the list, expanded rows collapse. */
  reloadList: () => Promise<void>;
  /** Refetch one task and swap it into the rows (and the open modal). */
  refreshRow: (id: number) => Promise<DepartmentTask | null>;
  /** Swap a task the API returned into the rows. */
  applyTask: (task: DepartmentTask | undefined | null) => void;
  /** Subtasks of an expanded row, when loaded (legacy subtasksCache). */
  cachedSubtasks: (id: number) => DepartmentTask[] | undefined;
  /** After creating subtasks: refresh the parent's children and its row. */
  subtasksChanged: (parentId: number) => Promise<void>;
}

export const DepartmentTasksContext = createContext<DepartmentTasksContextValue | null>(null);

export function useDepartmentTasks(): DepartmentTasksContextValue {
  const value = useContext(DepartmentTasksContext);
  if (!value) throw new Error('useDepartmentTasks outside DepartmentTasksPage');
  return value;
}
