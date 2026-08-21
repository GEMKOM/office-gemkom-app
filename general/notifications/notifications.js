/**
 * Bildirimlerim — the full notification archive.
 *
 * The bell only ever shows the newest slice, and once something is read it
 * drops off the bottom of it. Nothing is deleted server-side though, so this
 * page pages, searches and filters everything the user has ever received.
 */
import { guardRoute, navigateTo } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { showNotification } from '../../components/notification/notification.js';
import {
    getNotifications,
    getNotificationFacets,
    markNotificationRead,
    markNotificationUnread,
    markAllNotificationsRead,
} from '../../apis/notification/notifications.js';

const PAGE_SIZE = 25;

const state = {
    page: 1,
    count: 0,
    notifications: [],
    facets: null,
    isLoading: false,
    filters: {
        search: '',
        category: '',
        notification_type: '',
        is_read: '',
        created_at__date__gte: '',
        created_at__date__lte: '',
    },
};

let filtersComponent = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    new HeaderComponent({
        title: 'Bildirimlerim',
        subtitle: 'Tüm bildirim geçmişiniz — arayın, filtreleyin, tekrar açın',
        icon: 'bell',
        showBackButton: 'none',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onRefreshClick: () => load({ resetPage: true }),
    });

    setupFilters();
    await load({ resetPage: true });
    setupDelegatedClicks();
});

// ---------------------------------------------------------------- filters

function setupFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Bildirim Ara',
        applyButtonText: 'Ara',
        clearButtonText: 'Temizle',
        onApply: (values) => {
            state.filters.search = values['notif-search'] || '';
            state.filters.notification_type = values['notif-type'] || '';
            state.filters.is_read = values['notif-read'] || '';
            state.filters.created_at__date__gte = values['notif-from'] || '';
            state.filters.created_at__date__lte = values['notif-to'] || '';
            load({ resetPage: true });
        },
        onClear: () => {
            Object.keys(state.filters).forEach((key) => { state.filters[key] = ''; });
            load({ resetPage: true });
        },
    });

    filtersComponent.addTextFilter({
        id: 'notif-search',
        label: 'Ara',
        placeholder: 'İş emri no, başlık, içerik...',
        colSize: 4,
    });

    filtersComponent.addDropdownFilter({
        id: 'notif-type',
        label: 'Bildirim Türü',
        options: [{ value: '', label: 'Tümü' }],
        placeholder: 'Tümü',
        colSize: 3,
    });

    filtersComponent.addDropdownFilter({
        id: 'notif-read',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'false', label: 'Okunmamış' },
            { value: 'true', label: 'Okunmuş' },
        ],
        placeholder: 'Tümü',
        colSize: 2,
        searchable: false,
    });

    filtersComponent.addDateFilter({ id: 'notif-from', label: 'Başlangıç', colSize: 2 });
    filtersComponent.addDateFilter({ id: 'notif-to', label: 'Bitiş', colSize: 2 });
}

/** Keep the type dropdown showing only types this user actually has. */
function syncTypeOptions() {
    if (!filtersComponent || !state.facets) return;
    const typeFilter = filtersComponent.filters.find(f => f.id === 'notif-type');
    if (!typeFilter) return;

    const options = [{ value: '', label: 'Tümü' }].concat(
        state.facets.types.map(t => ({
            value: t.value,
            label: `${t.label} (${t.count})`,
        }))
    );
    // Only re-render when the option set actually changed, so the dropdown does
    // not reset itself under the user mid-interaction.
    const signature = options.map(o => o.value).join('|');
    if (typeFilter._signature === signature) return;
    typeFilter._signature = signature;
    typeFilter.options = options;
    filtersComponent.renderFilters();
}

// ------------------------------------------------------------------ data

function activeQuery() {
    const query = { ordering: '-created_at', page_size: PAGE_SIZE, page: state.page };
    Object.entries(state.filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
            query[key] = value;
        }
    });
    return query;
}

