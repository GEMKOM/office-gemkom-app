// Finance Module JavaScript
import { initNavbar } from '../components/navbar.js';

// Initialize the finance module
document.addEventListener('DOMContentLoaded', function() {
    // Initialize navbar
    initNavbar();
    
    // Add any finance-specific functionality here
    console.log('Finance module initialized');
});

// Export for potential use in other modules
export function initFinance() {
    console.log('Finance module functions available');
}
