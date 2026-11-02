/**
 * Yönetim Paneli — orchestrator.
 *
 * Flow: loadAll() = GET /reports/dashboard/ → render everything (slow-backed
 * widgets show 'hesaplanıyor' when null) → if meta.cache_state.slow is
 * missing/stale, GET ?block=slow (non-blocking, 202 → retry every 5 s, max 6)
 * and patch the slow widgets. The live strip polls ?block=live every 60 s.
 * Yenile = ?refresh=1 then ?block=slow&refresh=1.
 */
import { guardRoute } from '../../authService.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { showNotification } from '../../components/notification/notification.js';
import { getReportsDashboard } from '../../apis/reports/dashboard.js';
import { escapeHtml, stamp, shortDate, chip, hiddenMoneyBadge } from './render/util.js';
import { renderPillars, renderRagDots } from './render/pillars.js';
import { drawerFor } from './render/drawer.js';
import { renderLive } from './render/live.js';
import { renderDecisions, patchMine } from './render/decisions.js';
import { renderExceptions, bindExceptions } from './render/exceptions.js';
import { renderTrends, killCharts } from './render/charts.js';
import { renderYesterday } from './render/yesterday.js';

const LIVE_POLL_MS = 60_000;
const FULL_RELOAD_AFTER_MS = 10 * 60_000;
const SLOW_RETRY_MS = 5_000;
const SLOW_MAX_TRIES = 6;
const SLOW_SECTIONS = ['order_book', 'delivery', 'production', 'material', 'finance', 'people'];

const state = {
    payload: null,
    slowStatus: 'idle',     // idle | pending | done | failed | unavailable
    lastFullLoad: 0,
    seq: 0,
    liveSeq: 0,
    slowSeq: 0,
    offline: false,
    drawerPillar: null,
    liveTimer: null,
    slowRetryTimer: null,
};

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- boot */

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Yönetim Paneli',
        subtitle: 'Fabrikanın genel özeti · bu ay vs geçen ay · canlı şerit 60 sn',
        icon: 'tachometer-alt',
        showBackButton: 'block',
        backUrl: '/management',
        showRefreshButton: 'block',
        onRefreshClick: () => loadAll({ refresh: true }),
    });
    injectHeaderMeta();

    renderPillars($('dash-pillars'), null);
    renderLive($('dash-live'), undefined);
    renderExceptions($('dash-exceptions'), undefined, { loading: true });
    renderDecisions($('dash-decisions'), null, { loading: true });
    renderTrends($('dash-trends'), null);
    bindExceptions($('dash-exceptions'));
    bindPillarClicks();
    bindDrawer();

    renderYesterday($('dash-yesterday'));
    await loadAll({ refresh: false });
    startLivePolling();
});

window.addEventListener('beforeunload', () => {
    stopLivePolling();
    if (state.slowRetryTimer) clearTimeout(state.slowRetryTimer);
    killCharts();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopLivePolling();
        return;
    }
    if (state.payload && Date.now() - state.lastFullLoad > FULL_RELOAD_AFTER_MS) {
        loadAll({ refresh: false });
    } else {
        pollLive();
    }
    startLivePolling();
});

let orientationTimer = null;
window.addEventListener('orientationchange', () => {
    if (orientationTimer) clearTimeout(orientationTimer);
    orientationTimer = setTimeout(() => { if (state.payload) renderTrends($('dash-trends'), state.payload); }, 250);
});

/* ---------------------------------------------------------------- header */

function injectHeaderMeta() {
    const controls = document.querySelector('#header-placeholder .dashboard-controls');
    if (!controls || $('dash-header-meta')) return;
    const span = document.createElement('span');
    span.id = 'dash-header-meta';
    span.className = 'dash-header-meta';
    span.innerHTML = '<span id="dash-updated" class="dash-updated">Son güncelleme —</span><span id="dash-money-badge"></span><span id="dash-offline"></span>';
    controls.insertBefore(span, controls.firstChild);
}

function renderHeaderMeta() {
    const meta = (state.payload && state.payload.meta) || {};
    const upd = $('dash-updated');
    if (upd) upd.textContent = state.lastFullLoad ? `Son güncelleme ${stamp(new Date(state.lastFullLoad))}` : 'Son güncelleme —';
    const mb = $('dash-money-badge');
    if (mb) mb.innerHTML = state.payload && meta.money_visible === false ? hiddenMoneyBadge() : '';
    const off = $('dash-offline');
    if (off) off.innerHTML = state.offline ? chip('red', 'bağlantı yok', 'Son istek başarısız; önceki veriler gösteriliyor') : '';
}

function renderFooter() {
    const host = $('dash-footer');
    if (!host) return;
    const meta = (state.payload && state.payload.meta) || {};
    const fx = meta.fx || {};
    const kur = fx.rates_available === false ? 'Kur yok' : (fx.date ? `Kur ${shortDate(fx.date, true)}${fx.age_days !== null && fx.age_days !== undefined && Number(fx.age_days) > 1 ? ` (${Number(fx.age_days)} gün önce)` : ''}` : '');
    host.innerHTML = ['İş günü = Türkiye tatil takvimi', kur, 'DBS alımları sipariş tutarlarına dahil değil'].filter(Boolean).map(escapeHtml).join(' · ');
}

