import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * Cost Table API Service
 * GET /projects/job-orders/cost_table/
 * Main overview table showing all job orders with their full cost breakdown.
 */

/**
 * Fetch the cost table (paginated list of job orders with cost breakdown)
 * @param {Object} options - Query parameters (same as job order list)
 * @param {string} [options.status] - Filter by job status (e.g. active, draft)
 * @param {string} [options.status__in] - Multiple statuses comma-separated (e.g. active,draft)
 * @param {number} [options.customer] - Filter by customer ID
 * @param {string} [options.search] - Search in title / job_no
 * @param {string} [options.ordering] - Order by any field (e.g. -actual_total_cost, job_no)
 * @param {number} [options.page] - Page number
 * @param {number} [options.page_size] - Page size
 * @returns {Promise<{ count: number, next: string|null, previous: string|null, results: Array }>}
 */
export async function getCostTable(options = {}) {
    const queryParams = new URLSearchParams();

    if (options.status != null && options.status !== '') {
        queryParams.append('status', options.status);
    }
    if (options.status__in != null && options.status__in !== '') {
        queryParams.append('status__in', options.status__in);
    }
    if (options.customer != null && options.customer !== '') {
        queryParams.append('customer', String(options.customer));
    }
    if (options.search != null && options.search !== '') {
        queryParams.append('search', options.search);
    }
    if (options.ordering != null && options.ordering !== '') {
        queryParams.append('ordering', options.ordering);
    }
    if (options.page != null) {
        queryParams.append('page', String(options.page));
    }
    if (options.page_size != null) {
        queryParams.append('page_size', String(options.page_size));
    }

    const url = `${backendBase}/projects/job-orders/cost_table/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await authedFetch(url);

    if (!response.ok) {
        throw new Error(`Cost table request failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Fetch direct cost children of a job order (for hierarchical cost table).
 * GET /projects/job-orders/{job_no}/cost_children/
 * No pagination; each child includes has_children for nested expand.
 * @param {string} jobNo - Parent job order number (e.g. "094-174")
 * @returns {Promise<Array<{ job_no: string, has_children: boolean, ... }>>} Direct children with cost fields and has_children
 */
export async function getCostChildren(jobNo) {
    const url = `${backendBase}/projects/job-orders/${encodeURIComponent(jobNo)}/cost_children/`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Cost children request failed: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.results != null ? data.results : []);
}

/** Valid values for selling_price_currency */
export const COST_SUMMARY_CURRENCIES = ['EUR', 'USD', 'GBP', 'TRY'];

/**
 * Cost Summary for a single job order
 * GET /projects/job-orders/{job_no}/cost_summary/
 * @param {string} jobNo - Job order number (e.g. "254-01")
 * @returns {Promise<{
 *   job_order: string,
 *   labor_cost: string,
 *   material_cost: string,
 *   subcontractor_cost: string,
 *   paint_cost: string,
 *   qc_cost: string,
 *   shipping_cost: string,
 *   actual_total_cost: string,
 *   selling_price: string,
 *   selling_price_currency: string,
 *   last_updated: string
 * }>}
 */
