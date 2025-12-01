import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

export async function fetchDailyEfficiencyReport(date = null) {
    let url = `${backendBase}/machining/reports/daily-efficiency/`;
    const queryParams = new URLSearchParams();

    if (date) {
        queryParams.append('date', date);
    }

    url += `?${queryParams.toString()}`;
    
    try {
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching daily efficiency report:', error);
        throw error;
    }
}

