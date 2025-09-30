// admin/password-resets/password-resets.js
import { initNavbar } from '../../../components/navbar.js';
import { isAdmin } from '../../../authService.js';
import { TableComponent } from '../../../components/table/table.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
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

        // Initialize password reset confirmation modal
        initializePasswordResetModal();

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
                key: 'reset-password',
                title: 'Şifreyi Sıfırla',
                icon: 'fas fa-key',
                class: 'btn btn-sm btn-warning',
                onClick: async (row) => {
                    showPasswordResetConfirmation(row);
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

// Initialize password reset confirmation modal
function initializePasswordResetModal() {
    window.passwordResetModal = new DisplayModal('password-reset-modal-container', {
        title: 'Şifre Sıfırlama Onayı',
        icon: 'fas fa-key',
        size: 'md',
        showEditButton: false
    });
    
    // Add close callback to ensure proper cleanup
    window.passwordResetModal.onCloseCallback(() => {
        // Reset modal when closed to prevent data duplication
        setTimeout(() => {
            window.passwordResetModal.reset();
        }, 100); // Small delay to ensure modal is fully closed
    });
}

// Show password reset confirmation modal
function showPasswordResetConfirmation(user) {
    // Reset modal to clean state
    window.passwordResetModal.reset();
    
    // Set modal title and icon
    window.passwordResetModal
        .setTitle('Şifre Sıfırlama Onayı')
        .setIcon('fas fa-exclamation-triangle')
        .setShowEditButton(false);
    
    // Add warning section
    window.passwordResetModal
        .addCustomSection({
            title: 'Onay Gerekli',
            icon: 'fas fa-exclamation-triangle',
            iconColor: 'text-warning',
            customContent: `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>${user.username}</strong> kullanıcısının şifresini sıfırlamak istediğinizden emin misiniz?
                </div>
            `
        });
    
    // Add user information section using fields
    window.passwordResetModal
        .addSection({
            title: 'Kullanıcı Bilgileri',
            icon: 'fas fa-user',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'username',
                    label: 'Kullanıcı Adı',
                    value: user.username,
                    icon: 'fas fa-user',
                    colSize: 6
                },
                {
                    id: 'fullname',
                    label: 'Ad Soyad',
                    value: `${user.first_name} ${user.last_name}`,
                    icon: 'fas fa-id-card',
                    colSize: 6
                },
                {
                    id: 'email',
                    label: 'E-posta',
                    value: user.email,
                    icon: 'fas fa-envelope',
                    type: 'email',
                    colSize: 12
                }
            ]
        });
    
    // Add team field if available
    if (user.team) {
        window.passwordResetModal.addField({
            id: 'team',
            label: 'Takım',
            value: user.team,
            icon: 'fas fa-users',
            colSize: 12
        });
    }
    
    // Configure the default edit button to be our confirm button
    window.passwordResetModal
        .setShowEditButton(true)
        .setEditButtonText('Şifreyi Sıfırla')
        .onEditCallback(() => {
            performPasswordReset(user);
        })
        .render();
    
    // Show modal
    window.passwordResetModal.show();
}

// Perform password reset
async function performPasswordReset(user) {
    try {
        // Set loading state
        window.passwordResetModal.setLoading(true);
        
        // Call API
        const response = await adminResetUserPassword(user.id);
        
        if (response.ok) {
            const data = await response.json();
            showPasswordResetResult(user, data.temp_password);
        } else {
            const errorData = await response.json().catch(() => ({}));
            showPasswordResetError(errorData.detail || 'Şifre sıfırlanamadı');
        }
    } catch (error) {
        console.error('Password reset error:', error);
        showPasswordResetError('Şifre sıfırlanırken hata oluştu');
    } finally {
        window.passwordResetModal.setLoading(false);
    }
}

// Show password reset result with temporary password
function showPasswordResetResult(user, tempPassword) {
    // Reset modal to clean state
    window.passwordResetModal.reset();
    
    // Set modal title and icon
    window.passwordResetModal
        .setTitle('Şifre Başarıyla Sıfırlandı')
        .setIcon('fas fa-check-circle')
        .setShowEditButton(false);
    
    // Add success section
    window.passwordResetModal
        .addCustomSection({
            title: 'İşlem Başarılı',
            icon: 'fas fa-check-circle',
            iconColor: 'text-success',
            customContent: `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle me-2"></i>
                    <strong>${user.username}</strong> kullanıcısının şifresi başarıyla sıfırlandı.
                </div>
            `
        });
    
    // Add password section using fields
    window.passwordResetModal
        .addSection({
            title: 'Yeni Geçici Şifre',
            icon: 'fas fa-key',
            iconColor: 'text-warning',
            fields: [
                {
                    id: 'temp-password',
                    label: 'Geçici Şifre',
                    value: tempPassword,
                    icon: 'fas fa-key',
                    type: 'text',
                    copyable: true,
                    colSize: 12
                }
            ]
        });
    
    // Add info sections
    window.passwordResetModal
        .addCustomSection({
            customContent: `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Bu şifreyi kullanıcıya güvenli bir şekilde iletin. Kullanıcı ilk girişinde yeni şifre belirleyecektir.
                </div>
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Önemli:</strong> Bu şifre sadece bir kez gösterilir. Kullanıcıya mutlaka iletin.
                </div>
            `
        })
        .render();
    
    // Configure the default edit button to be our close button
    window.passwordResetModal
        .setShowEditButton(true)
        .setEditButtonText('Tamam')
        .onEditCallback(() => {
            window.passwordResetModal.hide();
        })
        .render();
    
    // Refresh table data
    loadPasswordResetsData();
}

// Show password reset error
function showPasswordResetError(errorMessage) {
    // Reset modal to clean state
    window.passwordResetModal.reset();
    
    // Set modal title and icon
    window.passwordResetModal
        .setTitle('Şifre Sıfırlama Hatası')
        .setIcon('fas fa-exclamation-circle')
        .setShowEditButton(false);
    
    // Add error content
    window.passwordResetModal
        .addCustomSection({
            title: 'Hata Oluştu',
            icon: 'fas fa-exclamation-circle',
            iconColor: 'text-danger',
            customContent: `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle me-2"></i>
                    <strong>Hata:</strong> ${errorMessage}
                </div>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Lütfen tekrar deneyin veya sistem yöneticisi ile iletişime geçin.
                </div>
            `
        })
        .render();
    
    // Configure the default edit button to be our retry button
    window.passwordResetModal
        .setShowEditButton(true)
        .setEditButtonText('Tekrar Dene')
        .onEditCallback(() => {
            window.passwordResetModal.hide();
            // The user can click the reset button again from the table
        })
        .render();
}
