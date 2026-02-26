import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../components/notification/notification.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import {
    listOfferTemplates, getOfferTemplate,
    createOfferTemplate, patchOfferTemplate,
    createTemplateNode, patchTemplateNode, deleteTemplateNode
} from '../../apis/sales/offerTemplates.js';

let templates = [];
let selectedTemplateId = null;
let selectedTemplate = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Ürün Kataloğu',
        subtitle: 'Teklif şablonları ve ürün ağaçlarını yönetin',
        icon: 'book',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: '      Yeni Katalog',
        onBackClick: () => window.location.href = '/sales/',
        onCreateClick: () => showCreateTemplateModal()
    });

    await loadTemplates();
});

async function loadTemplates() {
    try {
        const data = await listOfferTemplates();
        templates = Array.isArray(data) ? data : (data.results || []);
        renderTemplatesList();
    } catch (error) {
        console.error('Error loading templates:', error);
        showNotification('Kataloglar yüklenirken hata oluştu', 'error');
    }
}

function renderTemplatesList() {
    const container = document.getElementById('templates-list');
    if (templates.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4"><p>Henüz katalog oluşturulmamış.</p></div>';
        return;
    }
    container.innerHTML = templates.map(t => `
        <div class="catalog-card ${t.id === selectedTemplateId ? 'selected' : ''}" data-template-id="${t.id}">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="mb-1">${t.name}</h6>
                    ${t.description ? `<small class="text-muted">${t.description}</small>` : ''}
                </div>
                <div>
                    <span class="badge bg-${t.is_active ? 'success' : 'secondary'}">${t.is_active ? 'Aktif' : 'Pasif'}</span>
                    <span class="badge bg-light text-dark ms-1">${t.node_count || 0} düğüm</span>
                </div>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.catalog-card').forEach(card => {
        card.addEventListener('click', () => selectTemplate(parseInt(card.dataset.templateId)));
    });
}

async function selectTemplate(id) {
    selectedTemplateId = id;
    renderTemplatesList();

    const panel = document.getElementById('tree-panel');
    panel.innerHTML = '<div class="tree-panel"><div class="text-center py-4"><div class="spinner-border text-primary"></div></div></div>';

    try {
        selectedTemplate = await getOfferTemplate(id);
        renderTree();
    } catch (error) {
        panel.innerHTML = '<div class="tree-panel"><div class="alert alert-danger">Katalog yüklenemedi.</div></div>';
    }
}

function renderTree() {
    const panel = document.getElementById('tree-panel');
    const nodes = selectedTemplate.root_nodes || [];

    let html = `
        <div class="tree-panel">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="mb-0">${selectedTemplate.name}</h5>
                <div>
                    <button class="btn btn-sm btn-outline-primary" id="edit-template-btn"><i class="fas fa-edit me-1"></i>Düzenle</button>
                    <button class="btn btn-sm btn-success" id="add-root-node-btn"><i class="fas fa-plus me-1"></i>Düğüm Ekle</button>
                </div>
            </div>
    `;

    if (nodes.length === 0) {
        html += '<div class="text-center text-muted py-4"><p>Bu katalogda henüz düğüm yok.</p></div>';
    } else {
        html += renderNodes(nodes);
    }

    html += '</div>';
    panel.innerHTML = html;

    document.getElementById('edit-template-btn')?.addEventListener('click', showEditTemplateModal);
    document.getElementById('add-root-node-btn')?.addEventListener('click', () => showNodeModal(null));

    panel.querySelectorAll('.add-child-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showNodeModal(parseInt(btn.dataset.parentId));
        });
    });
    panel.querySelectorAll('.edit-node-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditNodeModal(parseInt(btn.dataset.nodeId));
        });
    });
    panel.querySelectorAll('.delete-node-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Bu düğümü ve alt düğümlerini silmek istediğinize emin misiniz?')) return;
            try {
                await deleteTemplateNode(selectedTemplateId, parseInt(btn.dataset.nodeId));
                showNotification('Düğüm silindi', 'success');
                await selectTemplate(selectedTemplateId);
            } catch (_) { showNotification('Silme hatası', 'error'); }
        });
    });
}

function renderNodes(nodes) {
    return nodes.map(node => {
        const children = node.children && node.children.length > 0
            ? `<div class="tree-children">${renderNodes(node.children)}</div>` : '';
        return `
            <div class="tree-node-item">
                <i class="fas fa-${node.children && node.children.length > 0 ? 'folder text-warning' : 'file text-primary'}"></i>
                <span class="flex-grow-1">${node.title}</span>
                <span class="badge bg-light text-dark">#${node.sequence || ''}</span>
                <div class="node-actions">
                    <button class="btn btn-sm btn-outline-primary add-child-btn" data-parent-id="${node.id}" title="Alt düğüm ekle"><i class="fas fa-plus"></i></button>
                    <button class="btn btn-sm btn-outline-secondary edit-node-btn" data-node-id="${node.id}" title="Düzenle"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-node-btn" data-node-id="${node.id}" title="Sil"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            ${children}
        `;
    }).join('');
}

function showCreateTemplateModal() {
    const modal = new EditModal('create-template-modal-container', {
        title: 'Yeni Katalog Oluştur', icon: 'fas fa-plus-circle', size: 'md', showEditButton: false
    });
    modal.clearAll();
    modal.addSection({ title: 'Katalog Bilgileri', icon: 'fas fa-book', iconColor: 'text-primary' });
    modal.addField({ id: 'name', name: 'name', label: 'Katalog Adı', type: 'text', required: true, placeholder: 'Ör: MELTSHOP EQUIPMENT', icon: 'fas fa-heading', colSize: 12 });
    modal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', placeholder: 'Katalog açıklaması', icon: 'fas fa-align-left', colSize: 12 });
    modal.addField({ id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', value: true, icon: 'fas fa-check', colSize: 12 });

    modal.onSaveCallback(async (formData) => {
        try {
            await createOfferTemplate(formData);
            modal.hide();
            showNotification('Katalog oluşturuldu', 'success');
            await loadTemplates();
        } catch (e) { showNotification('Oluşturma hatası', 'error'); }
    });
    modal.render();
    modal.show();
}

function showEditTemplateModal() {
    const modal = new EditModal('create-template-modal-container', {
        title: 'Kataloğu Düzenle', icon: 'fas fa-edit', size: 'md', showEditButton: false
    });
    modal.clearAll();
    modal.addSection({ title: 'Katalog Bilgileri', icon: 'fas fa-book', iconColor: 'text-primary' });
    modal.addField({ id: 'name', name: 'name', label: 'Katalog Adı', type: 'text', required: true, value: selectedTemplate.name, icon: 'fas fa-heading', colSize: 12 });
    modal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', value: selectedTemplate.description || '', icon: 'fas fa-align-left', colSize: 12 });
    modal.addField({ id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', value: selectedTemplate.is_active, icon: 'fas fa-check', colSize: 12 });

    modal.onSaveCallback(async (formData) => {
        try {
            await patchOfferTemplate(selectedTemplateId, formData);
            modal.hide();
            showNotification('Katalog güncellendi', 'success');
            await loadTemplates();
            await selectTemplate(selectedTemplateId);
        } catch (e) { showNotification('Güncelleme hatası', 'error'); }
    });
    modal.render();
    modal.show();
}

function showNodeModal(parentId) {
    const modal = new EditModal('node-modal-container', {
        title: parentId ? 'Alt Düğüm Ekle' : 'Kök Düğüm Ekle', icon: 'fas fa-plus', size: 'md', showEditButton: false
    });
    modal.clearAll();
    modal.addSection({ title: 'Düğüm Bilgileri', icon: 'fas fa-sitemap', iconColor: 'text-primary' });
    modal.addField({ id: 'title', name: 'title', label: 'Başlık', type: 'text', required: true, placeholder: 'Ör: Weighing Belt Conveyor', icon: 'fas fa-heading', colSize: 12 });
    modal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', icon: 'fas fa-align-left', colSize: 12 });
    modal.addField({ id: 'sequence', name: 'sequence', label: 'Sıra', type: 'number', value: '1', icon: 'fas fa-sort-numeric-up', colSize: 6 });
    modal.addField({ id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', value: true, icon: 'fas fa-check', colSize: 6 });

    modal.onSaveCallback(async (formData) => {
        try {
            formData.parent = parentId;
            formData.sequence = parseInt(formData.sequence) || 1;
            await createTemplateNode(selectedTemplateId, formData);
            modal.hide();
            showNotification('Düğüm eklendi', 'success');
            await selectTemplate(selectedTemplateId);
        } catch (e) { showNotification('Ekleme hatası', 'error'); }
    });
    modal.render();
    modal.show();
}

function showEditNodeModal(nodeId) {
    const node = findNode(selectedTemplate.root_nodes, nodeId);
    if (!node) return;

    const modal = new EditModal('node-modal-container', {
        title: 'Düğümü Düzenle', icon: 'fas fa-edit', size: 'md', showEditButton: false
    });
    modal.clearAll();
    modal.addSection({ title: 'Düğüm Bilgileri', icon: 'fas fa-sitemap', iconColor: 'text-primary' });
    modal.addField({ id: 'title', name: 'title', label: 'Başlık', type: 'text', required: true, value: node.title, icon: 'fas fa-heading', colSize: 12 });
    modal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', value: node.description || '', icon: 'fas fa-align-left', colSize: 12 });
    modal.addField({ id: 'sequence', name: 'sequence', label: 'Sıra', type: 'number', value: String(node.sequence || 1), icon: 'fas fa-sort-numeric-up', colSize: 6 });
    modal.addField({ id: 'is_active', name: 'is_active', label: 'Aktif', type: 'checkbox', value: node.is_active !== false, icon: 'fas fa-check', colSize: 6 });

    modal.onSaveCallback(async (formData) => {
        try {
            formData.sequence = parseInt(formData.sequence) || 1;
            await patchTemplateNode(selectedTemplateId, nodeId, formData);
            modal.hide();
            showNotification('Düğüm güncellendi', 'success');
            await selectTemplate(selectedTemplateId);
        } catch (e) { showNotification('Güncelleme hatası', 'error'); }
    });
    modal.render();
    modal.show();
}

function findNode(nodes, id) {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
        }
    }
    return null;
}
