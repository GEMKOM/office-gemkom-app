import { DESIGN_TASKS } from '@/pages/shared/department-tasks/config';
import { DepartmentTasksPage } from '@/pages/shared/department-tasks/DepartmentTasksPage';

/** Port of design/projects/ (initDepartmentTasksPage with department 'design'). */
export function DesignProjectsPage() {
  return <DepartmentTasksPage config={DESIGN_TASKS} />;
}
