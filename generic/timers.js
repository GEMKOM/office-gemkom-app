import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

export async function fetchTimers(is_active = null, machine_id = null, issue_key = null, start_after = null) {
    let url = `${backendBase}/machining/timers/`;
    const params = [];
    
    if (is_active !== null) {
        params.push(`is_active=${is_active}`);
    }
    if (machine_id) {
        params.push(`machine_fk=${machine_id}`);
    }
    if (issue_key) {
        params.push(`issue_key=${issue_key}`);
    }
    if (start_after) {
        params.push(`start_after=${start_after}`);
    }
    
    if (params.length > 0) {
        url += `?${params.join('&')}`;
    }
    
    const res = await authedFetch(url);
    const responseData = await res.json();
    return responseData;
}

export async function fetchTimerById(timerId) {
    const res = await authedFetch(`${backendBase}/machining/timers/${timerId}/`);
    if (!res.ok) return null;
    const timer = await res.json();
    return timer;
}