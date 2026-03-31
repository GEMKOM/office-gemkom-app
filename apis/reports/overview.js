import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const REPORTS_BASE_URL = `${backendBase}/reports`;

function buildOverviewQuery({ preset = null, date_from = null, date_to = null, compare = null } = {}) {
    // Rules:
    // - preset takes priority over date_from/date_to
    // - If nothing is provided, defaults to current_month
    // - Custom range requires both date_from and date_to
    // - If date_from > date_to, swap
    const qs = new URLSearchParams();

    if (preset) {
        qs.set('preset', preset);
        if (compare === true) qs.set('compare', 'true');
        return qs;
    }

    const hasFrom = !!date_from;
    const hasTo = !!date_to;

    if (hasFrom || hasTo) {
        if (!hasFrom || !hasTo) {
            throw new Error('Custom range için date_from ve date_to birlikte gönderilmelidir');
        }

        let from = String(date_from);
        let to = String(date_to);
        if (from > to) {
            const tmp = from;
            from = to;
            to = tmp;
        }
        qs.set('date_from', from);
        qs.set('date_to', to);
        if (compare === true) qs.set('compare', 'true');
        return qs;
    }

    qs.set('preset', 'current_month');
    if (compare === true) qs.set('compare', 'true');
    return qs;
}

export async function getReportsOverview(params = {}) {
    const qs = buildOverviewQuery(params);
    const url = `${REPORTS_BASE_URL}/overview/${qs.toString() ? `?${qs.toString()}` : ''}`;

    const resp = await authedFetch(url, { method: 'GET' });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Dashboard verileri yüklenirken hata oluştu');
    }
    return await resp.json();
}

