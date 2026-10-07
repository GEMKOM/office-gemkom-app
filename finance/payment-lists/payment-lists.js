/**
 * Ödeme Listeleri — weekly supplier payment planning on top of procurement.
 *
 *   /finance/payment-lists/              lists overview
 *   /finance/payment-lists/?view=pool    Ödeme Havuzu (unpaid instalments, cleanup tools)
 *   /finance/payment-lists/?list=<id>    one list (items, approval, finance handoff)
 */
import { guardRoute, getUser } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { decidePaymentList } from '../../apis/finance/paymentLists.js';
import { initModals } from './modals.js';
import { createPoolView } from './poolView.js';
import { createListsView } from './listsView.js';
import { createDetailView } from './detailView.js';

const DEFAULT_VIEW = 'lists';

const ctx = {
    state: {
        view: null,
        pool: { selection: new Map() },
        picker: { selection: new Map() },
    },
    user: null,
    header: null,
    confirm: null,
    modals: null,
    navigate,
    setHeader,
    decide: (listId, approve, comment) => decidePaymentList(listId, { approve, comment }),
};

let views = null;

function readRoute() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('list')) return { view: 'detail', listId: Number(params.get('list')) };
    if (params.get('view') === 'pool') return { view: 'pool' };
    return { view: DEFAULT_VIEW };
}

function navigate(route, { replace = false } = {}) {
    const url = new URL(window.location.href);
    url.search = '';
    if (route.view === 'detail') url.searchParams.set('list', String(route.listId));
    else if (route.view === 'pool') url.searchParams.set('view', 'pool');
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    applyRoute(route);
}

function setHeader(config) {
    if (!ctx.header) {
        ctx.header = new HeaderComponent({ containerId: 'header-placeholder', ...config });
    } else {
        ctx.header.updateConfig(config);
    }
}

const HEADERS = {
    lists: () => ({
        title: 'Ödeme Listeleri',
        subtitle: 'Haftalık tedarikçi ödeme planı: havuzdan seç, genel müdür onayı, finansa gönder',
        icon: 'money-check-dollar',
        showBackButton: 'block',
        backUrl: '/finance/',
        onBackClick: null,
        showCreateButton: 'block',
        createButtonText: 'Yeni Liste',
        onCreateClick: () => ctx.modals.openListForm({ mode: 'create', onSaved: (list) => navigate({ view: 'detail', listId: list.id }) }),
        showRefreshButton: 'block',
        onRefreshClick: () => views.lists.load(),
    }),
    pool: () => ({
        title: 'Ödeme Havuzu',
        subtitle: 'Ödenmemiş sipariş taksitleri — listeye ekle, böl, proforma yükle, toplu ödendi işaretle',
        icon: 'water',
        showBackButton: 'block',
        backUrl: null,
        onBackClick: () => navigate({ view: 'lists' }),
        showCreateButton: 'none',
        onCreateClick: null,
        showRefreshButton: 'block',
        onRefreshClick: () => views.pool.load(),
    }),
};

function applyRoute(route) {
    ctx.state.view = route.view;
    document.querySelectorAll('#pl-view-switcher [data-pl-view]').forEach((btn) => {
        const active = btn.dataset.plView === (route.view === 'detail' ? 'lists' : route.view);
        btn.classList.toggle('active', active);
    });
    const hint = document.getElementById('pl-switcher-hint');
    if (hint) hint.textContent = route.view === 'pool' ? 'Varsayılan filtre: Peşin / Avans taksitleri' : '';

    Object.entries(views).forEach(([name, view]) => {
        if (name !== route.view) view.hide();
    });
    if (route.view === 'detail') {
        views.detail.show(route.listId);
    } else {
        setHeader(HEADERS[route.view]());
        views[route.view].show();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    try {
        ctx.user = await getUser();
    } catch (_) {
        ctx.user = null;
    }

    ctx.confirm = new ConfirmationModal('pl-confirm-modal-container');
    ctx.modals = initModals(ctx);
    views = {
        lists: createListsView(ctx),
        detail: createDetailView(ctx),
        pool: createPoolView(ctx),
    };

    document.querySelectorAll('#pl-view-switcher [data-pl-view]').forEach((btn) => {
        btn.addEventListener('click', () => navigate({ view: btn.dataset.plView }));
    });
    window.addEventListener('popstate', () => applyRoute(readRoute()));

    applyRoute(readRoute());
});
