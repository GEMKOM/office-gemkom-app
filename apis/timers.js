import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

export async function fetchTimers(is_active = null, machine_id = null, issue_key = null, start_after = null, module = 'machining') {
    // Validate module parameter
    const validModules = ['machining', 'cnc_cutting'];
    const moduleName = validModules.includes(module) ? module : 'machining';
    
    let url = `${backendBase}/${moduleName}/timers/`;
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

export async function fetchTimerById(timerId, module = 'machining') {
    // Validate module parameter
    const validModules = ['machining', 'cnc_cutting'];
    const moduleName = validModules.includes(module) ? module : 'machining';
    
    const res = await authedFetch(`${backendBase}/${moduleName}/timers/${timerId}/`);
    if (!res.ok) return null;
    const timer = await res.json();
    return timer;
}

export async function stopTimer({ timerId, finishTime, module = 'machining' }) {
    // Validate module parameter
    const validModules = ['machining', 'cnc_cutting'];
    const moduleName = validModules.includes(module) ? module : 'machining';
    
    const response = await authedFetch(`${backendBase}/${moduleName}/timers/stop/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            timer_id: timerId,
            finish_time: finishTime,
        })
    });
    return response.ok;
}