/* ---------------------------------------------------------------- full load */

function renderAll() {
    const p = state.payload;
    const sections = (p && p.sections) || {};
    const meta = (p && p.meta) || {};
    const errors = (p && p.errors) || {};
    renderHeaderMeta();
    renderRagDots($('dash-rag-dots'), meta);
    renderPillars($('dash-pillars'), state);
    renderLive($('dash-live'), sections.live === undefined ? null : sections.live, { errors, offline: state.offline });
    renderExceptions($('dash-exceptions'), sections.exceptions, { meta, errors, slowStatus: state.slowStatus });
    renderDecisions($('dash-decisions'), sections.decisions === undefined ? null : sections.decisions, { meta, errors });
    renderTrends($('dash-trends'), p);
    renderFooter();
    refreshDrawer();
}

/** Re-render only what the slow tier feeds (no chart rebuild). */
function renderSlowWidgets() {
    const p = state.payload;
    if (!p) return;
    renderPillars($('dash-pillars'), state);
    renderExceptions($('dash-exceptions'), (p.sections || {}).exceptions, { meta: p.meta || {}, errors: p.errors || {}, slowStatus: state.slowStatus });
    refreshDrawer();
}

async function loadAll({ refresh = false } = {}) {
    const seq = ++state.seq;
    const refreshBtn = $('refresh-btn');
    if (refreshBtn) refreshBtn.disabled = true;
    try {
        const data = await getReportsDashboard({ refresh });
        if (seq !== state.seq) return; // out of order → discard
        if (!data || !data.sections) throw new Error('Beklenmeyen yanıt');
        state.payload = data;
        state.lastFullLoad = Date.now();
        state.offline = false;
        const slowState = (data.meta && data.meta.cache_state && data.meta.cache_state.slow) || 'missing';
        const needSlow = refresh || slowState === 'missing' || slowState === 'stale';
        state.slowStatus = needSlow ? 'pending' : 'done';
        renderAll();
        if (needSlow) fetchSlow({ refresh, attempt: 1 });
    } catch (error) {
        if (seq !== state.seq) return;
        console.error('Dashboard load error:', error);
        showNotification(`Yönetim paneli yüklenemedi: ${error.message}`, 'error');
        state.offline = true;
        if (!state.payload) {
            renderErrorStates(error);
        } else {
            renderHeaderMeta();
            renderLive($('dash-live'), (state.payload.sections || {}).live || null, { errors: state.payload.errors || {}, offline: true });
        }
    } finally {
        if (refreshBtn && seq === state.seq) refreshBtn.disabled = false;
    }
}

function renderErrorStates(error) {
    const msg = `Veriler yüklenemedi: ${escapeHtml(error && error.message ? error.message : 'bilinmeyen hata')}`;
    const pillars = $('dash-pillars');
    if (pillars) {
        pillars.dataset.state = 'error';
        pillars.innerHTML = `<div class="dashboard-card compact dash-block dash-pillars-error"><div class="card-body"><div class="alert alert-danger mb-0"><i class="fas fa-triangle-exclamation me-2"></i>${msg}</div></div></div>`;
    }
    renderLive($('dash-live'), null, { errors: {}, offline: true });
    renderExceptions($('dash-exceptions'), null, { errors: { exceptions: 'bağlantı yok' }, slowStatus: 'failed' });
    renderDecisions($('dash-decisions'), null, { errors: { decisions: 'bağlantı yok' } });
    renderTrends($('dash-trends'), { sections: {}, errors: {} });
    renderHeaderMeta();
}

/* ---------------------------------------------------------------- slow tier */

function mergeSlow(data) {
    const p = state.payload;
    if (!p) return;
    p.sections = p.sections || {};
    p.errors = p.errors || {};
    // Drop the previous slow error keys; the new response carries the current ones.
    Object.keys(p.errors).forEach((k) => { if (k.startsWith('slow.')) delete p.errors[k]; });
    const incoming = (data && data.sections) || {};
    Object.entries(incoming).forEach(([sec, val]) => {
        if (sec === 'exceptions') {
            p.sections.exceptions = val === undefined ? null : val;
            return;
        }
        if (!val || typeof val !== 'object') return;
        if (SLOW_SECTIONS.includes(sec) && p.sections[sec] && typeof p.sections[sec] === 'object') {
            Object.assign(p.sections[sec], val);
        } else if (!p.sections[sec] && !p.errors[sec]) {
            p.sections[sec] = val;
        }
    });
    Object.entries((data && data.errors) || {}).forEach(([k, v]) => { p.errors[k] = v; });
    if (data && data.meta) {
        p.meta = p.meta || {};
        p.meta.cache_state = { ...(p.meta.cache_state || {}), ...((data.meta.cache_state) || {}) };
        if (data.meta.cache_state && data.meta.cache_state.overview) p.meta.cache_state.overview = data.meta.cache_state.overview;
    }
}