export async function getJobCostSummary(jobNo) {
    const url = `${backendBase}/projects/job-orders/${encodeURIComponent(jobNo)}/cost_summary/`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Cost summary request failed: ${response.status}`);
    }
    return response.json();
}

/**
 * Update cost summary (only selling_price and selling_price_currency are writable)
 * PATCH /projects/job-orders/{job_no}/cost_summary/
 * @param {string} jobNo - Job order number
 * @param {Object} payload
 * @param {string} [payload.selling_price] - e.g. "90000.00"
 * @param {string} [payload.selling_price_currency] - One of "EUR", "USD", "GBP", "TRY"
 * @returns {Promise<Object>} Full updated cost summary object
 */
export async function patchJobCostSummary(jobNo, payload) {
    const validKeys = ['selling_price', 'selling_price_currency'];
    const body = {};
    if (payload.selling_price !== undefined) body.selling_price = payload.selling_price;
    if (payload.selling_price_currency !== undefined) {
        if (!COST_SUMMARY_CURRENCIES.includes(payload.selling_price_currency)) {
            throw new Error(`Invalid selling_price_currency. Valid values: ${COST_SUMMARY_CURRENCIES.join(', ')}`);
        }
        body.selling_price_currency = payload.selling_price_currency;
    }
    const url = `${backendBase}/projects/job-orders/${encodeURIComponent(jobNo)}/cost_summary/`;
    const response = await authedFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const text = await response.text();
        let errMsg = `Cost summary update failed: ${response.status}`;
        try {
            const data = JSON.parse(text);
            if (data && typeof data === 'object' && Object.keys(data).length) errMsg = JSON.stringify(data);
        } catch (_) {
            if (text) errMsg = text;
        }
        throw new Error(errMsg);
    }
    return response.json();
}

// ─── Procurement (Material Cost) Lines ─────────────────────────────────────

/**
 * Job orders pending procurement submission (zero saved procurement lines, excluding cancelled).
 * GET /api/projects/job-orders/procurement_pending/
 * Same response shape as standard job order list (job_no, title, customer_name, status, target_completion_date, etc.).
 * @param {Object} options - Query parameters
 * @param {string} [options.status] - e.g. active
 * @param {string} [options.search] - Search in job_no, title, etc.
 * @param {number} [options.customer] - Customer ID
 * @param {string} [options.ordering] - e.g. job_no, -target_completion_date
 * @param {number} [options.page] - Page number
 * @param {number} [options.page_size] - Page size
 * @returns {Promise<{ count: number, next: string|null, previous: string|null, results: Array }>}
 */
export async function getProcurementPendingJobOrders(options = {}) {
    const queryParams = new URLSearchParams();
    if (options.status != null && options.status !== '') queryParams.append('status', options.status);
    if (options.search != null && options.search !== '') queryParams.append('search', options.search);
    if (options.customer != null && options.customer !== '') queryParams.append('customer', String(options.customer));
    if (options.ordering != null && options.ordering !== '') queryParams.append('ordering', options.ordering);
    if (options.page != null) queryParams.append('page', String(options.page));
    if (options.page_size != null) queryParams.append('page_size', String(options.page_size));

    const url = `${backendBase}/projects/job-orders/procurement_pending/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Procurement pending job orders request failed: ${response.status}`);
    }
    return response.json();
}

/**
 * Get saved procurement lines for a job order.
 * GET /api/projects/procurement-lines/?job_order=254-01
 * @param {string} jobOrder - Job order number (e.g. "254-01")
 * @returns {Promise<Array<{...}>>}
 */
export async function getProcurementLines(jobOrder) {
    const queryParams = new URLSearchParams({ job_order: jobOrder });
    const url = `${backendBase}/projects/procurement-lines/?${queryParams.toString()}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Get procurement lines failed: ${response.status}`);
    }
    return response.json();
}

/**
 * Preview procurement lines (pre-filled from planning + purchase history, not saved).
 * GET /api/projects/procurement-lines/preview/?job_order=254-01
 * price_source: "po_line" | "recommended_offer" | "any_offer" | "none"
 * @param {string} jobOrder - Job order number
 * @returns {Promise<Array<{...}>>}
 */
export async function getProcurementLinesPreview(jobOrder) {
    const queryParams = new URLSearchParams({ job_order: jobOrder });
    const url = `${backendBase}/projects/procurement-lines/preview/?${queryParams.toString()}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Procurement lines preview failed: ${response.status}`);
    }
    return response.json();
}

/** price_source values for preview lines */
export const PROCUREMENT_PRICE_SOURCE = {
    PO_LINE: 'po_line',
    RECOMMENDED_OFFER: 'recommended_offer',
    ANY_OFFER: 'any_offer',
    NONE: 'none'
};

/**
 * Submit procurement lines (atomically replace all lines for the job order).
 * POST /api/projects/procurement-lines/submit/
 * Either item or item_description must be provided per line. unit_price in EUR; server computes amount_eur.
 * Pass lines: [] to clear all (material_cost becomes 0).
 * @param {string} jobOrder - Job order number
 * @param {Array<{ item?: number|null, item_description?: string|null, quantity: string, unit_price: string, planning_request_item?: number|null, order: number }>} lines
 * @returns {Promise<Array>} 201 with array of saved lines
 */
export async function submitProcurementLines(jobOrder, lines) {
    const url = `${backendBase}/projects/procurement-lines/submit/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_order: jobOrder, lines })
    });
    if (!response.ok) {
        const text = await response.text();
        let errMsg = `Submit procurement lines failed: ${response.status}`;
        try {
            const data = JSON.parse(text);
            if (data && typeof data === 'object' && Object.keys(data).length) errMsg = JSON.stringify(data);
        } catch (_) {
            if (text) errMsg = text;
        }
        throw new Error(errMsg);
    }
    return response.json();
}

