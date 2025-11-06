import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

export async function fetchDailyUserReport(date = null) {
    let url = `${backendBase}/machining/reports/daily-user-report/`;
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
        console.error('Error fetching daily user report:', error);
        throw error;
    }
}