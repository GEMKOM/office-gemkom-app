// components/jobAllocations/jobAllocations.js
//
// Shared editor for a machining part's job-order allocations:
// rows of [job order picker | adet | remove], "+ İş emri ekle", a
// "Toplam adet" footer and each row's share as a percentage.
//
// Emits `[{ job_no, quantity }]` — the exact shape `POST/PATCH /tasks/parts/`
// accepts under `job_allocations`.

import { ModernDropdown } from '../dropdown/dropdown.js';
import { getJobOrderDropdown } from '../../apis/projects/jobOrders.js';

let cachedJobOrderItems = null;
let cachedJobOrderPromise = null;
let editorSequence = 0;

/**
 * Load (and cache per page) the job order picker items.
 * `[{job_no, title}]` → `[{value: job_no, text: "job_no - title"}]`.
 * @param {boolean} [force] - Re-fetch even when cached
 * @returns {Promise<Array<{value: string, text: string}>>}
 */
export async function loadJobOrderAllocationItems(force = false) {
    if (cachedJobOrderItems && !force) return cachedJobOrderItems;
    if (!cachedJobOrderPromise || force) {
        cachedJobOrderPromise = getJobOrderDropdown()
            .then((list) => (Array.isArray(list) ? list : []).map((jobOrder) => ({
                value: jobOrder.job_no,
                text: jobOrder.title ? `${jobOrder.job_no} - ${jobOrder.title}` : String(jobOrder.job_no)
            })))
            .catch((error) => {
                console.error('Error loading job order allocation items:', error);
                return [];
            })
            .then((items) => {
                cachedJobOrderItems = items;
                return items;
            });
    }
    return cachedJobOrderPromise;
}

/**
 * Format a 0..1 share as a Turkish percentage label ("%60", "%33,3").
 * @param {number} share
 * @returns {string}
 */
export function formatSharePercent(share) {
    const value = Number(share);
    if (!Number.isFinite(value)) return '-';
    const pct = value * 100;
    const rounded = Math.round(pct * 10) / 10;
    const text = Number.isInteger(rounded)
        ? String(rounded)
        : rounded.toFixed(1).replace('.', ',');
    return `%${text}`;
}

/**
 * Sum the quantities of allocation rows.
 * @param {Array<{quantity: number|string}>} rows
 * @returns {number}
 */
export function sumAllocationQuantity(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((total, row) => {
        const qty = parseInt(row?.quantity, 10);
        return total + (Number.isFinite(qty) && qty > 0 ? qty : 0);
    }, 0);
}

/**
 * Validate `[{job_no, quantity}]` rows the same way the backend does.
 * @param {Array} rows
 * @returns {string|null} Turkish error message or null when valid
 */
export function validateAllocationRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return 'En az bir iş emri seçilmelidir';
    }
    const seen = new Set();
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        const jobNo = String(row.job_no || '').trim();
        if (!jobNo) {
            return `${i + 1}. satırda iş emri seçilmemiş`;
        }
        const qty = Number(row.quantity);
        if (!Number.isInteger(qty) || qty < 1) {
            return `${jobNo} için adet 1 veya daha büyük bir tam sayı olmalıdır`;
        }
        if (seen.has(jobNo)) {
            return `Aynı iş emri birden fazla kez seçilemez: ${jobNo}`;
        }
        seen.add(jobNo);
    }
    return null;
}

/**
 * Create the allocation editor inside `container`.
 *
 * @param {HTMLElement|string} container - Element or element id
 * @param {Object} [options]
 * @param {Array<{job_no: string, quantity: number}>} [options.initial] - Initial rows
 * @param {Array<{value: string, text: string}>} [options.jobOrders] - Picker items; loaded from the API when omitted
 * @param {boolean} [options.allowEmpty] - Let a single row with no job order pass validation (legacy "no job" part)
 * @param {Function} [options.onChange] - Called with the current rows after every change
 * @returns {{getValue: Function, getRawRows: Function, setValue: Function, destroy: Function, isValid: Function, getError: Function, isEmpty: Function, setItems: Function}}
 */