// ─── Job orders that have QC/Shipping/Procurement entries (for review/update) ─

/**
 * Job orders that have at least one QC cost line.
 * GET /projects/job-orders/has_qc/
 * Paginated, same shape as job order list. Use ?search=, ?status= etc.
 * @param {Object} options - status, search, customer, ordering, page, page_size
 * @returns {Promise<{ count: number, next: string|null, previous: string|null, results: Array }>}
 */
export async function getJobOrdersHasQc(options = {}) {
    const queryParams = new URLSearchParams();
    if (options.status != null && options.status !== '') queryParams.append('status', options.status);
    if (options.search != null && options.search !== '') queryParams.append('search', options.search);
    if (options.customer != null && options.customer !== '') queryParams.append('customer', String(options.customer));
    if (options.ordering != null && options.ordering !== '') queryParams.append('ordering', options.ordering);
    if (options.page != null) queryParams.append('page', String(options.page));
    if (options.page_size != null) queryParams.append('page_size', String(options.page_size));

    const url = `${backendBase}/projects/job-orders/has_qc/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await authedFetch(url);
    if (!response.ok) throw new Error(`Has QC job orders request failed: ${response.status}`);
    return response.json();
}

/**
 * Job orders that have at least one shipping cost line.
 * GET /projects/job-orders/has_shipping/
 * @param {Object} options - Same as getJobOrdersHasQc
 * @returns {Promise<{ count: number, next: string|null, previous: string|null, results: Array }>}
 */
export async function getJobOrdersHasShipping(options = {}) {
    const queryParams = new URLSearchParams();
    if (options.status != null && options.status !== '') queryParams.append('status', options.status);
    if (options.search != null && options.search !== '') queryParams.append('search', options.search);
    if (options.customer != null && options.customer !== '') queryParams.append('customer', String(options.customer));
    if (options.ordering != null && options.ordering !== '') queryParams.append('ordering', options.ordering);
    if (options.page != null) queryParams.append('page', String(options.page));
    if (options.page_size != null) queryParams.append('page_size', String(options.page_size));

    const url = `${backendBase}/projects/job-orders/has_shipping/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await authedFetch(url);
    if (!response.ok) throw new Error(`Has shipping job orders request failed: ${response.status}`);
    return response.json();
}

/**
 * Job orders that have at least one procurement line.
 * GET /projects/job-orders/has_procurement/
 * @param {Object} options - Same as getJobOrdersHasQc
 * @returns {Promise<{ count: number, next: string|null, previous: string|null, results: Array }>}
 */
