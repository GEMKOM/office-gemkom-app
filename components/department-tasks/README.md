# Department Tasks Component

Reusable department tasks page (filters, table, modals, expand/collapse, view/edit/add subtask, start/complete/skip). Used by design/projects, planning/projects, and procurement/projects.

## Usage

```js
import { initDepartmentTasksPage } from '../components/department-tasks/department-tasks.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initNavbar();
  await initDepartmentTasksPage({
    department: 'design',
    backUrl: '/design/',
    pageTitle: 'Dizayn Departmanı Görevleri',
    subtitle: 'Görevleri görüntüleyin, başlatın ve yönetin',
    userTeam: 'design'
  });
});
```

## Config

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `department` | string | yes | API department filter: `design`, `planning`, `procurement` |
| `backUrl` | string | yes | URL for back button |
| `pageTitle` | string | yes | Header title |
| `subtitle` | string | yes | Header subtitle |
| `userTeam` | string | no | Team filter for assigned-user list (e.g. `design`, `procurement`) |
| `containerIds` | object | no | Override container IDs: `header`, `filters`, `table` |
| `customFilters` | array | no | Extra filter definitions added after defaults |
| `customTableColumns` | array | no | Extra table columns (e.g. `{ insertAfter: 'sequence', columns: [...] }`) |
| `onBeforeLoadTasks` | async function | no | Called before each loadTasks() |
| `onAfterLoadTasks` | async function | no | Called after each loadTasks() |

## Page HTML

Pages must provide:

- `#header-placeholder`
- `#filters-placeholder`
- `#tasks-table-container`
- `#confirmation-modal-container`
- `#task-details-modal-container`
- `#edit-task-modal-container`
- `#add-subtask-modal-container`

Include the component CSS: `components/department-tasks/department-tasks.css`
