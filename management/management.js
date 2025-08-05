import { guardRoute} from '../authService.js';
import { initNavbar } from '../components/navbar.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    initNavbar();   

}); 