export async function getJobOrdersHasProcurement(options = {}) {
    const queryParams = new URLSearchParams();
    if (options.status != null && options.status !== '') queryParams.append('status', options.status);
    if (options.search != null && options.search !== '') queryParams.append('search', options.search);
    if (options.customer != null && options.customer !== '') queryParams.append('customer', String(options.customer));
    if (options.ordering != null && options.ordering !== '') queryParams.append('ordering', options.ordering);
    if (options.page != null) queryParams.append('page', String(options.page));
    if (options.page_size != null) queryParams.append('page_size', String(options.page_size));

    const url = `${backendBase}/projects/job-orders/has_procurement/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await authedFetch(url);
    if (!response.ok) throw new Error(`Has procurement job orders request failed: ${response.status}`);
    return response.json();
}

// ─── QC Cost Lines (job orders with zero QC lines = qc_pending) ─────────────

/**
 * Job orders with zero QC cost lines (excluding cancelled).
 * GET /projects/job-orders/qc_pending/
 * Paginated, supports standard filters: status, search, customer, ordering, page, page_size.
 * @param {Object} options - Query parameters
 * @returns {Promise<{ count: number, next: string|null, previous: string|null, results: Array }>}
 */
export async function getQcPendingJobOrders(options = {}) {
    const queryParams = new URLSearchParams();
    if (options.status != null && options.status !== '') queryParams.append('status', options.status);
    if (options.search != null && options.search !== '') queryParams.append('search', options.search);
    if (options.customer != null && options.customer !== '') queryParams.append('customer', String(options.customer));
    if (options.ordering != null && options.ordering !== '') queryParams.append('ordering', options.ordering);
    if (options.page != null) queryParams.append('page', String(options.page));
    if (options.page_size != null) queryParams.append('page_size', String(options.page_size));

    const url = `${backendBase}/projects/job-orders/qc_pending/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`QC pending job orders request failed: ${response.status}`);
    }
    return response.json();
}

/**
 * List QC cost lines for a job order.
 * GET /projects/qc-cost-lines/?job_order=254-01
 * Response fields: id, description, amount_eur, date, notes, created_by_name, created_at, updated_at
 * @param {string} jobOrder - Job order number
 * @returns {Promise<Array<{ id, description, amount_eur, date, notes, ... }>>}
 */
export async function getQcCostLines(jobOrder) {
    const queryParams = new URLSearchParams({ job_order: jobOrder });
    const url = `${backendBase}/projects/qc-cost-lines/?${queryParams.toString()}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Get QC cost lines failed: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.results != null ? data.results : []);
}

/**
 * Submit QC cost lines (atomically replace all lines for the job order).
 * POST /projects/qc-cost-lines/submit/
 * Body: { job_order, lines: [ { description, amount_eur, date?, notes? } ] }. lines: [] clears all.
 * @param {string} jobOrder - Job order number
 * @param {Array<{ description: string, amount_eur: string, date?: string, notes?: string }>} lines
 * @returns {Promise<Array>}
 */
export async function submitQcCostLines(jobOrder, lines) {
    const url = `${backendBase}/projects/qc-cost-lines/submit/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_order: jobOrder, lines: lines || [] })
    });
    if (!response.ok) {
        const text = await response.text();
        let errMsg = `Submit QC cost lines failed: ${response.status}`;
        try {
            const data = JSON.parse(text);
            if (data && typeof data === 'object' && Object.keys(data).length) errMsg = JSON.stringify(data);
        } catch (_) {
            if (text) errMsg = text;
        }
        throw new Error(errMsg);
    }
    return response.json();
}

/**
 * Create a QC cost line.
 * POST /projects/qc-cost-lines/
 * description required; amount and currency required; amount_eur required (if currency is EUR can be omitted, server fills from amount).
 * created_by set from auth.
 * @param {Object} payload
 * @param {string} payload.job_order - e.g. "254-01"
 * @param {string} payload.description - required
 * @param {string} payload.amount - required, amount in original currency
 * @param {string} payload.currency - required, one of EUR, USD, GBP, TRY
 * @param {string} [payload.amount_eur] - required unless currency is EUR (then auto-filled from amount)
 * @param {string} [payload.date] - optional, e.g. "2026-02-10"
 * @param {string} [payload.notes] - optional
 * @returns {Promise<Object>} Created line
 */
