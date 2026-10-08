/**
 * EditModal builders for the Ödeme Listeleri page. Each modal lives in its own
 * container (ids in index.html) and is (re)built on every open, the way the
 * subcontracting statements page does it.
 */
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { FileAttachments } from '../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../components/file-viewer/file-viewer.js';
import { showNotification } from '../../components/notification/notification.js';
import { extractResultsFromResponse } from '../../apis/paginationHelper.js';
import { escapeHtml } from '../../utils/text.js';
import {
    addPaymentListItems, bulkMarkSchedulesPaid, cancelPaymentList, createPaymentList, deleteAttachment,
    getPaymentLists, listPoAttachments, markPaymentListItemPaid, splitSchedule, updatePaymentList,
    uploadPoAttachment,
} from '../../apis/procurement/paymentLists.js';
import { currencyBreakdown, fmtDate, fmtEur, fmtMoney, num, sumEur, todayIso } from './format.js';

export function initModals(ctx) {
    const instances = {};

    function modal(key, options) {
        if (!instances[key]) {
            instances[key] = new EditModal(`pl-${key}-modal-container`, options);
        }
        const m = instances[key];
        m.clearAll();
        if (options.title) m.setTitle(options.title);
        if (options.icon) m.setIcon(options.icon);
        if (options.saveButtonText) m.setSaveButtonText(options.saveButtonText);
        return m;
    }

    function fail(error, fallback) {
        console.error(error);
        showNotification(error?.message || fallback, 'error');
        throw error; // keeps the modal open
    }

    function note(m, html) {
        const div = document.createElement('div');
        div.className = 'pl-modal-note';
        div.innerHTML = html;
        m.form.prepend(div);
        return div;
    }

    // ----------------------------------------------------------------------
    // list header (create / edit)
    // ----------------------------------------------------------------------

    async function openListForm({ mode = 'create', list = null, carryOverFrom = null, onSaved }) {
        const isEdit = mode === 'edit';
        const m = modal('list-form', {
            title: isEdit ? 'Listeyi Düzenle' : 'Yeni Ödeme Listesi',
            icon: 'fas fa-list-check',
            saveButtonText: isEdit ? 'Kaydet' : 'Oluştur',
            size: 'lg',
        });
        const today = todayIso();
        const defaultTitle = `${fmtDate(today)} Ödeme Listesi`;
        m.addSection({ title: null, fields: [
            { id: 'title', name: 'title', label: 'Başlık', type: 'text', required: true, colSize: 8, value: isEdit ? list.title : defaultTitle },
            { id: 'list_date', name: 'list_date', label: 'Tarih', type: 'date', required: true, colSize: 4, value: isEdit ? list.list_date : today },
            { id: 'budget_eur', name: 'budget_eur', label: 'Bütçe (EUR)', type: 'number', step: '0.01', min: 0, colSize: 4, value: isEdit && num(list.budget_eur) !== null ? String(num(list.budget_eur)) : '', help: 'Bu hafta ödenebilecek toplam (EUR). Boş bırakılabilir.' },
            { id: 'notes', name: 'notes', label: 'Not', type: 'textarea', rows: 2, colSize: 8, value: isEdit ? (list.notes || '') : '' },
        ] });

        let carryOptions = [];
        if (!isEdit) {
            try {
                const response = await getPaymentLists({ status: 'completed,cancelled', page_size: 20, ordering: '-list_date' });
                carryOptions = extractResultsFromResponse(response).map((l) => ({
                    value: String(l.id),
                    label: `${l.title} (${l.status_label || l.status}, ${fmtDate(l.list_date)})`,
                }));
            } catch (_) { /* no carry-over candidates */ }
            m.addField({
                id: 'carry_over_from', name: 'carry_over_from', label: 'Önceki listenin ödenmemiş kalemlerini aktar',
                type: 'select', options: carryOptions, placeholder: 'Aktarma yok', colSize: 12,
                value: carryOverFrom ? String(carryOverFrom.id) : '',
                help: 'Seçilen tamamlanmış/iptal listede ödenmeden kalan kalemler yeni listeye kopyalanır.',
            });
        }
        m.render();
        m.onSaveCallback(async (fd) => {
            const payload = {
                title: (fd.title || '').trim(),
                list_date: fd.list_date,
                budget_eur: fd.budget_eur === '' || fd.budget_eur === null ? null : fd.budget_eur,
                notes: fd.notes || '',
            };
            try {
                let saved;
                if (isEdit) {
                    saved = await updatePaymentList(list.id, payload);
                } else {
                    if (fd.carry_over_from) payload.carry_over_from = Number(fd.carry_over_from);
                    saved = await createPaymentList(payload);
                }
                m.hide();
                showNotification(isEdit ? 'Liste güncellendi' : 'Liste oluşturuldu', 'success');
                if (onSaved) onSaved(saved);
            } catch (error) {
                fail(error, 'Liste kaydedilemedi');
            }
        });
        m.show();
    }

    function openBudget({ list, onDone }) {
        const m = modal('budget', { title: 'Bütçeyi Düzenle', icon: 'fas fa-sack-dollar', saveButtonText: 'Kaydet', size: 'sm' });
        m.addSection({ title: null, fields: [
            { id: 'budget_eur', name: 'budget_eur', label: 'Bütçe (EUR)', type: 'number', step: '0.01', min: 0, colSize: 12, value: num(list.budget_eur) !== null ? String(num(list.budget_eur)) : '' },
        ] });
        m.render();
        m.onSaveCallback(async (fd) => {
            try {
                await updatePaymentList(list.id, { budget_eur: fd.budget_eur === '' ? null : fd.budget_eur });
                m.hide();
                showNotification('Bütçe güncellendi', 'success');
                if (onDone) onDone();
            } catch (error) {
                fail(error, 'Bütçe güncellenemedi');
            }
        });
        m.show();
    }

    function openManualFx({ list, onDone }) {
        const m = modal('fx', { title: 'Kur Gir (manuel)', icon: 'fas fa-coins', saveButtonText: 'Kaydet', size: 'sm' });
        const fx = list.fx || {};
        m.addSection({ title: null, fields: [
            { id: 'eur_try', name: 'eur_try', label: '1 € = … TL', type: 'number', step: '0.0001', min: 0.0001, required: true, colSize: 12, value: num(fx.eur_try) !== null ? String(num(fx.eur_try)) : '' },
            { id: 'usd_try', name: 'usd_try', label: '1 $ = … TL', type: 'number', step: '0.0001', min: 0.0001, colSize: 12, value: num(fx.usd_try) !== null ? String(num(fx.usd_try)) : '' },
        ] });
        m.render();
        m.onSaveCallback(async (fd) => {
            try {
                await updatePaymentList(list.id, { fx_manual: { eur_try: fd.eur_try, usd_try: fd.usd_try || null } });
                m.hide();
                showNotification('Kur kaydedildi, EUR tutarları yeniden hesaplandı', 'success');
                if (onDone) onDone();
            } catch (error) {
                fail(error, 'Kur kaydedilemedi');
            }
        });
        m.show();
    }

    // ----------------------------------------------------------------------
    // mark paid (single) / bulk
    // ----------------------------------------------------------------------

    function paidAmountLabel(row, withTax) {
        return withTax ? fmtMoney(row.gross_amount, row.currency) : fmtMoney(row.net_amount, row.currency);
    }

    function openMarkPaid({ row, mode = 'pool', listId = null, itemId = null, onDone }) {
        const m = modal('mark-paid', { title: 'Ödeme İşaretle', icon: 'fas fa-check-circle text-success', saveButtonText: 'Ödeme İşaretle', size: 'lg' });
        const label = `${row.supplier?.name || ''} · PO-${row.po?.id} · ${row.schedule_sequence ?? row.sequence}/${row.schedule_count} ${row.label || row.basis_label || ''}`.trim();
        m.addSection({ title: null, fields: [
            { id: 'schedule_label_ro', name: 'schedule_label_ro', label: 'Ödeme planı', type: 'text', readonly: true, colSize: 12, value: label },
            { id: 'payment_display_amount', name: 'payment_display_amount', label: 'Ödeme tutarı', type: 'text', readonly: true, colSize: 6, value: paidAmountLabel(row, true) },
            { id: 'payment_due_date_ro', name: 'payment_due_date_ro', label: 'Vade tarihi', type: 'text', readonly: true, colSize: 6, value: fmtDate(row.due_date) },
            { id: 'paid_at', name: 'paid_at', label: 'Ödeme tarihi', type: 'date', required: true, colSize: 6, value: todayIso() },
            { id: 'paid_with_tax', name: 'paid_with_tax', label: 'KDV dahil ödendi', type: 'checkbox', value: true, colSize: 6, help: 'Son taksit KDV dahil ödenmelidir.' },
        ] });
        m.render();
        const checkbox = m.container.querySelector('[data-field-id="paid_with_tax"] input[type="checkbox"]');
        if (checkbox) {
            checkbox.addEventListener('change', () => m.setFieldValue('payment_display_amount', paidAmountLabel(row, checkbox.checked)));
        }
        m.onSaveCallback(async (fd) => {
            const payload = { paid_with_tax: !!fd.paid_with_tax, paid_at: fd.paid_at || todayIso() };
            try {
                if (mode === 'item') {
                    await markPaymentListItemPaid(listId, itemId, payload);
                } else {
                    const result = await bulkMarkSchedulesPaid({ schedule_ids: [row.schedule_id], ...payload });
                    const r = (result.results || [])[0];
                    if (!r || !r.ok) throw new Error(r?.detail || 'Ödeme işaretlenemedi');
                }
                m.hide();
                showNotification('Ödeme işaretlendi', 'success');
                if (onDone) onDone();
            } catch (error) {
                fail(error, 'Ödeme işaretlenemedi');
            }
        });
        m.show();
    }

    function openBulkPaid({ rows, onDone }) {
        const m = modal('bulk-paid', { title: 'Toplu Ödeme İşaretle', icon: 'fas fa-check-double text-success', saveButtonText: `${rows.length} taksiti ödendi işaretle`, size: 'lg' });
        m.addSection({ title: null, fields: [
            { id: 'summary_ro', name: 'summary_ro', label: 'Seçim', type: 'text', readonly: true, colSize: 12, value: `${rows.length} taksit · ${currencyBreakdown(rows)} · ≈ ${fmtEur(sumEur(rows))}` },
            { id: 'paid_at', name: 'paid_at', label: 'Ödeme tarihi', type: 'date', required: true, colSize: 6, value: todayIso(), help: 'Geçmiş ödemeler için gerçek ödeme tarihini girin.' },
            { id: 'paid_with_tax', name: 'paid_with_tax', label: 'KDV dahil ödendi', type: 'checkbox', value: true, colSize: 6 },
            { id: 'dry_run', name: 'dry_run', label: 'Önce dene (kayıt yapma, sadece sonucu göster)', type: 'checkbox', value: false, colSize: 12 },
        ] });
        m.render();
        note(m, 'Aynı siparişin taksitleri sıra ile işlenir; kuralı bozan satırlar atlanır ve nedeniyle listelenir.');
        m.onSaveCallback(async (fd) => {
            try {
                const result = await bulkMarkSchedulesPaid({
                    schedule_ids: rows.map((r) => r.schedule_id),
                    paid_at: fd.paid_at || todayIso(),
                    paid_with_tax: !!fd.paid_with_tax,
                    dry_run: !!fd.dry_run,
                });
                const failures = (result.results || []).filter((r) => !r.ok);
                const summary = `${result.dry_run ? '[Deneme] ' : ''}${result.paid} işaretlendi, ${result.skipped} atlandı`;
                if (failures.length) {
                    const lines = failures.slice(0, 8).map((f) => `PO-${f.po_id ?? '?'} taksit #${f.schedule_id}: ${f.detail}`);
                    showNotification(`${summary}<br>${lines.map(escapeHtml).join('<br>')}${failures.length > 8 ? '<br>…' : ''}`, 'warning');
                } else {
                    showNotification(summary, 'success');
                }
                if (!result.dry_run) {
                    m.hide();
                    if (onDone) onDone();
                }
            } catch (error) {
                fail(error, 'Toplu işaretleme başarısız');
            }
        });
        m.show();
    }

    // ----------------------------------------------------------------------
    // split
    // ----------------------------------------------------------------------

    function openSplit({ row, onDone }) {
        const m = modal('split', { title: 'Taksiti Böl', icon: 'fas fa-scissors', saveButtonText: 'Böl', size: 'sm' });
        const total = num(row.net_amount) || 0;
        m.addSection({ title: null, fields: [
            { id: 'split_info_ro', name: 'split_info_ro', label: 'Taksit (KDV hariç)', type: 'text', readonly: true, colSize: 12, value: `${fmtMoney(row.net_amount, row.currency)} · ${row.label || row.basis_label || ''}` },
            { id: 'mode', name: 'mode', label: 'Bölme şekli', type: 'select', colSize: 5, value: 'amount', options: [{ value: 'amount', label: 'Tutar' }, { value: 'percentage', label: 'Yüzde (%)' }] },
            { id: 'value', name: 'value', label: 'Şimdi ödenecek kısım', type: 'number', step: '0.01', min: 0.01, required: true, colSize: 7, value: '' },
        ] });
        m.render();
        const preview = document.createElement('div');
        preview.className = 'pl-split-preview';
        m.form.appendChild(preview);
        const update = () => {
            const mode = m.getFieldValue('mode');
            const v = num(m.getFieldValue('value'));
            if (v === null || v <= 0) { preview.textContent = 'Bu ödeme: — · Kalan: —'; return; }
            const first = mode === 'percentage' ? (total * v) / 100 : v;
            if (first >= total) { preview.innerHTML = '<span class="text-danger">Bölünen tutar taksit tutarından küçük olmalı.</span>'; return; }
            preview.innerHTML = `Bu ödeme: <strong>${fmtMoney(first, row.currency)}</strong> · Kalan (yeni taksit): <strong>${fmtMoney(total - first, row.currency)}</strong> <span class="pl-sub">(KDV hariç)</span>`;
        };
        m.form.addEventListener('input', update);
        m.form.addEventListener('change', update);
        update();
        m.onSaveCallback(async (fd) => {
            const payload = { schedule_id: row.schedule_id };
            if (fd.mode === 'percentage') payload.percentage = fd.value;
            else payload.amount = fd.value;
            try {
                await splitSchedule(row.po.id, payload);
                m.hide();
                showNotification('Taksit bölündü', 'success');
                if (onDone) onDone();
            } catch (error) {
                fail(error, 'Taksit bölünemedi');
            }
        });
        m.show();
    }

    // ----------------------------------------------------------------------
    // exclude / decide / cancel (reason modals)
    // ----------------------------------------------------------------------

    function reasonModal(key, { title, icon, saveText, label, required, help, onSave, size = 'sm' }) {
        const m = modal(key, { title, icon, saveButtonText: saveText, size });
        m.addSection({ title: null, fields: [
            { id: 'reason', name: 'reason', label, type: 'textarea', rows: 3, required, colSize: 12, value: '', help },
        ] });
        m.render();
        m.onSaveCallback(async (fd) => {
            try {
                await onSave((fd.reason || '').trim());
                m.hide();
            } catch (error) {
                fail(error, 'İşlem başarısız');
            }
        });
        m.show();
    }

    function openExclude({ row, onSave }) {
        reasonModal('exclude', {
            title: `Listeden çıkar: ${row.supplier?.name || ''}`, icon: 'fas fa-ban', saveText: 'Çıkar',
            label: 'Gerekçe', required: true, help: 'Satır listede üstü çizili olarak kalır; gerekçe listeyi hazırlayana görünür.', onSave,
        });
    }

    function openDecide({ approve, onSave }) {
        reasonModal('decide', {
            title: approve ? 'Listeyi Onayla' : 'Listeyi Reddet',
            icon: approve ? 'fas fa-check-circle text-success' : 'fas fa-times-circle text-danger',
            saveText: approve ? 'Onayla' : 'Reddet',
            label: 'Yorum', required: !approve, help: approve ? 'Onay yorumu (opsiyonel)' : 'Red gerekçesi (zorunlu)', onSave,
        });
    }

    function openCancel({ list, onDone }) {
        reasonModal('cancel', {
            title: `Listeyi iptal et: ${list.title}`, icon: 'fas fa-ban text-danger', saveText: 'İptal Et',
            label: 'Gerekçe', required: false, help: 'Listedeki kalemler havuza geri döner.',
            onSave: async (reason) => {
                await cancelPaymentList(list.id, reason);
                showNotification('Liste iptal edildi', 'success');
                if (onDone) onDone();
            },
        });
    }

    // ----------------------------------------------------------------------
    // proformas
    // ----------------------------------------------------------------------

    async function openProforma({ row, onDone }) {
        const po = row.po;
        const m = modal('proforma', { title: `Proforma · PO-${po.id} · ${row.supplier?.name || ''}`, icon: 'fas fa-paperclip', saveButtonText: 'Yükle', size: 'lg' });
        m.addSection({ title: null, fields: [
            { id: 'file', name: 'file', label: 'Dosya(lar)', type: 'file', multiple: true, colSize: 8, accept: '.pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx', help: 'Proforma veya sipariş belgeleri (birden fazla seçilebilir).' },
            { id: 'description', name: 'description', label: 'Açıklama', type: 'text', colSize: 4, value: 'proforma' },
        ] });
        m.render();

        const holder = document.createElement('div');
        holder.id = 'pl-proforma-files';
        m.form.prepend(holder);
        const empty = document.createElement('div');
        empty.className = 'pl-proforma-empty';
        m.form.prepend(empty);

        const viewer = new FileViewer();
        let changed = false;

        async function refreshFiles() {
            try {
                const files = await listPoAttachments(po.id);
                empty.textContent = files.length ? '' : 'Bu siparişte henüz proforma yok.';
                const list = new FileAttachments('pl-proforma-files', {
                    title: 'Mevcut dosyalar', layout: 'list', showDeleteButton: true,
                    onFileClick: (f) => viewer.openFile(f.file_url, f.file_name, (f.file_name || '').split('.').pop().toLowerCase()),
                    onDeleteClick: (f) => ctx.confirm.show({
                        title: 'Dosyayı sil', message: `${f.file_name} silinsin mi?`, confirmText: 'Sil',
                        onConfirm: async () => {
                            try {
                                await deleteAttachment(f.id);
                                changed = true;
                                await refreshFiles();
                            } catch (error) {
                                showNotification(error.message || 'Dosya silinemedi', 'error');
                                throw error;
                            }
                        },
                    }),
                });
                list.setFiles(files);
            } catch (error) {
                empty.textContent = error.message || 'Dosyalar yüklenemedi';
            }
        }
        await refreshFiles();

        m.onSaveCallback(async (fd) => {
            const input = m.container.querySelector('input[type="file"]');
            const files = input && input.files ? Array.from(input.files) : [];
            if (!files.length) {
                showNotification('Lütfen dosya seçin.', 'warning');
                throw new Error('Dosya gerekli');
            }
            try {
                for (const f of files) {
                    await uploadPoAttachment(po.id, f, (fd.description || 'proforma').trim() || 'proforma');
                }
                m.hide();
                showNotification(`${files.length} dosya yüklendi`, 'success');
                if (onDone) onDone();
            } catch (error) {
                fail(error, 'Dosya yüklenemedi');
            }
        });
        m.onCancelCallback(() => {
            if (changed && onDone) onDone();
            changed = false;
        });
        m.show();
    }

    // ----------------------------------------------------------------------
    // add selected pool rows to a list
    // ----------------------------------------------------------------------

    async function openAddToList({ rows, onDone }) {
        const eligible = rows.filter((r) => !r.open_list);
        const skipped = rows.length - eligible.length;
        if (!eligible.length) {
            showNotification('Seçilen kalemlerin tümü zaten bir listede.', 'warning');
            return;
        }
        const m = modal('add-to-list', { title: 'Listeye Ekle', icon: 'fas fa-list-check', saveButtonText: 'Ekle', size: 'sm' });
        let options = [];
        try {
            const response = await getPaymentLists({ status: 'draft,rejected', page_size: 50, ordering: '-list_date' });
            options = extractResultsFromResponse(response).map((l) => ({ value: String(l.id), label: `${l.title} (${l.status_label || l.status})` }));
        } catch (_) { /* fall through to new list */ }
        options.push({ value: '__new__', label: '+ Yeni liste oluştur' });
        m.addSection({ title: null, fields: [
            { id: 'target_list', name: 'target_list', label: 'Hedef liste', type: 'select', required: true, colSize: 12, options, value: options.length === 1 ? '__new__' : (options[0].value), placeholder: 'Seçiniz' },
        ] });
        m.render();
        note(m, `${eligible.length} kalem · ≈ ${fmtEur(sumEur(eligible))}${skipped ? `<br><span class="text-muted">${skipped} kalem zaten bir listede, atlanacak.</span>` : ''}`);
        const ids = eligible.map((r) => r.schedule_id);
        m.onSaveCallback(async (fd) => {
            if (fd.target_list === '__new__') {
                m.hide();
                openListForm({
                    mode: 'create',
                    onSaved: async (list) => {
                        try {
                            await addPaymentListItems(list.id, ids);
                            showNotification(`${ids.length} kalem "${list.title}" listesine eklendi`, 'success');
                            if (onDone) onDone();
                        } catch (error) {
                            showNotification(error.message || 'Kalemler eklenemedi', 'error');
                        }
                    },
                });
                return;
            }
            try {
                await addPaymentListItems(Number(fd.target_list), ids);
                m.hide();
                showNotification(`${ids.length} kalem listeye eklendi`, 'success');
                if (onDone) onDone();
            } catch (error) {
                fail(error, 'Kalemler eklenemedi');
            }
        });
        m.show();
    }

    return {
        openListForm, openBudget, openManualFx, openMarkPaid, openBulkPaid, openSplit,
        openExclude, openDecide, openCancel, openProforma, openAddToList,
    };
}
