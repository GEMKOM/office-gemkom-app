import { PROCUREMENT_TASKS } from '@/pages/shared/department-tasks/config';
import { DepartmentTasksPage } from '@/pages/shared/department-tasks/DepartmentTasksPage';

/** Port of procurement/projects/ (initDepartmentTasksPage with department 'procurement'). */
export function ProcurementProjectsPage() {
  return <DepartmentTasksPage config={PROCUREMENT_TASKS} />;
}