export async function createQcCostLine(payload) {
    if (!COST_SUMMARY_CURRENCIES.includes(payload.currency)) {
        throw new Error(`Invalid currency. Valid: ${COST_SUMMARY_CURRENCIES.join(', ')}`);
    }
    const url = `${backendBase}/projects/qc-cost-lines/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const text = await response.text();
        let errMsg = `Create QC cost line failed: ${response.status}`;
        try {
            const data = JSON.parse(text);
            if (data && typeof data === 'object' && Object.keys(data).length) errMsg = JSON.stringify(data);
        } catch (_) {
            if (text) errMsg = text;
        }
        throw new Error(errMsg);
    }
    return response.json();
}

// ─── Shipping Cost Lines (job orders with zero shipping lines = shipping_pending) ─

/**
 * Job orders with zero shipping cost lines (excluding cancelled).
 * GET /projects/job-orders/shipping_pending/
 * Paginated, supports standard filters.
 * @param {Object} options - Query parameters
 * @returns {Promise<{ count: number, next: string|null, previous: string|null, results: Array }>}
 */
export async function getShippingPendingJobOrders(options = {}) {
    const queryParams = new URLSearchParams();
    if (options.status != null && options.status !== '') queryParams.append('status', options.status);
    if (options.search != null && options.search !== '') queryParams.append('search', options.search);
    if (options.customer != null && options.customer !== '') queryParams.append('customer', String(options.customer));
    if (options.ordering != null && options.ordering !== '') queryParams.append('ordering', options.ordering);
    if (options.page != null) queryParams.append('page', String(options.page));
    if (options.page_size != null) queryParams.append('page_size', String(options.page_size));

    const url = `${backendBase}/projects/job-orders/shipping_pending/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Shipping pending job orders request failed: ${response.status}`);
    }
    return response.json();
}

/**
 * List shipping cost lines for a job order.
 * GET /projects/shipping-cost-lines/?job_order=254-01
 * Response fields: id, description, amount_eur, date, notes, created_by_name, created_at, updated_at
 * @param {string} jobOrder - Job order number
 * @returns {Promise<Array>}
 */
export async function getShippingCostLines(jobOrder) {
    const queryParams = new URLSearchParams({ job_order: jobOrder });
    const url = `${backendBase}/projects/shipping-cost-lines/?${queryParams.toString()}`;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`Get shipping cost lines failed: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.results != null ? data.results : []);
}

/**
 * Submit shipping cost lines (atomically replace all lines for the job order).
 * POST /projects/shipping-cost-lines/submit/
 * Body: { job_order, lines: [ { description, amount_eur, date?, notes? } ] }. lines: [] clears all.
 * @param {string} jobOrder - Job order number
 * @param {Array<{ description: string, amount_eur: string, date?: string, notes?: string }>} lines
 * @returns {Promise<Array>}
 */
export async function submitShippingCostLines(jobOrder, lines) {
    const url = `${backendBase}/projects/shipping-cost-lines/submit/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_order: jobOrder, lines: lines || [] })
    });
    if (!response.ok) {
        const text = await response.text();
        let errMsg = `Submit shipping cost lines failed: ${response.status}`;
        try {
            const data = JSON.parse(text);
            if (data && typeof data === 'object' && Object.keys(data).length) errMsg = JSON.stringify(data);
        } catch (_) {
            if (text) errMsg = text;
        }
        throw new Error(errMsg);
    }
    return response.json();
}

/**
 * Create a shipping cost line.
 * POST /projects/shipping-cost-lines/
 * Same field rules as QC: description, amount, currency required; amount_eur required (or omit if EUR).
 * @param {Object} payload - Same shape as createQcCostLine
 * @returns {Promise<Object>}
 */
export async function createShippingCostLine(payload) {
    if (!COST_SUMMARY_CURRENCIES.includes(payload.currency)) {
        throw new Error(`Invalid currency. Valid: ${COST_SUMMARY_CURRENCIES.join(', ')}`);
    }
    const url = `${backendBase}/projects/shipping-cost-lines/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const text = await response.text();
        let errMsg = `Create shipping cost line failed: ${response.status}`;
        try {
            const data = JSON.parse(text);
            if (data && typeof data === 'object' && Object.keys(data).length) errMsg = JSON.stringify(data);
        } catch (_) {
            if (text) errMsg = text;
        }
        throw new Error(errMsg);
    }
    return response.json();
}
