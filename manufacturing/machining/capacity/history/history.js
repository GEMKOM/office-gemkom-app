// Machine Work History Module JavaScript

// Import navbar functionality
import { initNavbar } from '../../../../components/navbar.js';

// Initialize machine work history module
function initMachineHistory() {
    console.log('Machine work history module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Add any specific history functionality here
    console.log('Machine work history features will be implemented here');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initMachineHistory();
});
