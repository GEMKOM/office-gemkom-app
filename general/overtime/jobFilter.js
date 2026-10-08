// İş No multi-select shared by the overtime report pages (cost report,
// machining report).
//
// Options are each project number (the part before the first dash, e.g.
// RM269 — not itself a job order) followed by its top-level job orders, so
// typing "RM269" shows a handful of rows instead of every sub-job. The backend
// matches every pick as a prefix (overtime/services/job_filter.py), so RM269-06
// also covers RM269-06-04.
import { getJobOrderDropdown } from '../../apis/projects/jobOrders.js';

export function buildJobOptions(jobOrders) {
    const projects = new Map();
    jobOrders.forEach(j => {
        const project = String(j.job_no).split('-')[0];
        if (!projects.has(project)) projects.set(project, []);
        projects.get(project).push(j);
    });

    const options = [];
    projects.forEach((jobs, project) => {
        const exact = jobs.find(j => j.job_no === project);
        if (!exact || jobs.length > 1) {
            const customer = jobs.map(j => j.customer_name).find(Boolean);
            const extra = [`tüm işler (${jobs.length} iş emri)`, customer].filter(Boolean).join(' · ');
            options.push({ value: project, label: `${project} — ${extra}` });
        }
        jobs.filter(j => j !== exact || jobs.length === 1).forEach(j => {
            const extra = [j.title, j.customer_name].filter(Boolean).join(' · ');
            options.push({ value: j.job_no, label: extra ? `${j.job_no} - ${extra}` : j.job_no });
        });
    });
    return options;
}

// Overtime is historical, so completed/cancelled job orders must be pickable
// too. Top-level only (827 -> ~160 rows); sub-jobs come in through the prefix.
export function loadJobOrderOptions() {
    return getJobOrderDropdown(true, { withCustomer: true, rootOnly: true })
        .then(rows => buildJobOptions(rows || []));
}

// Adds the İş No filter, falling back to a comma-separated text field when the
// job list cannot be loaded. Pass the promise from loadJobOrderOptions() so the
// request runs while the other filters are being added.
export async function addJobFilter(filters, optionsPromise, colSize = 3) {
    try {
        const options = await optionsPromise;
        filters.addDropdownFilter({
            id: 'job_no', label: 'İş No (alt işler dahil)', options, placeholder: 'Tümü',
            searchable: true, multiple: true, colSize,
        });
    } catch (e) {
        console.warn('İş emri listesi yüklenemedi:', e);
        filters.addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş emri no (virgülle birden fazla)...', colSize });
    }
}

// Multi-select yields an array, the text fallback a string; empty → omitted.
export function jobFilterValue(value) {
    if (Array.isArray(value)) return value.length ? value : undefined;
    return value || undefined;
}
