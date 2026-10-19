/**
 * "Nasıl çalışır?" — the estimator's method explanation. One text for the
 * whole app: the backend builds it from the live code constants and unit
 * times (GET /estimator/method/), so it never drifts from the calculation.
 *
 * - `loadMethodHtml()`: the rendered HTML (cached for the page's lifetime;
 *   `{ fresh: true }` refetches, e.g. after a unit-time change).
 * - `openEstimatorMethod()`: a standalone Bootstrap modal (Referanslar page).
 *   The Tahmin card shows the same HTML inline instead, because it already
 *   lives inside the job order / offer modal.
 *
 * Styling comes from `.est-markdown` in components/estimate-report/estimate-report.css.
 */
import { getEstimatorMethod } from '../../apis/estimator.js';
import { renderMarkdown } from '../../utils/markdownLite.js';
import { escapeHtml } from '../../utils/text.js';

const MODAL_ID = 'estimator-method-modal';
let cached = null;

export function loadMethodHtml({ fresh = false } = {}) {
    if (!cached || fresh) {
        cached = getEstimatorMethod()
            .then((data) => renderMarkdown(data.markdown || ''))
            .catch((error) => { cached = null; throw error; });
    }
    return cached;
}

export async function openEstimatorMethod({ fresh = false } = {}) {
    let el = document.getElementById(MODAL_ID);
    if (!el) {
        el = document.createElement('div');
        el.className = 'modal fade';
        el.id = MODAL_ID;
        el.tabIndex = -1;
        el.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h6 class="modal-title"><i class="fas fa-circle-question me-2"></i>Tahmin nasıl çalışır?</h6>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Kapat"></button>
                    </div>
                    <div class="modal-body"><div class="est-markdown" data-method-body></div></div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Kapat</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(el);
    }
    const body = el.querySelector('[data-method-body]');
    body.innerHTML = '<div class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor…</div>';
    bootstrap.Modal.getOrCreateInstance(el).show();
    try {
        body.innerHTML = await loadMethodHtml({ fresh });
    } catch (error) {
        body.innerHTML = `<div class="text-danger small">${escapeHtml(error.message || 'Açıklama yüklenemedi')}</div>`;
    }
}
