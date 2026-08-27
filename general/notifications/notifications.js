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
import { categoryMeta } from '../../components/notificationBell/notificationCategories.js';
import {
    getNotifications,
    getNotificationFacets,
    markNotificationRead,
    markNotificationUnread,
    markAllNotificationsRead,
} from '../../apis/notification/notifications.js';

const PAGE_SIZE = 25;

/**
 * The page opens on unread only. Read notifications are the ones the user has
 * already dealt with, and leaving them in the list pushed everything still
 * waiting below the fold.
 */
const DEFAULT_READ_FILTER = 'false';

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
        is_read: DEFAULT_READ_FILTER,
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
            // Clearing returns to the default view rather than to everything.
            state.filters.is_read = DEFAULT_READ_FILTER;
            filtersComponent.setFilterValues({ 'notif-read': DEFAULT_READ_FILTER });
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
        value: DEFAULT_READ_FILTER,
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

    // renderFilters() rebuilds every field from its config, which would snap the
    // other inputs back to their defaults — carry the live values across.
    const current = filtersComponent.getFilterValues();
    filtersComponent.renderFilters();
    filtersComponent.setFilterValues(current);
}

// ------------------------------------------------------------------ data

function activeQuery() {
    // In the mixed view unread has to come first across the whole archive, not
    // just within the page we happen to be showing, so the server orders it.
    const ordering = state.filters.is_read === '' ? 'is_read,-created_at' : '-created_at';
    const query = { ordering, page_size: PAGE_SIZE, page: state.page };
    Object.entries(state.filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
            query[key] = value;
        }
    });
    return query;
}

/**
 * What the list should actually show right now.
 *
 * Read state is edited in place (optimistically) between loads, so a row can
 * stop matching the active status filter without a round trip; it drops out
 * here. The sort repeats the server ordering so an optimistically flipped row
 * lands in the right group immediately.
 */
