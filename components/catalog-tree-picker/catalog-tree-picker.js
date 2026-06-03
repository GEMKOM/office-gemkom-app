import {
    listOfferTemplates,
    getOfferTemplate,
    getOfferTemplateNodeChildren,
    searchOfferTemplateNodes
} from '../../apis/sales/offerTemplates.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function extractList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    return data.results || data.data || data.children || data.nodes || [];
}

function nodeTitle(node) {
    return (node.title_override || node.title || node.resolved_title || `#${node.id}`).toString().trim();
}

/**
 * CatalogTreePicker
 * A slide-in side panel (offcanvas) for selecting catalog (template) nodes.
 * Template selector, search and a lazily-expandable multi-select tree all live
 * in one panel. Selections apply live (debounced) via the onChange callback.
 *
 * @param {Object} options
 * @param {string} [options.label]    - panel/field title
 * @param {Function} [options.onChange] - called with array of selected id strings
 */
export class CatalogTreePicker {
    constructor(options = {}) {
        this.options = options;
        this.label = options.label || 'Katalog Kalemi';

        // id -> label
        this.selected = new Map();

        // Tree state
        this.templates = [];
        this.templatesLoaded = false;
        this.activeTemplateId = '';
        this.rootNodes = [];
        this.childrenCache = new Map(); // nodeId -> child nodes
        this.expanded = new Set();
        this.loading = new Set();

        // Search state
        this.searchMode = false;
        this.searchResults = [];
        this.searchLoading = false;
        this.searchDebounce = null;

        this.applyDebounce = null;

        this.panel = null;
        this.offcanvas = null;
    }

    /* ── public API ─────────────────────────────────────────────── */

    getSelectedIds() {
        return Array.from(this.selected.keys());
    }

    getSelectedCount() {
        return this.selected.size;
    }

    clear() {
        this.selected.clear();
        if (this.panel) {
            this._renderTree();
            this._renderSelectedBar();
        }
    }

    async open() {
        this._ensurePanel();
        if (!this.templatesLoaded) {
            try {
                const data = await listOfferTemplates();
                this.templates = extractList(data);
            } catch (err) {
                console.error('Error loading templates:', err);
                this.templates = [];
            }
            this.templatesLoaded = true;
            this._renderTemplateSelect();
            // Auto-select when there is only one template, for speed.
            if (this.templates.length === 1) {
                this.templateSelectEl.value = String(this.templates[0].id);
                await this._onTemplateChange(this.templateSelectEl.value);
            }
        }
        this._renderSelectedBar();
        this.offcanvas.show();
        setTimeout(() => this.searchEl && this.searchEl.focus(), 250);
    }

    /* ── panel ──────────────────────────────────────────────────── */

    _ensurePanel() {
        if (this.panel) return;

        const wrap = document.createElement('div');
        wrap.className = 'offcanvas offcanvas-end ctp-panel';
        wrap.tabIndex = -1;
        wrap.innerHTML = `
            <div class="offcanvas-header">
                <h5 class="offcanvas-title"><i class="fas fa-sitemap text-primary me-2"></i>${escapeHtml(this.label)}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Kapat"></button>
            </div>
            <div class="ctp-controls">
                <select class="form-select form-select-sm ctp-template-select mb-2"></select>
                <div class="position-relative">
                    <input type="text" class="form-control form-control-sm ctp-search" placeholder="Kalem ara (min 2 karakter)..." />
                    <i class="fas fa-search ctp-search-icon"></i>
                </div>
                <div class="ctp-selected-bar"></div>
            </div>
            <div class="offcanvas-body">
                <div class="ctp-tree"></div>
            </div>
        `;
        document.body.appendChild(wrap);
        this.panel = wrap;
        this.offcanvas = new bootstrap.Offcanvas(wrap);

        this.templateSelectEl = wrap.querySelector('.ctp-template-select');
        this.searchEl = wrap.querySelector('.ctp-search');
        this.treeEl = wrap.querySelector('.ctp-tree');
        this.selectedBarEl = wrap.querySelector('.ctp-selected-bar');

        this.templateSelectEl.addEventListener('change', () => this._onTemplateChange(this.templateSelectEl.value));
        this.searchEl.addEventListener('input', (e) => this._onSearchInput(e.target.value));

        this._renderTemplateSelect();
        this._renderTree();
        this._renderSelectedBar();
    }

