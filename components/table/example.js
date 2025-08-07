/**
 * Table Component Usage Examples
 * This file demonstrates various ways to use the TableComponent
 */

import { TableComponent } from './table.js';

// Example 1: Basic Table
function createBasicTable() {
    const basicTable = new TableComponent('basic-table', {
        title: 'Basit Tablo',
        columns: [
            { field: 'id', label: 'ID', sortable: true },
            { field: 'name', label: 'Ad', sortable: true },
            { field: 'email', label: 'E-posta', sortable: true },
            { field: 'status', label: 'Durum', sortable: true }
        ],
        data: [
            { id: 1, name: 'Ahmet Yılmaz', email: 'ahmet@example.com', status: 'active' },
            { id: 2, name: 'Fatma Demir', email: 'fatma@example.com', status: 'inactive' },
            { id: 3, name: 'Mehmet Kaya', email: 'mehmet@example.com', status: 'active' }
        ]
    });
}

// Example 2: Editable Table
function createEditableTable() {
    const editableTable = new TableComponent('editable-table', {
        title: 'Düzenlenebilir Tablo',
        columns: [
            { field: 'id', label: 'ID', sortable: true },
            { 
                field: 'name', 
                label: 'Ad', 
                sortable: true,
                editable: true,
                validate: (value) => value.length >= 2 ? true : 'En az 2 karakter olmalı'
            },
            { 
                field: 'email', 
                label: 'E-posta', 
                sortable: true,
                editable: true,
                validate: (value) => {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return emailRegex.test(value) ? true : 'Geçerli bir e-posta adresi girin';
                }
            },
            {
                field: 'status',
                label: 'Durum',
                type: 'select',
                options: [
                    { value: 'active', label: 'Aktif' },
                    { value: 'inactive', label: 'Pasif' },
                    { value: 'pending', label: 'Bekliyor' }
                ],
                formatter: (value) => {
                    const badges = {
                        'active': '<span class="status-badge completed">Aktif</span>',
                        'inactive': '<span class="status-badge pending">Pasif</span>',
                        'pending': '<span class="status-badge worked-on">Bekliyor</span>'
                    };
                    return badges[value] || value;
                },
                editable: true
            }
        ],
        data: [
            { id: 1, name: 'Ahmet Yılmaz', email: 'ahmet@example.com', status: 'active' },
            { id: 2, name: 'Fatma Demir', email: 'fatma@example.com', status: 'inactive' }
        ],
        editable: true,
        editableColumns: ['name', 'email', 'status'],
        onEdit: async (row, field, newValue, oldValue) => {
            console.log(`Updating ${field} from "${oldValue}" to "${newValue}" for row:`, row);
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        }
    });
}

