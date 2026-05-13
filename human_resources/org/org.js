import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { OrganizationTree } from '../../components/organization-tree/organization-tree.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import {
    fetchPositionTree,
    fetchPositionById,
    fetchPositionHolders
} from '../../apis/human_resources/organization.js';
import { showNotification } from '../../components/notification/notification.js';

const DEPT_CODE_MAP = new Map([
    ['machining',          'Talaşlı İmalat'],
    ['design',             'Dizayn'],
    ['logistics',          'Lojistik'],
    ['procurement',        'Satın Alma'],
    ['welding',            'Kaynaklı İmalat'],
    ['planning',           'Planlama'],
    ['manufacturing',      'İmalat'],
    ['maintenance',        'Bakım'],
    ['rollingmill',        'Haddehane'],
    ['qualitycontrol',     'Kalite Kontrol'],
    ['cutting',            'CNC Kesim'],
    ['warehouse',          'Ambar'],
    ['finance',            'Finans'],
    ['management',         'Yönetim'],
    ['external_workshops', 'Dış Atölyeler'],
    ['human_resources',    'İnsan Kaynakları'],
    ['sales',              'Proje Taahhüt'],
    ['accounting',         'Muhasebe'],
]);

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function listFromResponse(data) {
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.results) ? data.results : [];
}

let treeComp = null;

function computeStats(nodes) {
    let positions = 0;
    let holders = 0;
    let vacant = 0;
    let maxDepth = 0;

    const walk = (list, depth) => {
        for (const n of list || []) {
            positions += 1;
            const c = Number(n.holder_count || 0);
            holders += c;
            if (c === 0) vacant += 1;
            maxDepth = Math.max(maxDepth, depth);
            if (Array.isArray(n.children) && n.children.length) {
                walk(n.children, depth + 1);
            }
        }
    };
    walk(nodes, 1);

    return { positions, holders, vacant, maxDepth };
}

function updateStats(stats) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };
    set('stat-positions', stats.positions);
    set('stat-holders', stats.holders);
    set('stat-vacant', stats.vacant);
    set('stat-depth', stats.maxDepth);
}

function clearDetail() {
    const el = document.getElementById('org-position-detail');
    if (!el) return;
    el.innerHTML = `
        <div class="text-muted text-center py-4">
            <i class="fas fa-mouse-pointer d-block mb-2 fs-3 text-secondary"></i>
            Detay görmek için ağaçtan bir pozisyon seçin.
        </div>
    `;
}

async function loadTree() {
    try {
        const nodes = await fetchPositionTree();
        const list = Array.isArray(nodes) ? nodes : [];
        treeComp.update(list);
        updateStats(computeStats(list));
    } catch (error) {
        showNotification(error?.message || 'Organizasyon ağacı yüklenemedi.', 'error');
    }
}

async function showPositionDetail(positionId) {
    const detailEl = document.getElementById('org-position-detail');
    if (!detailEl) return;
    detailEl.innerHTML = '<div class="text-muted py-3 text-center"><i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...</div>';

    try {
        const [position, holdersResp] = await Promise.all([
            fetchPositionById(positionId),
            fetchPositionHolders(positionId)
        ]);
        const holders = listFromResponse(holdersResp);
        const permissions = Array.isArray(position?.permission_codenames) ? position.permission_codenames : [];
        const holderCount = holders.length;
        const isVacant = holderCount === 0;

        const deptLabel = position?.department_code
            ? (DEPT_CODE_MAP.get(position.department_code) || position.department_code)
            : null;

        detailEl.innerHTML = `
            <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                <div>
                    <div class="org-detail__title">${escapeHtml(position?.title || '-')}</div>
                    <div class="org-detail__meta">
                        Seviye ${escapeHtml(position?.level || '-')}
                        ${deptLabel ? ` &middot; ${escapeHtml(deptLabel)}` : ''}
                        ${position?.parent_title ? ` &middot; Bağlı: ${escapeHtml(position.parent_title)}` : ''}
                    </div>
                </div>
                <span class="badge ${isVacant ? 'text-bg-secondary' : 'text-bg-primary'} fs-6">${holderCount}</span>
            </div>

            <div class="mb-3">
                <div class="org-detail__section-title">Mevcut Kullanıcılar</div>
                ${holders.length
                    ? `<ul class="ps-3 mb-0 org-detail__holders">${holders.map(h => `<li>${escapeHtml(h?.full_name || h?.username || '-')}</li>`).join('')}</ul>`
                    : '<div class="text-muted small">Atanmış kullanıcı yok (boş pozisyon).</div>'}
            </div>

            <div class="mb-3 org-detail__perms">
                <div class="org-detail__section-title">Yetkiler (${permissions.length})</div>
                ${permissions.length
                    ? `<div class="d-flex flex-wrap gap-1">${permissions.map(code => `<span class="badge">${escapeHtml(code)}</span>`).join('')}</div>`
                    : '<div class="text-muted small">Yetki tanımlı değil.</div>'}
            </div>

            <div class="d-grid gap-2">
                <a href="/human_resources/org/positions" class="btn btn-sm btn-outline-primary">
                    <i class="fas fa-cog me-1"></i>Pozisyon Yönetimine Git
                </a>
            </div>
        `;
    } catch (error) {
        detailEl.innerHTML = '<div class="text-danger py-3 text-center">Pozisyon detayı yüklenemedi.</div>';
        showNotification(error?.message || 'Pozisyon detayı yüklenemedi.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Organizasyon Şeması',
        subtitle: 'Ağaç görünümünde pozisyon hiyerarşisini ve boş koltukları inceleyin',
        icon: 'sitemap',
        showBackButton: 'block',
        showCreateButton: 'none',
        onBackClick: () => { window.location.href = '/human_resources'; }
    });

    treeComp = new OrganizationTree('org-tree-container', {
        nodes: [],
        onNodeClick: (nodeId) => showPositionDetail(nodeId),
        onRefresh: () => {
            clearDetail();
            loadTree();
        }
    });
    treeComp.render();

    await loadTree();
});