async function load({ resetPage = false } = {}) {
    if (resetPage) state.page = 1;
    if (state.isLoading) return;
    state.isLoading = true;
    renderList({ loading: true });

    try {
        const query = activeQuery();
        // Facets share the filters (minus paging) so the counts match the list.
        const facetQuery = { ...query };
        delete facetQuery.page;
        delete facetQuery.page_size;
        delete facetQuery.ordering;

        const [response, facets] = await Promise.all([
            getNotifications(query),
            getNotificationFacets(facetQuery),
        ]);

        state.notifications = response.results || [];
        state.count = response.count || 0;
        state.facets = facets;

        syncTypeOptions();
        renderFacets();
        renderList({});
    } catch (error) {
        console.error('Failed to load notification history:', error);
        renderList({ error: true });
    } finally {
        state.isLoading = false;
    }
}

// --------------------------------------------------------------- rendering

function renderFacets() {
    const container = document.getElementById('notification-facets');
    if (!container || !state.facets) return;

    const { categories, total, unread, oldest } = state.facets;
    const chips = [
        { value: '', label: 'Tümü', count: total },
        ...categories,
    ].map(chip => {
        const active = (state.filters.category || '') === chip.value ? 'active' : '';
        return `
            <button type="button" class="notif-chip ${active}" data-category="${escapeAttr(chip.value)}">
                ${escapeHtml(chip.label)}
                <span class="notif-chip-count">${chip.count}</span>
            </button>
        `;
    }).join('');

    const since = oldest
        ? `${formatDate(oldest)} tarihinden bu yana`
        : 'Henüz bildirim yok';

    container.innerHTML = `
        <div class="dashboard-card compact mb-3">
            <div class="card-body py-3">
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    ${chips}
                    <div class="ms-auto d-flex align-items-center gap-3">
                        <span class="text-muted small">${escapeHtml(since)}</span>
                        <button type="button" class="btn btn-sm btn-outline-primary"
                                id="notif-mark-all" ${unread ? '' : 'disabled'}>
                            Tümünü Okundu İşaretle${unread ? ` (${unread})` : ''}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderList({ loading = false, error = false }) {
    const container = document.getElementById('notification-history');
    if (!container) return;

    if (loading) {
        container.innerHTML = `
            <div class="text-center p-5">
                <div class="spinner-border text-primary" role="status"></div>
            </div>
        `;
        return;
    }

    if (error) {
        container.innerHTML = `
            <div class="alert alert-danger">
                Bildirimler yüklenirken hata oluştu.
            </div>
        `;
        return;
    }

    if (!state.notifications.length) {
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center text-muted py-5">
                    <i class="fas fa-bell-slash fa-2x mb-3 d-block"></i>
                    ${hasActiveFilters()
                        ? 'Bu filtrelere uyan bildirim bulunamadı.'
                        : 'Henüz bildiriminiz yok.'}
                </div>
            </div>
        `;
        return;
    }

    const rows = state.notifications.map(renderRow).join('');
    container.innerHTML = `
        <div class="dashboard-card">
            <div class="notif-history-list">${rows}</div>
        </div>
        ${renderPager()}
    `;
}

