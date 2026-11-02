import { PLANNING_TASKS } from '@/pages/shared/department-tasks/config';
import { DepartmentTasksPage } from '@/pages/shared/department-tasks/DepartmentTasksPage';

/** Port of planning/projects/ (initDepartmentTasksPage with department 'planning'). */
export function PlanningProjectsPage() {
  return <DepartmentTasksPage config={PLANNING_TASKS} />;
}
