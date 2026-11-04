import { hasPerm } from '@/auth/authService';
import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthProvider';

// The page-level actions of Proje Takibi. The list page owns the modals behind
// them (edit, target date, hold, child job, department task, the planners);
// the detail modal and Sunum Modu call them through this context instead of
// reaching for globals (legacy window.editJobOrder & co).

export interface JobOrderActions {
  /** Opens the detail modal (legacy viewJobOrder). */
  view(jobNo: string, options?: { topicId?: number }): void;
  /** Closes the detail modal and opens the edit form (legacy editJobOrder). */
  edit(jobNo: string): void;
  reviseTargetDate(jobNo: string, currentDate: string | null | undefined): void;
  start(jobNo: string): Promise<void>;
  hold(jobNo: string): void;
  resume(jobNo: string): Promise<void>;
  cancel(jobNo: string): Promise<void>;
  recalculateProgress(jobNo: string): Promise<void>;
  createChild(parentJobNo: string): void;
  openTaskPlanner(jobNo: string): void;
  openWeightPlanner(jobNo: string): void;
  /** "Aksiyonları Gizle": hides every action except opening the detail view. */
  hideActions: boolean;
}

const JobOrderActionsContext = createContext<JobOrderActions | null>(null);

export function JobOrderActionsProvider({
  value,
  children,
}: {
  value: JobOrderActions;
  children: ReactNode;
}) {
  return <JobOrderActionsContext.Provider value={value}>{children}</JobOrderActionsContext.Provider>;
}

export function useJobOrderActions(): JobOrderActions {
  const value = useContext(JobOrderActionsContext);
  if (!value) throw new Error('useJobOrderActions must be used inside <JobOrderActionsProvider>');
  return value;
}

export interface JobOrderPermissions {
  /** Legacy canEditJobOrders: the planlama group or an admin. */
  canEdit: boolean;
  /** Legacy canViewSubcontracting: planlama, yonetim or an admin (Fiyat ve Ağırlık tab). */
  canViewSubcontracting: boolean;
  /** Legacy canViewEstimates: an admin or `view_estimates` (Tahmin tab). */
  canViewEstimates: boolean;
}

export function useJobOrderPermissions(): JobOrderPermissions {
  const { user, isAdmin } = useAuth();
  const groups: string[] = Array.isArray(user.user_groups) ? (user.user_groups as string[]) : [];
  return {
    canEdit: isAdmin || groups.includes('planlama'),
    canViewSubcontracting: isAdmin || groups.includes('planlama') || groups.includes('yonetim'),
    canViewEstimates: isAdmin || Boolean(hasPerm('view_estimates')),
  };
}