function visibleNotifications() {
    const readFilter = state.filters.is_read;
    const rows = state.notifications.filter(n => matchesReadFilter(n));
    if (readFilter !== '') return rows;

    return rows.slice().sort((a, b) => {
        if (!!a.is_read !== !!b.is_read) return a.is_read ? 1 : -1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
}

function matchesReadFilter(notification) {
    if (state.filters.is_read === '') return true;
    return String(!!notification.is_read) === state.filters.is_read;
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

    // The backend keeps every category the user has ever received on the rail
    // (at zero when the current filters exclude it), so the tabs stay put
    // instead of vanishing one by one as filters narrow.
    const tabs = [{ value: '', label: 'Tümü', count: total, icon: 'fa-inbox' }]
        .concat(categories.map(c => ({ ...c, icon: categoryMeta(c.value).icon })))
        .map(tab => {
            const active = (state.filters.category || '') === tab.value;
            const empty = !tab.count && !active;
            return `
                <button type="button"
                        class="notif-tab ${active ? 'active' : ''} ${empty ? 'is-empty' : ''}"
                        data-category="${escapeAttr(tab.value)}"
                        aria-selected="${active}">
                    <i class="fas ${tab.icon}"></i>
                    ${escapeHtml(tab.label)}
                    <span class="notif-tab-count">${tab.count}</span>
                </button>
            `;
        }).join('');

    const since = oldest
        ? `${formatDate(oldest)} tarihinden bu yana`
        : 'Henüz bildirim yok';

    container.innerHTML = `
        <div class="dashboard-card notif-card mb-3">
            <div class="notif-toolbar">
                <div class="notif-toolbar-summary">
                    <span class="notif-unread-pill ${unread ? '' : 'is-clear'}">
                        <i class="fas ${unread ? 'fa-envelope' : 'fa-check'}"></i>
                        ${unread ? `${unread} okunmamış` : 'Tümü okundu'}
                    </span>
                    <span>${escapeHtml(since)}</span>
                </div>
                <div class="notif-toolbar-actions">
                    <button type="button" class="notif-mark-all" id="notif-mark-all"
                            ${unread ? '' : 'disabled'}>
                        <i class="fas fa-check-double"></i>
                        Tümünü Okundu İşaretle
                    </button>
                </div>
            </div>
            <div class="notif-tabs" role="tablist">${tabs}</div>
        </div>
    `;
}

function renderList({ loading = false, error = false }) {
    const container = document.getElementById('notification-history');
    if (!container) return;

    if (loading) {
        container.innerHTML = card(`
            <div class="notif-state">
                <div class="spinner-border text-secondary" role="status"></div>
                <div class="notif-state-title">Bildirimler yükleniyor…</div>
            </div>
        `);
        return;
    }

    if (error) {
        container.innerHTML = card(`
            <div class="notif-state">
                <i class="fas fa-triangle-exclamation"></i>
                <div class="notif-state-title">Bildirimler yüklenirken hata oluştu.</div>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="notif-retry">
                    Tekrar dene
                </button>
            </div>
        `);
        return;
    }

    const rows = visibleNotifications();

    if (!rows.length) {
        container.innerHTML = card(renderEmptyState());
        return;
    }

    container.innerHTML = card(`
        <div class="notif-history-list">${renderGroupedRows(rows)}</div>
        ${renderPager()}
    `);
}

function renderEmptyState() {
    // The default view is unread-only, so an empty list there is good news
    // rather than a dead end — say so instead of blaming the filters.
    if (state.filters.is_read === DEFAULT_READ_FILTER && !hasActiveFilters()) {
        return `
            <div class="notif-state">
                <i class="fas fa-check-circle"></i>
                <div class="notif-state-title">Okunmamış bildirim yok.</div>
                <div class="small">
                    Geçmiş bildirimleriniz için durum filtresini "Tümü" yapın.
                </div>
            </div>
        `;
    }

    return `
        <div class="notif-state">
            <i class="fas fa-bell-slash"></i>
            <div class="notif-state-title">
                ${hasActiveFilters()
                    ? 'Bu filtrelere uyan bildirim bulunamadı.'
                    : 'Henüz bildiriminiz yok.'}
            </div>
            ${hasActiveFilters()
                ? '<div class="small">Filtreleri temizleyip tekrar deneyin.</div>'
                : ''}
        </div>
    `;
}

function card(inner) {
    return `<div class="dashboard-card notif-card">${inner}</div>`;
}

/** Rows under sticky day headers — an archive scans far better dated. */
function renderGroupedRows(notifications) {
    // In the mixed view the read rows sit in their own block below the unread
    // ones, so the day headers restart there instead of repeating out of order.
    const splitByReadState = state.filters.is_read === '';
    let currentDay = null;
    let readBlockOpened = false;

    return notifications.map(notification => {
        let header = '';
        if (splitByReadState && notification.is_read && !readBlockOpened) {
            readBlockOpened = true;
            currentDay = null;
            header += '<div class="notif-group">Okunanlar</div>';
        }

        const day = dayKey(notification.created_at);
        if (day !== currentDay) {
            currentDay = day;
            header += `<div class="notif-day">${escapeHtml(dayLabel(notification.created_at))}</div>`;
        }
        return header + renderRow(notification);
    }).join('');
}

function renderRow(notification) {
    const meta = categoryMeta(notification.category);
    const unreadClass = notification.is_read ? '' : 'unread';
    const hasLink = notification.link && notification.link !== '#';
    return `
        <div class="notif-row ${unreadClass}" data-id="${notification.id}">
            <div class="notif-icon" style="background:${meta.bg};color:${meta.color}">
                <i class="fas ${meta.icon}"></i>
            </div>
            <div class="notif-row-main" data-action="open" data-link="${escapeAttr(notification.link || '')}">
                <div class="notif-row-head">
                    <span class="notif-row-title">${escapeHtml(notification.title || '-')}</span>
                    <span class="notif-row-time" title="${escapeAttr(formatDateTime(notification.created_at))}">
                        ${escapeHtml(formatTime(notification.created_at))}
                    </span>
                </div>
                ${notification.body
                    ? `<div class="notif-row-body">${escapeHtml(notification.body)}</div>`
                    : ''}
                <div class="notif-row-meta">
                    <span class="notif-tag">${escapeHtml(notification.notification_type_display || '')}</span>
                    ${notification.category_display
                        ? `<span class="notif-tag notif-tag-category">${escapeHtml(notification.category_display)}</span>`
                        : ''}
                </div>
            </div>
            <div class="notif-row-actions">
                ${hasLink
                    ? `<button class="notif-action" data-action="open"
                               data-link="${escapeAttr(notification.link)}" title="Aç">
                           <i class="fas fa-arrow-up-right-from-square"></i>
                       </button>`
                    : ''}
                <button class="notif-action"
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
    const first = state.count ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    const last = Math.min(state.page * PAGE_SIZE, state.count);

    if (totalPages <= 1) {
        return `<div class="notif-pager"><span>${state.count} bildirim</span></div>`;
    }

    return `
        <div class="notif-pager">
            <span>${first}-${last} / ${state.count}</span>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm btn-outline-secondary" data-page="${state.page - 1}"
                        ${state.page <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Önceki
                </button>
                <span class="notif-pager-position">${state.page} / ${totalPages}</span>
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
        const tab = event.target.closest('.notif-tab');
        if (tab) {
            state.filters.category = tab.dataset.category || '';
            await load({ resetPage: true });
            return;
        }

        if (event.target.closest('#notif-retry')) {
            await load({});
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
    const notification = findNotification(id);
    const wasRead = notification ? !!notification.is_read : true;
    if (notification) {
        applyReadState(notification, true);
        refreshView();
    }

    try {
        await markNotificationRead(id);
        syncBellCount();
    } catch (error) {
        console.error('Failed to mark notification as read:', error);
        revertReadState(notification, wasRead);
    }

    if (link) {
        navigateTo(link);
    }
}

async function handleToggleRead(id, read) {
    const notification = findNotification(id);
    if (!notification || !!notification.is_read === read) return;

    // Flip it in place first: reloading the page would rebuild the list under
    // the user and throw away their scroll position.
    applyReadState(notification, read);
    refreshView();

    try {
        if (read) {
            await markNotificationRead(id);
        } else {
            await markNotificationUnread(id);
        }
        syncBellCount();
    } catch (error) {
        console.error('Failed to toggle read state:', error);
        revertReadState(notification, !read);
        showNotification('Bildirim durumu güncellenemedi', 'error');
    }
}

async function handleMarkAllRead() {
    const rows = state.notifications;
    const snapshot = {
        readStates: rows.map(n => !!n.is_read),
        count: state.count,
        unread: state.facets ? state.facets.unread : null,
    };

    rows.forEach(n => applyReadState(n, true));
    // The call clears every page, not just the rows in hand.
    if (state.facets) state.facets.unread = 0;
    if (state.filters.is_read === DEFAULT_READ_FILTER) state.count = 0;
    refreshView();

    try {
        await markAllNotificationsRead();
        syncBellCount();
        showNotification('Tüm bildirimler okundu olarak işaretlendi', 'success');
        // Rows we never loaded changed too; the unread view is already empty
        // and correct, the others need the real page back.
        if (state.filters.is_read !== DEFAULT_READ_FILTER) await load({});
    } catch (error) {
        console.error('Failed to mark all as read:', error);
        // Only unwind if a reload has not already replaced these rows.
        if (state.notifications === rows) {
            rows.forEach((n, index) => { n.is_read = snapshot.readStates[index]; });
            state.count = snapshot.count;
            if (state.facets && snapshot.unread !== null) state.facets.unread = snapshot.unread;
            refreshView();
        }
        showNotification('Bildirimler güncellenemedi', 'error');
    }
}

function findNotification(id) {
    return state.notifications.find(n => String(n.id) === String(id));
}

/**
 * Move one row's read state locally, keeping the counters that were rendered
 * from the server response in step with it.
 */
function applyReadState(notification, read) {
    if (!!notification.is_read === !!read) return;

    const matchedBefore = matchesReadFilter(notification);
    notification.is_read = !!read;
    const matchesNow = matchesReadFilter(notification);

    if (matchedBefore !== matchesNow) {
        state.count = Math.max(0, state.count + (matchesNow ? 1 : -1));
    }
    if (state.facets && typeof state.facets.unread === 'number') {
        state.facets.unread = Math.max(0, state.facets.unread + (read ? -1 : 1));
    }
}

/**
 * Undo an optimistic flip after a failed call — unless a reload has already
 * replaced the list, in which case the server state is on screen anyway.
 */
function revertReadState(notification, read) {
    if (!notification || !state.notifications.includes(notification)) return;
    applyReadState(notification, read);
    refreshView();
}

/** Re-render from local state, holding the page where the user left it. */
function refreshView() {
    const scrollY = window.scrollY;
    renderFacets();
    renderList({});
    window.scrollTo(0, scrollY);
}

/** Keep the navbar bell badge honest after a read-state change. */
function syncBellCount() {
    window.notificationBell?.updateUnreadCount?.();
}

// ---------------------------------------------------------------- helpers

function hasActiveFilters() {
    // The default unread-only view is the resting state, not a filter the user
    // has to be told about.
    return Object.entries(state.filters).some(([key, value]) =>
        value !== '' && value !== null && !(key === 'is_read' && value === DEFAULT_READ_FILTER));
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

/** Clock time only — the sticky day header above the row carries the date. */
function formatTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit',
    });
}

function dayKey(value) {
    if (!value) return '';
    const date = new Date(value);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value) {
    if (!value) return '';
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (dayKey(date) === dayKey(today)) return 'Bugün';
    if (dayKey(date) === dayKey(yesterday)) return 'Dün';
    return date.toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
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