// Example 3: Tasks Table (Similar to your current implementation)
function createTasksTable() {
    const tasksTable = new TableComponent('tasks-table', {
        title: 'Görev Listesi',
        columns: [
            {
                field: 'key',
                label: 'TI No',
                sortable: true,
                formatter: (value) => `<span class="task-key">${value}</span>`
            },
            {
                field: 'name',
                label: 'Ad',
                sortable: true,
                editable: true,
                validate: (value) => value.length >= 3 ? true : 'En az 3 karakter olmalı'
            },
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                editable: true
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: true,
                editable: true
            },
            {
                field: 'position_no',
                label: 'Poz No',
                sortable: true,
                editable: true
            },
            {
                field: 'quantity',
                label: 'Adet',
                type: 'number',
                formatter: (value) => `<span class="quantity-badge">${value}</span>`,
                editable: true,
                validate: (value) => value > 0 ? true : 'Adet 0\'dan büyük olmalı'
            },
            {
                field: 'machine_name',
                label: 'Makine',
                sortable: true,
                editable: true
            },
            {
                field: 'estimated_hours',
                label: 'Tahmini Saat',
                type: 'number',
                formatter: (value) => value ? `${value} saat` : 'Belirtilmemiş',
                editable: true,
                validate: (value) => value >= 0 ? true : 'Saat negatif olamaz'
            },
            {
                field: 'total_hours_spent',
                label: 'Harcanan Saat',
                type: 'number',
                formatter: (value) => `${value || 0} saat`
            },
            {
                field: 'finish_time',
                label: 'Bitmesi Planlanan Tarih',
                type: 'date',
                formatter: (value) => value ? new Date(value).toLocaleDateString('tr-TR') : 'Belirtilmemiş',
                editable: true
            },
            {
                field: 'status',
                label: 'Durum',
                type: 'select',
                options: [
                    { value: 'pending', label: 'Bekliyor' },
                    { value: 'active', label: 'Aktif' },
                    { value: 'completed', label: 'Tamamlandı' }
                ],
                formatter: (value, row) => {
                    if (row.completion_date) {
                        return '<span class="status-badge completed">Tamamlandı</span>';
                    } else if (row.total_hours_spent > 0) {
                        return '<span class="status-badge worked-on">Çalışıldı</span>';
                    } else {
                        return '<span class="status-badge pending">Bekliyor</span>';
                    }
                },
                editable: true
            }
        ],
        data: [
            {
                key: 'TI-001',
                name: 'Parça A İmalatı',
                job_no: 'JOB-2024-001',
                image_no: 'IMG-001',
                position_no: 'POS-001',
                quantity: 10,
                machine_name: 'CNC-01',
                estimated_hours: 8,
                total_hours_spent: 6,
                finish_time: '2024-12-31',
                status: 'active'
            },
            {
                key: 'TI-002',
                name: 'Parça B İmalatı',
                job_no: 'JOB-2024-002',
                image_no: 'IMG-002',
                position_no: 'POS-002',
                quantity: 5,
                machine_name: 'CNC-02',
                estimated_hours: 4,
                total_hours_spent: 4,
                finish_time: '2024-12-25',
                completion_date: '2024-12-20',
                status: 'completed'
            }
        ],
        editable: true,
        editableColumns: ['name', 'job_no', 'image_no', 'position_no', 'quantity', 'machine_name', 'estimated_hours', 'finish_time', 'status'],
        actions: [
            {
                key: 'view',
                label: 'Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => {
                    console.log('Viewing task:', row);
                    // Implement view functionality
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                visible: (row) => row.status !== 'completed',
                onClick: (row) => {
                    if (confirm('Bu görevi silmek istediğinizden emin misiniz?')) {
                        console.log('Deleting task:', row);
                        // Implement delete functionality
                    }
                }
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        totalItems: 100,
        sortable: true,
        onSort: (field, direction) => {
            console.log(`Sorting by ${field} in ${direction} direction`);
            // Implement sorting logic
        },
        onPageChange: (page) => {
            console.log(`Changing to page ${page}`);
            // Implement pagination logic
        },
        onEdit: async (row, field, newValue, oldValue) => {
            console.log(`Updating ${field} from "${oldValue}" to "${newValue}" for task:`, row);
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        },
        refreshable: true,
        onRefresh: () => {
            console.log('Refreshing tasks...');
            // Implement refresh logic
        },
        exportable: true,
        onExport: () => {
            console.log('Exporting tasks...');
            // Implement export logic
        }
    });
}

// Example 4: Read-only Table with Custom Actions
function createReadOnlyTable() {
    const readOnlyTable = new TableComponent('readonly-table', {
        title: 'Salt Okunur Tablo',
        columns: [
            { field: 'id', label: 'ID', sortable: true },
            { field: 'name', label: 'Ad', sortable: true },
            { field: 'department', label: 'Departman', sortable: true },
            { field: 'salary', label: 'Maaş', sortable: true, formatter: (value) => `₺${value.toLocaleString('tr-TR')}` },
            { field: 'hire_date', label: 'İşe Başlama', sortable: true, formatter: (value) => new Date(value).toLocaleDateString('tr-TR') }
        ],
        data: [
            { id: 1, name: 'Ahmet Yılmaz', department: 'Mühendislik', salary: 15000, hire_date: '2023-01-15' },
            { id: 2, name: 'Fatma Demir', department: 'İnsan Kaynakları', salary: 12000, hire_date: '2023-03-20' },
            { id: 3, name: 'Mehmet Kaya', department: 'Satış', salary: 18000, hire_date: '2022-11-10' }
        ],
        editable: false, // Read-only
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => {
                    alert(`Çalışan detayları: ${row.name} - ${row.department}`);
                }
            },
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    console.log('Edit employee:', row);
                    // Navigate to edit page or open modal
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => {
                    if (confirm(`${row.name} adlı çalışanı silmek istediğinizden emin misiniz?`)) {
                        console.log('Delete employee:', row);
                    }
                }
            }
        ],
        onRowClick: (row, index) => {
            console.log('Row clicked:', row);
            // Handle row selection
        }
    });
}

// Example 5: Table with Conditional Actions
function createConditionalActionsTable() {
    const conditionalTable = new TableComponent('conditional-table', {
        title: 'Koşullu İşlemler',
        columns: [
            { field: 'id', label: 'ID', sortable: true },
            { field: 'name', label: 'Ad', sortable: true },
            { field: 'status', label: 'Durum', sortable: true },
            { field: 'priority', label: 'Öncelik', sortable: true }
        ],
        data: [
            { id: 1, name: 'Görev A', status: 'pending', priority: 'high' },
            { id: 2, name: 'Görev B', status: 'in_progress', priority: 'medium' },
            { id: 3, name: 'Görev C', status: 'completed', priority: 'low' }
        ],
        actions: [
            {
                key: 'start',
                label: 'Başlat',
                icon: 'fas fa-play',
                class: 'btn-outline-success',
                visible: (row) => row.status === 'pending',
                onClick: (row) => {
                    console.log('Starting task:', row.name);
                    // Update status to 'in_progress'
                }
            },
            {
                key: 'pause',
                label: 'Duraklat',
                icon: 'fas fa-pause',
                class: 'btn-outline-warning',
                visible: (row) => row.status === 'in_progress',
                onClick: (row) => {
                    console.log('Pausing task:', row.name);
                    // Update status to 'paused'
                }
            },
            {
                key: 'complete',
                label: 'Tamamla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                visible: (row) => row.status === 'in_progress',
                onClick: (row) => {
                    console.log('Completing task:', row.name);
                    // Update status to 'completed'
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'pending',
                onClick: (row) => {
                    if (confirm(`${row.name} görevini silmek istediğinizden emin misiniz?`)) {
                        console.log('Deleting task:', row.name);
                    }
                }
            }
        ]
    });
}

// Initialize examples when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Uncomment the example you want to test
    // createBasicTable();
    // createEditableTable();
    // createTasksTable();
    // createReadOnlyTable();
    // createConditionalActionsTable();
});

// Export functions for use in other files
export {
    createBasicTable,
    createEditableTable,
    createTasksTable,
    createReadOnlyTable,
    createConditionalActionsTable
};