function renderRow(notification) {
    const unreadClass = notification.is_read ? '' : 'unread';
    const hasLink = notification.link && notification.link !== '#';
    return `
        <div class="notif-row ${unreadClass}" data-id="${notification.id}">
            <div class="notif-row-main" data-action="open" data-link="${escapeAttr(notification.link || '')}">
                <div class="notif-row-title">${escapeHtml(notification.title || '-')}</div>
                <div class="notif-row-body">${escapeHtml(notification.body || '')}</div>
                <div class="notif-row-meta">
                    <span class="badge bg-light text-dark">${escapeHtml(notification.notification_type_display || '')}</span>
                    ${notification.category_display
                        ? `<span class="badge bg-light text-dark">${escapeHtml(notification.category_display)}</span>`
                        : ''}
                    <span class="text-muted">${formatDateTime(notification.created_at)}</span>
                </div>
            </div>
            <div class="notif-row-actions">
                ${hasLink
                    ? `<button class="btn btn-sm btn-outline-secondary" data-action="open"
                               data-link="${escapeAttr(notification.link)}" title="Aç">
                           <i class="fas fa-arrow-up-right-from-square"></i>
                       </button>`
                    : ''}
                <button class="btn btn-sm btn-outline-secondary"
                        data-action="${notification.is_read ? 'unread' : 'read'}"
                        title="${notification.is_read ? 'Okunmadı işaretle' : 'Okundu işaretle'}">
                    <i class="fas ${notification.is_read ? 'fa-envelope' : 'fa-envelope-open'}"></i>
                </button>
            </div>
        </div>
    `;
}

function renderPager() {
    const totalPages = Math.max(1, Math.ceil(state.count / PAGE_SIZE));
    if (totalPages <= 1) {
        return `<div class="text-muted small mt-2">${state.count} bildirim</div>`;
    }
    const first = (state.page - 1) * PAGE_SIZE + 1;
    const last = Math.min(state.page * PAGE_SIZE, state.count);
    return `
        <div class="d-flex justify-content-between align-items-center mt-3">
            <span class="text-muted small">${first}-${last} / ${state.count}</span>
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-secondary" data-page="${state.page - 1}"
                        ${state.page <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Önceki
                </button>
                <button class="btn btn-sm btn-outline-secondary" disabled>
                    ${state.page} / ${totalPages}
                </button>
                <button class="btn btn-sm btn-outline-secondary" data-page="${state.page + 1}"
                        ${state.page >= totalPages ? 'disabled' : ''}>
                    Sonraki <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

// ----------------------------------------------------------------- events

function setupDelegatedClicks() {
    document.addEventListener('click', async (event) => {
        const chip = event.target.closest('.notif-chip');
        if (chip) {
            state.filters.category = chip.dataset.category || '';
            await load({ resetPage: true });
            return;
        }

        if (event.target.closest('#notif-mark-all')) {
            await handleMarkAllRead();
            return;
        }

        const pageButton = event.target.closest('[data-page]');
        if (pageButton && !pageButton.disabled) {
            const page = parseInt(pageButton.dataset.page, 10);
            if (!Number.isNaN(page) && page >= 1) {
                state.page = page;
                await load({});
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return;
        }

        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const row = actionEl.closest('.notif-row');
        if (!row) return;
        const id = row.dataset.id;

        if (actionEl.dataset.action === 'open') {
            await handleOpen(id, actionEl.dataset.link);
        } else if (actionEl.dataset.action === 'read') {
            await handleToggleRead(id, true);
        } else if (actionEl.dataset.action === 'unread') {
            await handleToggleRead(id, false);
        }
    });
}

async function handleOpen(id, link) {
    try {
        await markNotificationRead(id);
    } catch (error) {
        console.error('Failed to mark notification as read:', error);
    }
    if (link) {
        navigateTo(link);
    } else {
        await load({});
    }
}

async function handleToggleRead(id, read) {
    try {
        if (read) {
            await markNotificationRead(id);
        } else {
            await markNotificationUnread(id);
        }
        await load({});
    } catch (error) {
        console.error('Failed to toggle read state:', error);
        showNotification('Bildirim durumu güncellenemedi', 'error');
    }
}

async function handleMarkAllRead() {
    try {
        await markAllNotificationsRead();
        await load({});
        showNotification('Tüm bildirimler okundu olarak işaretlendi', 'success');
    } catch (error) {
        console.error('Failed to mark all as read:', error);
        showNotification('Bildirimler güncellenemedi', 'error');
    }
}

// ---------------------------------------------------------------- helpers

function hasActiveFilters() {
    return Object.values(state.filters).some(value => value !== '' && value !== null);
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric',
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text ?? '').replace(/"/g, '&quot;');
}