    _renderTemplateSelect() {
        if (!this.templateSelectEl) return;
        const opts = ['<option value="">Tüm şablonlarda ara / şablon seçin…</option>']
            .concat(this.templates.map(t => `<option value="${t.id}" ${String(t.id) === String(this.activeTemplateId) ? 'selected' : ''}>${escapeHtml(t.name || t.title || `Şablon #${t.id}`)}</option>`));
        this.templateSelectEl.innerHTML = opts.join('');
    }

    async _onTemplateChange(templateId) {
        this.activeTemplateId = templateId || '';
        this.rootNodes = [];
        this.childrenCache.clear();
        this.expanded.clear();

        if (this.searchMode) {
            // Re-run search scoped to the new template.
            this._onSearchInput(this.searchEl.value);
            return;
        }

        if (!this.activeTemplateId) {
            this._renderTree();
            return;
        }

        this.treeEl.innerHTML = this._loadingMarkup('Yükleniyor...');
        try {
            const template = await getOfferTemplate(parseInt(this.activeTemplateId, 10));
            this.rootNodes = template.root_nodes || extractList(template.nodes);
        } catch (err) {
            console.error('Error loading template nodes:', err);
            this.rootNodes = [];
        }
        this._renderTree();
    }

    _onSearchInput(value) {
        const q = (value || '').trim();
        if (this.searchDebounce) clearTimeout(this.searchDebounce);

        if (q.length < 2) {
            this.searchMode = false;
            this.searchResults = [];
            this._renderTree();
            return;
        }

        this.searchMode = true;
        this.searchLoading = true;
        this._renderTree();

        this.searchDebounce = setTimeout(async () => {
            try {
                const res = await searchOfferTemplateNodes(q, this.activeTemplateId ? { template: this.activeTemplateId } : {});
                this.searchResults = extractList(res);
            } catch (err) {
                console.warn('Catalog search failed:', err);
                this.searchResults = [];
            }
            this.searchLoading = false;
            this._renderTree();
        }, 300);
    }

    async _toggleExpand(nodeId) {
        const id = parseInt(nodeId, 10);
        if (this.expanded.has(id)) {
            this.expanded.delete(id);
            this._renderTree();
            return;
        }
        this.expanded.add(id);
        if (!this.childrenCache.has(id)) {
            this.loading.add(id);
            this._renderTree();
            try {
                const res = await getOfferTemplateNodeChildren(parseInt(this.activeTemplateId, 10), id);
                this.childrenCache.set(id, extractList(res));
            } catch (err) {
                console.error('Error loading children:', err);
                this.childrenCache.set(id, []);
            } finally {
                this.loading.delete(id);
            }
        }
        this._renderTree();
    }

    _toggleSelect(id, label, checked) {
        const key = String(id);
        if (checked) {
            this.selected.set(key, label);
        } else {
            this.selected.delete(key);
        }
        this._renderSelectedBar();
        this._scheduleApply();
    }

    _scheduleApply() {
        if (this.applyDebounce) clearTimeout(this.applyDebounce);
        this.applyDebounce = setTimeout(() => {
            if (typeof this.options.onChange === 'function') {
                this.options.onChange(this.getSelectedIds());
            }
        }, 450);
    }

    _searchLabel(node) {
        const title = nodeTitle(node);
        const path = node.path_display || node.breadcrumb || node.full_path;
        if (path && path !== title) return String(path);
        const tpl = node.template_name || node.template_display;
        return tpl ? `${title} (${tpl})` : title;
    }

    /* ── selected chips bar ─────────────────────────────────────── */

    _renderSelectedBar() {
        if (!this.selectedBarEl) return;
        if (this.selected.size === 0) {
            this.selectedBarEl.innerHTML = '';
            return;
        }
        const chips = Array.from(this.selected.entries())
            .map(([id, label]) => `
                <span class="ctp-chip" data-id="${escapeHtml(id)}">
                    <span class="ctp-chip-text" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
                    <button type="button" class="ctp-chip-remove" data-id="${escapeHtml(id)}" title="Kaldır">&times;</button>
                </span>
            `).join('');
        this.selectedBarEl.innerHTML = `
            <div class="ctp-selected-head">
                <span class="small text-muted">${this.selected.size} seçili</span>
                <button type="button" class="btn btn-link btn-sm p-0 ctp-clear-all">Tümünü temizle</button>
            </div>
            <div class="ctp-chips">${chips}</div>
        `;
        this.selectedBarEl.querySelector('.ctp-clear-all').addEventListener('click', () => {
            this.selected.clear();
            this._renderSelectedBar();
            this._renderTree();
            this._scheduleApply();
        });
        this.selectedBarEl.querySelectorAll('.ctp-chip-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selected.delete(btn.dataset.id);
                this._renderSelectedBar();
                this._renderTree();
                this._scheduleApply();
            });
        });
    }

    _loadingMarkup(text) {
        return `
            <div class="ctp-node-list">
                <div class="ctp-row ctp-loading-row">
                    <span class="ctp-chevron ctp-chevron-loading" aria-hidden="true"><i class="fas fa-spinner fa-spin"></i></span>
                    <span class="ctp-loading-text">${escapeHtml(text)}</span>
                </div>
            </div>
        `;
    }

    /* ── tree ───────────────────────────────────────────────────── */

    _renderTree() {
        if (!this.treeEl) return;

        if (this.searchMode) {
            if (this.searchLoading) {
                this.treeEl.innerHTML = this._loadingMarkup('Aranıyor...');
                return;
            }
            if (!this.searchResults.length) {
                this.treeEl.innerHTML = '<div class="ctp-empty">Sonuç bulunamadı.</div>';
                return;
            }
            this.treeEl.innerHTML = `<div class="ctp-node-list">${this.searchResults.map(n => this._renderLeafRow(n, this._searchLabel(n))).join('')}</div>`;
            this._bindRowEvents();
            return;
        }

        if (!this.activeTemplateId) {
            this.treeEl.innerHTML = '<div class="ctp-empty"><i class="fas fa-sitemap mb-2 d-block" style="font-size:1.5rem;opacity:.4"></i>Bir şablon seçin veya yukarıdan arama yapın.</div>';
            return;
        }
        if (!this.rootNodes.length) {
            this.treeEl.innerHTML = '<div class="ctp-empty">Bu şablonda kalem bulunmuyor.</div>';
            return;
        }

        this.treeEl.innerHTML = `<div class="ctp-node-list">${this._renderNodes(this.rootNodes, '')}</div>`;
        this._bindRowEvents();
    }

    _renderNodes(nodes, parentPath) {
        return (nodes || []).map(node => {
            const title = nodeTitle(node);
            const path = parentPath ? `${parentPath} › ${title}` : title;
            const childCount = node.children_count ?? (node.children?.length ?? 0);
            const hasChildren = childCount > 0;
            const isExpanded = this.expanded.has(node.id);
            const isLoading = this.loading.has(node.id);
            const isChecked = this.selected.has(String(node.id));
            const cached = this.childrenCache.get(node.id) || node.children || [];

            const chevron = hasChildren
                ? (isLoading
                    ? '<span class="ctp-chevron ctp-chevron-loading" aria-busy="true"><i class="fas fa-spinner fa-spin"></i></span>'
                    : `<button type="button" class="ctp-chevron" data-node-id="${node.id}"><i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}"></i></button>`)
                : '<span class="ctp-chevron-spacer"></span>';

            const countBadge = hasChildren && !isLoading
                ? `<span class="ctp-count-badge" title="Alt kalem sayısı">${childCount}</span>`
                : '';

            let childrenHtml = '';
            if (hasChildren && isExpanded && !isLoading) {
                if (cached.length) {
                    childrenHtml = `<div class="ctp-children">${this._renderNodes(cached, path)}</div>`;
                } else {
                    childrenHtml = '<div class="ctp-children"><div class="ctp-empty sm">Alt kalem yok.</div></div>';
                }
            }

            return `
                <div class="ctp-node">
                    <div class="ctp-row ${isChecked ? 'selected' : ''}">
                        ${chevron}
                        <label class="ctp-check">
                            <input type="checkbox" data-select-id="${node.id}" data-select-label="${escapeHtml(path)}" ${isChecked ? 'checked' : ''}>
                            <span class="ctp-node-title">${escapeHtml(title)}</span>
                            ${node.description ? `<span class="ctp-node-desc">${escapeHtml(node.description)}</span>` : ''}
                        </label>
                        ${countBadge}
                    </div>
                    ${childrenHtml}
                </div>
            `;
        }).join('');
    }

    _renderLeafRow(node, label) {
        const isChecked = this.selected.has(String(node.id));
        return `
            <div class="ctp-node">
                <div class="ctp-row ${isChecked ? 'selected' : ''}">
                    <span class="ctp-chevron-spacer"></span>
                    <label class="ctp-check">
                        <input type="checkbox" data-select-id="${node.id}" data-select-label="${escapeHtml(label)}" ${isChecked ? 'checked' : ''}>
                        <span class="ctp-node-title">${escapeHtml(label)}</span>
                    </label>
                </div>
            </div>
        `;
    }

    _bindRowEvents() {
        this.treeEl.querySelectorAll('.ctp-chevron').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._toggleExpand(btn.dataset.nodeId);
            });
        });
        this.treeEl.querySelectorAll('input[data-select-id]').forEach(cb => {
            cb.addEventListener('change', () => {
                this._toggleSelect(cb.dataset.selectId, cb.dataset.selectLabel, cb.checked);
                cb.closest('.ctp-row')?.classList.toggle('selected', cb.checked);
            });
        });
    }
}
