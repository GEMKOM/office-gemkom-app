import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const REPORTS_BASE_URL = `${backendBase}/reports`;

function buildOverviewQuery({ preset = null, date_from = null, date_to = null, compare = null } = {}) {
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

export async function fetchOverviewSlice(pathSegment, params = {}) {
    const qs = buildOverviewQuery(params);
    const qsStr = qs.toString();
    const url = `${REPORTS_BASE_URL}/overview/${pathSegment}/${qsStr ? `?${qsStr}` : ''}`;
    const resp = await authedFetch(url, { method: 'GET' });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Dashboard verileri yüklenirken hata oluştu');
    }
    return await resp.json();
}

function pickKeyedPayload(raw, key) {
    if (!raw || typeof raw !== 'object') return {};
    if (key in raw && raw[key] != null && typeof raw[key] === 'object') return raw[key];
    return raw;
}

function mergeObjects(a, b) {
    return { ...(a && typeof a === 'object' ? a : {}), ...(b && typeof b === 'object' ? b : {}) };
}

/**
 * Merges split overview API responses into the shape expected by the Genel Bakış UI.
 * Missing arguments are treated as empty (undefined) slices.
 */
export function mergeOverviewResponses(operations, subcontracting, procurement, sales, jobOrders) {
    const sub = pickKeyedPayload(subcontracting, 'subcontracting');
    const proc = pickKeyedPayload(procurement, 'procurement');

    const manufacturing = mergeObjects(jobOrders?.manufacturing, operations?.manufacturing);
    const maintenance = mergeObjects(jobOrders?.maintenance, operations?.maintenance);
    const overtime = mergeObjects(jobOrders?.overtime, operations?.overtime);

    const ppOps = operations?.previous_period || {};
    const ppSales = sales?.previous_period || {};
    const ppSub = subcontracting?.previous_period || {};
    const ppProc = procurement?.previous_period || {};
    const ppJobs = jobOrders?.previous_period || {};

    const previous_period = {
        manufacturing: mergeObjects(ppJobs.manufacturing, ppOps.manufacturing),
        maintenance: mergeObjects(ppJobs.maintenance, ppOps.maintenance),
        overtime: mergeObjects(ppJobs.overtime, ppOps.overtime),
        sales: ppSales.sales,
        costs: ppSales.costs,
        subcontracting: ppSub.subcontracting ?? ppSub,
        procurement: ppProc.procurement ?? ppProc,
        quality: ppJobs.quality ?? ppOps.quality
    };

    const quality = jobOrders?.quality ?? operations?.quality ?? {};

    const jobOrdersMetrics = jobOrders?.job_orders;
    const jobOrdersCosts = jobOrders?.costs;

    return {
        meta: operations?.meta ?? sales?.meta ?? jobOrders?.meta ?? {},
        manufacturing,
        maintenance,
        overtime,
        sales: sales?.sales,
        costs: sales?.costs ?? jobOrdersCosts,
        subcontracting: sub,
        procurement: proc,
        quality,
        job_orders: jobOrdersMetrics && typeof jobOrdersMetrics === 'object' ? jobOrdersMetrics : {},
        job_orders_costs: jobOrdersCosts && typeof jobOrdersCosts === 'object' ? jobOrdersCosts : undefined,
        previous_period
    };
}
