import { MANUFACTURING_TASKS } from '@/pages/shared/department-tasks/config';
import { DepartmentTasksPage } from '@/pages/shared/department-tasks/DepartmentTasksPage';

/** Port of manufacturing/projects/ (initDepartmentTasksPage with department 'manufacturing'). */
export function ManufacturingProjectsPage() {
  return <DepartmentTasksPage config={MANUFACTURING_TASKS} />;
}