async function fetchSlow({ refresh = false, attempt = 1 } = {}) {
    const seq = ++state.slowSeq;
    if (state.slowRetryTimer) { clearTimeout(state.slowRetryTimer); state.slowRetryTimer = null; }
    state.slowStatus = 'pending';
    try {
        const data = await getReportsDashboard({ block: 'slow', refresh: refresh && attempt === 1 });
        if (seq !== state.slowSeq) return;
        if (data && data.status === 'building' && !data.sections) {
            if (attempt < SLOW_MAX_TRIES) {
                state.slowRetryTimer = setTimeout(() => fetchSlow({ refresh: false, attempt: attempt + 1 }), SLOW_RETRY_MS);
                return;
            }
            state.slowStatus = 'unavailable';
            renderSlowWidgets();
            return;
        }
        mergeSlow(data);
        state.slowStatus = 'done';
        renderSlowWidgets();
    } catch (error) {
        if (seq !== state.slowSeq) return;
        console.error('Dashboard slow tier error:', error);
        state.slowStatus = 'failed';
        renderSlowWidgets();
    }
}

/* ---------------------------------------------------------------- live poll */

function startLivePolling() {
    if (state.liveTimer) return;
    state.liveTimer = setInterval(pollLive, LIVE_POLL_MS);
}

function stopLivePolling() {
    if (state.liveTimer) clearInterval(state.liveTimer);
    state.liveTimer = null;
}

async function pollLive() {
    if (document.hidden || !state.payload) return;
    const seq = ++state.liveSeq;
    try {
        const data = await getReportsDashboard({ block: 'live' });
        if (seq !== state.liveSeq || !state.payload) return;
        const p = state.payload;
        p.sections = p.sections || {};
        p.errors = p.errors || {};
        const sec = (data && data.sections) || {};
        if ('live' in sec) {
            p.sections.live = sec.live;
            if (sec.live) delete p.errors.live;
        }
        if (data && data.errors && data.errors.live) p.errors.live = data.errors.live;
        if (sec.decisions && 'mine' in sec.decisions && p.sections.decisions && typeof p.sections.decisions === 'object') {
            p.sections.decisions.mine = sec.decisions.mine;
            patchMine($('dash-decisions'), sec.decisions.mine);
        }
        state.offline = false;
        renderHeaderMeta();
        renderLive($('dash-live'), p.sections.live === undefined ? null : p.sections.live, { errors: p.errors, offline: false });
    } catch (error) {
        if (seq !== state.liveSeq) return;
        console.warn('Live poll failed:', error && error.message ? error.message : error);
        state.offline = true;
        renderHeaderMeta();
        const p = state.payload;
        renderLive($('dash-live'), ((p && p.sections) || {}).live || null, { errors: (p && p.errors) || {}, offline: true });
    }
}

/* ---------------------------------------------------------------- drawer / dots */

function bindPillarClicks() {
    const pillars = $('dash-pillars');
    if (pillars) {
        pillars.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            const card = e.target.closest('.dash-pillar');
            if (card && card.dataset.pillar && card.dataset.state !== 'loading') openDrawer(card.dataset.pillar);
        });
        pillars.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const card = e.target.closest('.dash-pillar');
            if (!card || !card.dataset.pillar || card.dataset.state === 'loading') return;
            e.preventDefault();
            openDrawer(card.dataset.pillar);
        });
    }
    const dots = $('dash-rag-dots');
    if (dots) {
        dots.addEventListener('click', (e) => {
            const btn = e.target.closest('.dash-rag-dot');
            if (!btn) return;
            const card = $(`pillar-${btn.dataset.pillar}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('dash-pillar-flash');
                setTimeout(() => card.classList.remove('dash-pillar-flash'), 1200);
            }
        });
    }
}

function drawerInstance() {
    const host = $('dash-drawer');
    if (!host || !window.bootstrap || !window.bootstrap.Offcanvas) return null;
    return window.bootstrap.Offcanvas.getOrCreateInstance(host);
}

function bindDrawer() {
    const host = $('dash-drawer');
    if (!host) return;
    host.addEventListener('hidden.bs.offcanvas', () => { state.drawerPillar = null; });
}

function openDrawer(pillarId) {
    state.drawerPillar = pillarId;
    refreshDrawer();
    const oc = drawerInstance();
    if (oc) oc.show();
}

function refreshDrawer() {
    if (!state.drawerPillar) return;
    const { title, stamp: st, html } = drawerFor(state.drawerPillar, state);
    const t = $('dash-drawer-title');
    const s = $('dash-drawer-stamp');
    const b = $('dash-drawer-body');
    if (t) t.innerHTML = `<i class="fas fa-circle-question me-2"></i>${escapeHtml(title)} — Neden?`;
    if (s) s.textContent = st || '';
    if (b) { b.innerHTML = html; b.dataset.pillar = state.drawerPillar; }
}
