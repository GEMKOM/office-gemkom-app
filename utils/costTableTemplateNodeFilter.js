import {
    listOfferTemplates,
    getOfferTemplate,
    searchOfferTemplateNodes
} from '../apis/sales/offerTemplates.js';

/** Currently selected offer template id (for catalog search scoping). */
let activeOfferTemplateId = null;

function extractList(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    return data.results || data.data || data.nodes || [];
}

function nodeTitle(node) {
    return (node.title_override || node.title || node.resolved_title || `Node #${node.id}`).trim();
}

function formatNodeSearchLabel(node) {
    const title = nodeTitle(node);
    const path = node.path_display || node.breadcrumb || node.full_path;
    if (path && path !== title) return `${path}`;
    const templateName = node.template_name || node.template_display;
    if (templateName && templateName !== title) return `${title} (${templateName})`;
    return title;
}

function formatNodeOptionLabel(node, prefix) {
    const title = nodeTitle(node);
    const desc = node.description ? ` — ${node.description}` : '';
    const label = prefix ? `${prefix} › ${title}` : `${title}${desc}`;
    return { value: String(node.id), label };
}

/** Root nodes from template detail (children loaded via search or expand in catalog UI). */
async function fetchRootTemplateNodeOptions(templateId) {
    const id = parseInt(templateId, 10);
    if (Number.isNaN(id)) return [];

    const template = await getOfferTemplate(id);
    const roots = template.root_nodes || extractList(template.nodes);
    return (roots || []).map((node) => formatNodeOptionLabel(node, ''));
}

export async function fetchOfferTemplateFilterOptions() {
    const data = await listOfferTemplates();
    const list = extractList(data);
    return [
        { value: '', label: 'Tümü' },
        ...list.map((t) => ({
            value: String(t.id),
            label: t.name || t.title || `Şablon #${t.id}`
        }))
    ];
}

/** Build cost_table ?template_node= query value from multi-select filter. */
export function buildTemplateNodeQueryParam(templateNodeValue) {
    const arr = Array.isArray(templateNodeValue)
        ? templateNodeValue
        : (templateNodeValue ? String(templateNodeValue).split(',').map((s) => s.trim()) : []);
    const ids = arr.filter(Boolean);
    return ids.length ? ids.join(',') : undefined;
}

export async function onOfferTemplateFilterChange(filtersComponent, templateId) {
    activeOfferTemplateId = templateId ? String(templateId) : null;

    const nodeDropdown = filtersComponent.dropdowns?.get('template_node');
    if (nodeDropdown) {
        nodeDropdown.setValue([]);
    }
    filtersComponent.setFilterValues({ template_node: [] });

    if (!activeOfferTemplateId) {
        filtersComponent.updateFilterOptions('template_node', []);
        return;
    }

    try {
        const nodeOptions = await fetchRootTemplateNodeOptions(activeOfferTemplateId);
        filtersComponent.updateFilterOptions('template_node', nodeOptions);
    } catch (err) {
        console.error('Error loading template nodes for filter:', err);
        filtersComponent.updateFilterOptions('template_node', []);
    }
}

function buildTemplateNodeRemoteSearch() {
    return async (term) => {
        if (!activeOfferTemplateId) return [];
        const q = (term || '').trim();
        if (q.length < 2) return [];

        try {
            const res = await searchOfferTemplateNodes(q, { template: activeOfferTemplateId });
            const list = extractList(res);
            return list.map((node) => ({
                value: String(node.id),
                text: formatNodeSearchLabel(node)
            }));
        } catch (err) {
            console.warn('Template node search failed:', err);
            return [];
        }
    };
}

/**
 * Add template + catalog item filters (templates loaded before render).
 */
export async function addCostTableTemplateNodeFilters(filtersComponent) {
    const templateOptions = await fetchOfferTemplateFilterOptions();

    filtersComponent.addDropdownFilter({
        id: 'offer_template',
        label: 'Teklif Şablonu',
        options: templateOptions,
        placeholder: 'Tümü',
        colSize: 2,
        searchable: true,
        multiple: false,
        value: ''
    });

    filtersComponent.addDropdownFilter({
        id: 'template_node',
        label: 'Katalog Kalemi',
        options: [],
        placeholder: 'Önce şablon seçin',
        colSize: 3,
        searchable: true,
        multiple: true,
        minSearchLength: 2,
        remoteSearchPlaceholder: 'Ayrıca arama yapabilirsiniz (min 2 karakter)',
        remoteSearch: buildTemplateNodeRemoteSearch()
    });
}
