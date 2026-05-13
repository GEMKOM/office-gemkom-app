/**
 * OrganizationTree
 * A clean centered hierarchical org-chart component.
 *
 * Features:
 *  - Recursive rendering of nested {id, title, level, department_code, holder_count, children:[]} nodes
 *  - Toolbar (search, expand all, collapse all, refresh)
 *  - Collapse / expand of subtrees (chevron on each card with children)
 *  - Search dim/match highlight by node title
 *  - Vacant seat styling (holder_count === 0)
 *  - Department color accents
 *  - onNodeClick(nodeId) callback + selectNode(id) imperative API
 */

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stringHash(input) {
    let hash = 0;
    const text = String(input || '');
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function departmentColor(departmentCode) {
    if (!departmentCode) return 'transparent';
    const palette = [
        '#0d6efd', '#6f42c1', '#20c997', '#dc3545',
        '#fd7e14', '#198754', '#0dcaf0', '#6610f2',
        '#d97706', '#0891b2'
    ];
    return palette[stringHash(departmentCode) % palette.length];
}

export class OrganizationTree {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.options = {
            nodes: [],
            emptyMessage: 'Organizasyon ağacı bulunamadı.',
            onNodeClick: null,
            onRefresh: null,
            showToolbar: true,
            ...options
        };

        this.collapsed = new Set();
        this.selectedId = null;
        this.searchTerm = '';
    }

    update(nodes = []) {
        this.options.nodes = Array.isArray(nodes) ? nodes : [];
        this.render();
    }

    selectNode(nodeId) {
        this.selectedId = nodeId == null ? null : Number(nodeId);
        if (!this.container) return;
        this.container.querySelectorAll('.org-card.is-selected').forEach(el => el.classList.remove('is-selected'));
        if (this.selectedId != null) {
            const el = this.container.querySelector(`.org-card[data-node-id="${this.selectedId}"]`);
            if (el) el.classList.add('is-selected');
        }
    }

    expandAll() {
        this.collapsed.clear();
        this.render();
    }

    collapseAll() {
        const collect = (nodes) => {
            for (const n of nodes || []) {
                if (Array.isArray(n.children) && n.children.length) {
                    this.collapsed.add(Number(n.id));
                    collect(n.children);
                }
            }
        };
        this.collapsed.clear();
        collect(this.options.nodes);
        // keep root expanded for usability
        for (const n of this.options.nodes) {
            this.collapsed.delete(Number(n.id));
        }
        this.render();
    }

    render() {
        if (!this.container) return;
        const nodes = Array.isArray(this.options.nodes) ? this.options.nodes : [];
        const toolbar = this.options.showToolbar ? this.renderToolbar() : '';

        if (!nodes.length) {
            this.container.innerHTML = `
                <div class="org-chart">
                    ${toolbar}
                    <div class="org-chart__empty">${escapeHtml(this.options.emptyMessage)}</div>
                </div>
            `;
            this.attachToolbarEvents();
            return;
        }

        this.container.innerHTML = `
            <div class="org-chart">
                ${toolbar}
                <div class="org-chart__viewport">
                    <div class="org-chart__canvas">
                        ${this.renderLevel(nodes, true)}
                    </div>
                </div>
            </div>
        `;
        this.attachToolbarEvents();
        this.attachCardEvents();
        this.applySearchHighlight();
        if (this.selectedId != null) this.selectNode(this.selectedId);
    }

    renderToolbar() {
        return `
            <div class="org-chart__toolbar">
                <div class="input-group input-group-sm org-chart__search">
                    <span class="input-group-text bg-white"><i class="fas fa-search text-muted"></i></span>
                    <input type="text" class="form-control" placeholder="Pozisyon ara..." data-org-action="search" value="${escapeHtml(this.searchTerm)}">
                </div>
                <div class="ms-auto d-flex gap-1">
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-org-action="expand-all" title="Tümünü Aç">
                        <i class="fas fa-expand-arrows-alt"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-org-action="collapse-all" title="Tümünü Kapat">
                        <i class="fas fa-compress-arrows-alt"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-org-action="refresh" title="Yenile">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }

    renderLevel(nodes = [], isRoot = false) {
        const items = nodes.map(node => this.renderNode(node)).join('');
        const rootClass = isRoot ? ' org-chart__tree--root' : '';
        return `<ul class="org-chart__tree${rootClass}">${items}</ul>`;
    }

    renderNode(node) {
        const id = Number(node?.id);
        const children = Array.isArray(node?.children) ? node.children : [];
        const hasChildren = children.length > 0;
        const isCollapsed = hasChildren && this.collapsed.has(id);
        const holderCount = Number(node?.holder_count || 0);
        const isVacant = holderCount === 0;
        const deptCode = node?.department_code || '';
        const deptColor = departmentColor(deptCode);
        const cardClass = `org-card${isVacant ? ' org-card--vacant' : ''}`;

        const toggleBtn = hasChildren
            ? `<span class="org-card__toggle" data-org-action="toggle" data-node-id="${id}" title="${isCollapsed ? 'Aç' : 'Kapat'}">
                   <i class="fas ${isCollapsed ? 'fa-plus' : 'fa-minus'}"></i>
               </span>`
            : '';

        return `
            <li class="org-chart__node">
                <div class="${cardClass}"
                     data-node-id="${id}"
                     data-node-title="${escapeHtml(node?.title || '')}"
                     style="--org-dept-color:${deptColor}">
                    ${deptColor !== 'transparent' ? '<span class="org-card__accent"></span>' : ''}
                    <span class="org-card__badge" title="Atanmış kullanıcı sayısı">${holderCount}</span>
                    <div class="org-card__title">${escapeHtml(node?.title || '-')}</div>
                    <div class="org-card__sub">
                        <span class="org-card__pill"><span class="dot"></span>${escapeHtml(deptCode || 'genel')}</span>
                        <span class="org-card__pill">L${escapeHtml(node?.level || '-')}</span>
                    </div>
                    ${toggleBtn}
                </div>
                ${hasChildren && !isCollapsed ? this.renderLevel(children) : ''}
            </li>
        `;
    }

    attachToolbarEvents() {
        const search = this.container.querySelector('[data-org-action="search"]');
        if (search) {
            search.addEventListener('input', (e) => {
                this.searchTerm = String(e.target.value || '').trim();
                this.applySearchHighlight();
            });
        }
        const expandBtn = this.container.querySelector('[data-org-action="expand-all"]');
        if (expandBtn) expandBtn.addEventListener('click', () => this.expandAll());
        const collapseBtn = this.container.querySelector('[data-org-action="collapse-all"]');
        if (collapseBtn) collapseBtn.addEventListener('click', () => this.collapseAll());
        const refreshBtn = this.container.querySelector('[data-org-action="refresh"]');
        if (refreshBtn && typeof this.options.onRefresh === 'function') {
            refreshBtn.addEventListener('click', () => this.options.onRefresh());
        }
    }

    attachCardEvents() {
        this.container.querySelectorAll('[data-org-action="toggle"]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(el.getAttribute('data-node-id'));
                if (this.collapsed.has(id)) this.collapsed.delete(id);
                else this.collapsed.add(id);
                this.render();
            });
        });

        this.container.querySelectorAll('.org-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-org-action="toggle"]')) return;
                const id = Number(card.getAttribute('data-node-id'));
                if (!Number.isFinite(id)) return;
                this.selectNode(id);
                if (typeof this.options.onNodeClick === 'function') {
                    this.options.onNodeClick(id);
                }
            });
        });
    }

    applySearchHighlight() {
        if (!this.container) return;
        const term = this.searchTerm.toLowerCase();
        const cards = this.container.querySelectorAll('.org-card');
        if (!term) {
            cards.forEach(c => {
                c.classList.remove('is-dimmed');
                c.classList.remove('is-match');
            });
            return;
        }
        cards.forEach(c => {
            const title = String(c.getAttribute('data-node-title') || '').toLowerCase();
            if (title.includes(term)) {
                c.classList.add('is-match');
                c.classList.remove('is-dimmed');
            } else {
                c.classList.add('is-dimmed');
                c.classList.remove('is-match');
            }
        });
    }
}
