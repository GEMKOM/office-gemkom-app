import { adjustOfferPrices } from '../../apis/procurement.js';
import { showNotification } from '../notification/notification.js';

/**
 * Owner-only modal to adjust supplier offer prices within ±10% of the original
 * offered price (copper etc. fluctuates daily). Submits explicit per-line prices
 * so the backend validates against the exact same ±10% band it enforces.
 *
 * @param {Object} purchaseRequest  Full PR detail (must include `offers` + `request_items`).
 * @param {Object} opts
 * @param {Function} [opts.onSaved]  Called with the API response after a successful save.
 */
export function openAdjustPricesModal(purchaseRequest, { onSaved } = {}) {
    const offers = purchaseRequest?.offers || [];
    const itemsById = {};
    (purchaseRequest?.request_items || []).forEach(ri => { itemsById[ri.id] = ri; });

    const hasAnyOffer = offers.some(o => (o.item_offers || []).length > 0);
    if (!hasAnyOffer) {
        showNotification('Bu talepte güncellenecek teklif bulunmuyor.', 'warning');
        return;
    }

    // Remove any stale instance
    const existing = document.getElementById('adjust-prices-modal');
    if (existing) existing.remove();

    const fmt = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
    };

    const itemLabel = (io) => {
        const ri = itemsById[io.purchase_request_item];
        if (!ri) return `#${io.purchase_request_item}`;
        const it = ri.item;
        if (it && (it.code || it.name)) return `${it.code || ''} ${it.name || ''}`.trim();
        return ri.item_description || `#${io.purchase_request_item}`;
    };
    const itemQty = (io) => {
        const ri = itemsById[io.purchase_request_item];
        return ri ? parseFloat(ri.quantity || 0) : null;
    };

    let rowsHTML = '';
    offers.forEach(offer => {
        const itemOffers = (offer.item_offers || []).filter(io => io.unit_price != null);
        if (!itemOffers.length) return;
        const currency = offer.currency || '';
        rowsHTML += `
            <div class="mb-3 border rounded">
                <div class="px-3 py-2 bg-light border-bottom d-flex justify-content-between align-items-center">
                    <span class="fw-semibold"><i class="fas fa-truck me-2 text-muted"></i>${offer.supplier?.name || 'Tedarikçi'}</span>
                    <span class="text-muted small">${currency}</span>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm mb-0 align-middle">
                        <thead>
                            <tr class="small text-muted">
                                <th>Malzeme</th>
                                <th class="text-end">Miktar</th>
                                <th class="text-end">Orijinal</th>
                                <th class="text-end">Güncel</th>
                                <th class="text-end" style="min-width:150px;">Yeni Birim Fiyat</th>
                                <th>İzin Verilen Aralık</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        itemOffers.forEach(io => {
            const min = parseFloat(io.price_min);
            const max = parseFloat(io.price_max);
            const original = io.original_unit_price != null ? io.original_unit_price : io.unit_price;
            const recBadge = io.is_recommended
                ? '<span class="badge bg-primary ms-1" title="Önerilen (siparişe dönüşecek)"><i class="fas fa-star"></i></span>'
                : '';
            const adjBadge = io.is_price_adjusted
                ? `<span class="badge bg-secondary ms-1" title="Daha önce güncellendi${io.price_adjusted_by_username ? ' - ' + io.price_adjusted_by_username : ''}">düzenlendi</span>`
                : '';
            rowsHTML += `
                <tr data-offer-id="${io.id}">
                    <td>${itemLabel(io)}${recBadge}${adjBadge}</td>
                    <td class="text-end">${itemQty(io) ?? '-'}</td>
                    <td class="text-end text-muted">${fmt(original)}</td>
                    <td class="text-end">${fmt(io.unit_price)}</td>
                    <td class="text-end">
                        <input type="number" step="0.01" min="${min}" max="${max}"
                               class="form-control form-control-sm text-end adjust-price-input"
                               value="${fmt(io.unit_price)}"
                               data-offer-id="${io.id}"
                               data-min="${min}" data-max="${max}"
                               data-original="${original}"
                               data-current="${fmt(io.unit_price)}">
                    </td>
                    <td class="small text-muted">${fmt(min)} – ${fmt(max)}</td>
                </tr>
            `;
        });
        rowsHTML += `</tbody></table></div></div>`;
    });

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'adjust-prices-modal';
    modal.tabIndex = -1;
    modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title"><i class="fas fa-tags me-2 text-primary"></i>Teklif Fiyatlarını Güncelle</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Kapat"></button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-info py-2 small">
                        <i class="fas fa-info-circle me-1"></i>
                        Fiyatlar yalnızca orijinal teklifin <strong>±%10</strong> aralığında değiştirilebilir.
                        Onaylanmış taleplerde değişiklik ilgili satın alma siparişlerine de yansır.
                    </div>
                    <div class="d-flex align-items-end gap-2 mb-3 flex-wrap">
                        <div>
                            <label class="form-label small mb-1">Tüm satırlara yüzde uygula</label>
                            <div class="input-group input-group-sm" style="width:220px;">
                                <span class="input-group-text">%</span>
                                <input type="number" step="0.1" min="-10" max="10" id="adjust-percent-input" class="form-control" placeholder="örn. 6.5">
                                <button type="button" class="btn btn-outline-primary" id="adjust-percent-apply">Uygula</button>
                            </div>
                            <div class="form-text">Orijinal fiyat üzerinden hesaplanır.</div>
                        </div>
                    </div>
                    ${rowsHTML}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Vazgeç</button>
                    <button type="button" class="btn btn-primary" id="adjust-prices-save">
                        <i class="fas fa-save me-1"></i>Kaydet
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
    modal.addEventListener('hidden.bs.modal', () => modal.remove());

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    // Percent quick-apply: fill every input from its ORIGINAL price, clamped to band.
    modal.querySelector('#adjust-percent-apply').addEventListener('click', () => {
        const pct = parseFloat(modal.querySelector('#adjust-percent-input').value);
        if (!Number.isFinite(pct)) {
            showNotification('Geçerli bir yüzde girin.', 'warning');
            return;
        }
        if (Math.abs(pct) > 10) {
            showNotification('Yüzde en fazla ±%10 olabilir.', 'warning');
            return;
        }
        modal.querySelectorAll('.adjust-price-input').forEach(input => {
            const original = parseFloat(input.dataset.original);
            const min = parseFloat(input.dataset.min);
            const max = parseFloat(input.dataset.max);
            const next = clamp(original * (1 + pct / 100), min, max);
            input.value = next.toFixed(2);
            input.classList.remove('is-invalid');
        });
    });

    // Live validation styling
    modal.querySelectorAll('.adjust-price-input').forEach(input => {
        input.addEventListener('input', () => {
            const v = parseFloat(input.value);
            const min = parseFloat(input.dataset.min);
            const max = parseFloat(input.dataset.max);
            input.classList.toggle('is-invalid', !Number.isFinite(v) || v < min || v > max);
        });
    });

    modal.querySelector('#adjust-prices-save').addEventListener('click', async () => {
        const items = [];
        let hasInvalid = false;
        modal.querySelectorAll('.adjust-price-input').forEach(input => {
            const v = parseFloat(input.value);
            const min = parseFloat(input.dataset.min);
            const max = parseFloat(input.dataset.max);
            const current = parseFloat(input.dataset.current);
            if (!Number.isFinite(v) || v < min || v > max) {
                input.classList.add('is-invalid');
                hasInvalid = true;
                return;
            }
            // Only send rows that actually changed (2-decimal comparison)
            if (v.toFixed(2) !== current.toFixed(2)) {
                items.push({ item_offer_id: parseInt(input.dataset.offerId, 10), unit_price: v.toFixed(2) });
            }
        });

        if (hasInvalid) {
            showNotification('Bazı fiyatlar izin verilen aralığın dışında.', 'error');
            return;
        }
        if (!items.length) {
            showNotification('Değişiklik yapılmadı.', 'info');
            return;
        }

        const saveBtn = modal.querySelector('#adjust-prices-save');
        const originalHTML = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Kaydediliyor...';
        try {
            const resp = await adjustOfferPrices(purchaseRequest.id, { items });
            showNotification(resp.detail || `${items.length} teklif güncellendi.`, 'success');
            bsModal.hide();
            if (typeof onSaved === 'function') onSaved(resp);
        } catch (error) {
            showNotification(error.message || 'Teklif fiyatları güncellenemedi.', 'error');
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHTML;
        }
    });

    bsModal.show();
}
