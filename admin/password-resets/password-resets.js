// admin/password-resets/password-resets.js
import { initNavbar } from '../../../components/navbar.js';
import { isAdmin } from '../../../authService.js';
import { TableComponent } from '../../../components/table/table.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { listPasswordResetRequests, adminResetUserPassword } from '../../../generic/users.js';

// Initialize password resets page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check if user is admin/superuser
        if (!isAdmin()) {
            console.error('Admin access denied');
            alert('Bu sayfaya erişim yetkiniz bulunmamaktadır. Sadece yöneticiler admin paneline erişebilir.');
            window.location.href = '../../../login/';
            return;
        }

        // Initialize navbar
        await initNavbar();

        // Initialize header component
        initializeHeader();

        // Initialize table component
        await initializeTable();

    } catch (error) {
        console.error('Password resets page initialization error:', error);
        window.location.href = '../../../login/';
    }
});

// Initialize header component
function initializeHeader() {
    const headerComponent = new HeaderComponent({
        title: 'Şifre Sıfırlama Talepleri',
        subtitle: 'Kullanıcı şifre sıfırlama taleplerini görüntüleyin ve yönetin',
        icon: 'fa-key',
        containerId: 'header-container',
        showBackButton: 'block',
        showCreateButton: 'none',
        showBulkCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        backUrl: '../',
        onBackClick: () => {
            window.location.href = '../';
        },
        onRefreshClick: () => {
            if (window.passwordResetsTable) {
                loadPasswordResetsData();
            }
        }
    });
}

// Initialize table component
async function initializeTable() {
    const tableContainer = document.getElementById('table-container');
    
    if (!tableContainer) {
        console.error('Table container not found');
        return;
    }

    try {
        // Define table columns
        const columns = [
            {
                field: 'username',
                label: 'Kullanıcı Adı',
                sortable: true,
                width: '15%'
            },
            {
                field: 'first_name',
                label: 'Ad',
                sortable: true,
                width: '15%'
            },
            {
                field: 'last_name',
                label: 'Soyad',
                sortable: true,
                width: '15%'
            },
            {
                field: 'email',
                label: 'E-posta',
                sortable: true,
                width: '20%'
            },
            {
                field: 'team',
                label: 'Takım',
                sortable: true,
                width: '10%'
            }
        ];

        // Define table actions
        const actions = [
            {
                title: 'Şifreyi Sıfırla',
                icon: 'fas fa-key',
                class: 'btn btn-sm btn-warning',
                onClick: async (row) => {
                    if (confirm(`${row.username} kullanıcısının şifresini sıfırlamak istediğinizden emin misiniz?`)) {
                        try {
                            const response = await adminResetUserPassword(row.id);
                            if (response.ok) {
                                const data = await response.json();
                                alert(`Şifre başarıyla sıfırlandı. Yeni geçici şifre: ${data.temp_password}`);
                                // Refresh table
                                await loadPasswordResetsData();
                            } else {
                                const errorData = await response.json().catch(() => ({}));
                                alert(`Hata: ${errorData.detail || 'Şifre sıfırlanamadı'}`);
                            }
                        } catch (error) {
                            console.error('Password reset error:', error);
                            alert('Şifre sıfırlanırken hata oluştu');
                        }
                    }
                }
            }
        ];

        // Create table component
        window.passwordResetsTable = new TableComponent('table-container', {
            columns: columns,
            data: [],
            actions: actions,
            sortable: true,
            pagination: false,
            tableClass: 'table table-hover',
            responsive: true,
            striped: true,
            emptyMessage: 'Şifre sıfırlama talebi bulunamadı',
            emptyIcon: 'fas fa-key',
            loading: true
        });

        // Load initial data
        await loadPasswordResetsData();

    } catch (error) {
        console.error('Error initializing table:', error);
        tableContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle me-2"></i>
                Tablo yüklenirken hata oluştu: ${error.message}
            </div>
        `;
    }
}

// Load password resets data
async function loadPasswordResetsData() {
    try {
        if (window.passwordResetsTable) {
            window.passwordResetsTable.setLoading(true);
        }
        
        const data = await listPasswordResetRequests();
        
        if (window.passwordResetsTable) {
            window.passwordResetsTable.updateData(data);
            window.passwordResetsTable.setLoading(false);
        }
    } catch (error) {
        console.error('Error loading password reset requests:', error);
        if (window.passwordResetsTable) {
            window.passwordResetsTable.setLoading(false);
            window.passwordResetsTable.updateData([]);
        }
    }
}
