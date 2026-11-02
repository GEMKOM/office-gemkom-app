import { LOGISTICS_TASKS } from '@/pages/shared/department-tasks/config';
import { DepartmentTasksPage } from '@/pages/shared/department-tasks/DepartmentTasksPage';

/** Port of logistics/projects/ (initDepartmentTasksPage with department 'logistics'). */
export function LogisticsProjectsPage() {
  return <DepartmentTasksPage config={LOGISTICS_TASKS} />;
}
