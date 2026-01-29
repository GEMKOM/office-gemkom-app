import { initNavbar } from '../../../components/navbar.js';
import { initDepartmentTasksPage } from '../../../components/department-tasks/department-tasks.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    await initDepartmentTasksPage({
        department: 'planning',
        backUrl: '/planning/',
        pageTitle: 'Planlama Departmanı Görevleri',
        subtitle: 'Görevleri görüntüleyin, başlatın ve yönetin',
        userTeam: 'planning'
    });
});