export function createJobAllocationsEditor(container, options = {}) {
    const host = typeof container === 'string' ? document.getElementById(container) : container;
    if (!host) {
        throw new Error('createJobAllocationsEditor: container not found');
    }

    const editorId = `job-allocations-${++editorSequence}`;
    const settings = {
        initial: [],
        jobOrders: null,
        allowEmpty: false,
        onChange: null,
        ...options
    };

    let rows = [];            // [{ id, job_no, quantity }]
    let rowSequence = 0;
    let items = Array.isArray(settings.jobOrders) ? settings.jobOrders : [];
    let destroyed = false;
    const dropdowns = new Map(); // row id → ModernDropdown

    host.innerHTML = `
        <div class="job-allocations-editor" id="${editorId}">
            <div class="job-allocations-header">
                <span class="job-allocations-col-job">İş Emri</span>
                <span class="job-allocations-col-qty">Adet</span>
                <span class="job-allocations-col-share">Pay</span>
                <span class="job-allocations-col-remove"></span>
            </div>
            <div class="job-allocations-rows"></div>
            <div class="job-allocations-footer">
                <button type="button" class="btn btn-sm btn-outline-primary job-allocations-add-btn">
                    <i class="fas fa-plus me-1"></i>İş emri ekle
                </button>
                <span class="job-allocations-total">Toplam adet: <strong class="job-allocations-total-value">0</strong></span>
            </div>
            <div class="job-allocations-error text-danger small" hidden></div>
        </div>
    `;

    const root = host.querySelector(`#${editorId}`);
    const rowsEl = root.querySelector('.job-allocations-rows');
    const totalEl = root.querySelector('.job-allocations-total-value');
    const errorEl = root.querySelector('.job-allocations-error');
    const addBtn = root.querySelector('.job-allocations-add-btn');

    // ---- helpers ----------------------------------------------------------

    function itemsForRow(row) {
        // Keep a job number that is no longer in the dropdown (closed job,
        // phase mirror, legacy value) visible instead of blanking the picker.
        const jobNo = String(row.job_no || '').trim();
        if (!jobNo || items.some((it) => String(it.value) === jobNo)) return items;
        return [{ value: jobNo, text: jobNo }, ...items];
    }

    function notifyChange() {
        if (typeof settings.onChange === 'function') {
            settings.onChange(api.getValue());
        }
    }

    function refreshTotals() {
        const total = sumAllocationQuantity(rows);
        totalEl.textContent = String(total);
        rows.forEach((row) => {
            const rowEl = rowsEl.querySelector(`[data-row-id="${row.id}"]`);
            if (!rowEl) return;
            const shareEl = rowEl.querySelector('.job-allocations-share');
            const qty = parseInt(row.quantity, 10);
            if (total > 0 && Number.isFinite(qty) && qty > 0) {
                shareEl.textContent = formatSharePercent(qty / total);
            } else {
                shareEl.textContent = '-';
            }
        });
        const removeButtons = rowsEl.querySelectorAll('.job-allocations-remove-btn');
        removeButtons.forEach((btn) => {
            btn.disabled = rows.length <= 1;
        });
        errorEl.hidden = true;
        errorEl.textContent = '';
    }

    function setupRowDropdown(row, rowEl) {
        const dropdownContainer = rowEl.querySelector(`#${editorId}-job-no-dropdown-${row.id}`);
        if (!dropdownContainer) return;
        dropdownContainer.innerHTML = '';

        const dropdown = new ModernDropdown(dropdownContainer, {
            placeholder: 'İş emri seçin',
            searchable: true,
            multiple: false,
            maxHeight: 200,
            width: '100%'
        });
        dropdown.setItems(itemsForRow(row));
        if (row.job_no) {
            dropdown.setValue(row.job_no);
        }
        dropdowns.set(row.id, dropdown);

        dropdownContainer.addEventListener('dropdown:select', (e) => {
            row.job_no = e.detail.value || '';
            refreshTotals();
            notifyChange();
        });
    }

    function createRowElement(row) {
        const rowEl = document.createElement('div');
        rowEl.className = 'job-allocations-row';
        rowEl.dataset.rowId = String(row.id);
        rowEl.innerHTML = `
            <div class="job-allocations-col-job">
                <div id="${editorId}-job-no-dropdown-${row.id}" class="job-no-dropdown-container"></div>
            </div>
            <div class="job-allocations-col-qty">
                <input type="number" class="form-control job-allocations-qty" min="1" step="1" placeholder="1" value="${row.quantity ?? ''}">
            </div>
            <div class="job-allocations-col-share">
                <span class="job-allocations-share">-</span>
            </div>
            <div class="job-allocations-col-remove">
                <button type="button" class="btn btn-sm btn-outline-danger job-allocations-remove-btn" title="Satırı kaldır">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        const qtyInput = rowEl.querySelector('.job-allocations-qty');
        qtyInput.addEventListener('input', () => {
            row.quantity = qtyInput.value === '' ? '' : parseInt(qtyInput.value, 10);
            refreshTotals();
            notifyChange();
        });

        rowEl.querySelector('.job-allocations-remove-btn').addEventListener('click', () => {
            if (rows.length <= 1) return;
            removeRow(row.id);
        });

        return rowEl;
    }

    function addRow(initialRow = {}) {
        const row = {
            id: ++rowSequence,
            job_no: initialRow.job_no ? String(initialRow.job_no) : '',
            quantity: initialRow.quantity === undefined || initialRow.quantity === null || initialRow.quantity === ''
                ? ''
                : parseInt(initialRow.quantity, 10)
        };
        rows.push(row);
        const rowEl = createRowElement(row);
        rowsEl.appendChild(rowEl);
        setupRowDropdown(row, rowEl);
        refreshTotals();
        return row;
    }

    function removeRow(rowId) {
        const dropdown = dropdowns.get(rowId);
        if (dropdown) {
            dropdown.destroy();
            dropdowns.delete(rowId);
        }
        rows = rows.filter((r) => r.id !== rowId);
        rowsEl.querySelector(`[data-row-id="${rowId}"]`)?.remove();
        refreshTotals();
        notifyChange();
    }

    function clearRows() {
        dropdowns.forEach((dropdown) => dropdown.destroy());
        dropdowns.clear();
        rows = [];
        rowsEl.innerHTML = '';
    }

    function showError(message) {
        if (!message) {
            errorEl.hidden = true;
            errorEl.textContent = '';
            return;
        }
        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    // ---- public api -------------------------------------------------------

    const api = {
        /** Validated rows: `[{job_no, quantity}]` (numbers). Empty when `isEmpty()` and `allowEmpty`. */
        getValue() {
            return rows
                .filter((row) => String(row.job_no || '').trim() !== '')
                .map((row) => ({
                    job_no: String(row.job_no).trim(),
                    quantity: parseInt(row.quantity, 10)
                }));
        },
        /** Every row as typed, including rows with no job order selected. */
        getRawRows() {
            return rows.map((row) => ({
                job_no: String(row.job_no || '').trim(),
                quantity: row.quantity === '' || row.quantity === null || row.quantity === undefined
                    ? null
                    : parseInt(row.quantity, 10)
            }));
        },
        /** True when no row has a job order selected. */
        isEmpty() {
            return rows.every((row) => String(row.job_no || '').trim() === '');
        },
        setValue(newRows) {
            if (destroyed) return;
            clearRows();
            const list = Array.isArray(newRows) ? newRows.filter(Boolean) : [];
            if (list.length === 0) {
                addRow();
            } else {
                list.forEach((row) => addRow(row));
            }
            showError(null);
            notifyChange();
        },
        setItems(newItems) {
            items = Array.isArray(newItems) ? newItems : [];
            rows.forEach((row) => {
                const dropdown = dropdowns.get(row.id);
                if (!dropdown) return;
                dropdown.setItems(itemsForRow(row));
                if (row.job_no) {
                    dropdown.setValue(row.job_no);
                }
            });
        },
        getError() {
            if (settings.allowEmpty && rows.length === 1 && api.isEmpty()) {
                return null;
            }
            const raw = api.getRawRows();
            return validateAllocationRows(raw);
        },
        isValid() {
            return api.getError() === null;
        },
        /** Show (or clear) an error line under the rows, e.g. a backend message. */
        showError,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            clearRows();
            host.innerHTML = '';
        }
    };

    addBtn.addEventListener('click', () => {
        addRow();
        notifyChange();
        // Open the picker of the new row straight away — deferred a tick so
        // ModernDropdown's document-level outside-click handler (which runs
        // after this click bubbles) doesn't close it again immediately.
        const last = rows[rows.length - 1];
        const dropdown = last ? dropdowns.get(last.id) : null;
        if (dropdown && typeof dropdown.open === 'function') {
            setTimeout(() => {
                if (!destroyed && dropdowns.get(last.id) === dropdown && !dropdown.isOpen) {
                    dropdown.open();
                }
            }, 0);
        }
    });

    // Initial rows (always at least one).
    const initial = Array.isArray(settings.initial) ? settings.initial.filter(Boolean) : [];
    if (initial.length === 0) {
        addRow();
    } else {
        initial.forEach((row) => addRow(row));
    }

    // Picker items: use the ones handed in, otherwise fetch (cached per page).
    if (!Array.isArray(settings.jobOrders)) {
        loadJobOrderAllocationItems().then((loaded) => {
            if (!destroyed) api.setItems(loaded);
        });
    }

    return api;
}
