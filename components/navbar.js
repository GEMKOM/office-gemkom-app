import { logout, isAdmin, isLoggedIn, getUser, navigateTo, ROUTES } from '../authService.js';
import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';
import { filterNavigationByAccess, hasRouteAccess } from '../generic/accessControl.js';

// Navigation structure configuration
const NAVIGATION_STRUCTURE = {
    '/': {
        label: 'Ana Sayfa',
        icon: 'fas fa-home',
        children: {}
    },
    '/general': {
        label: 'Genel',
        icon: 'fas fa-cogs',
        children: {
            '/general/users': {
                label: 'Çalışanlar',
                icon: 'fas fa-users',
                children: {}
            },
            '/general/machines': {
                label: 'Makineler',
                icon: 'fas fa-cogs',
                children: {}
            },
            '/general/overtime': {
                label: 'Mesailer',
                icon: 'fas fa-clock',
                children: {
                    '/general/overtime/pending': {
                        label: 'Bekleyen Talepler',
                        icon: 'fas fa-clock',
                        children: {}
                    },
                    '/general/overtime/registry': {
                        label: 'Kayıt Defteri',
                        icon: 'fas fa-archive',
                        children: {}
                    },
                    '/general/overtime/users': {
                        label: 'Mesai Kullanıcıları',
                        icon: 'fas fa-users',
                        children: {}
                    }
                }
            }
        }
    },
    '/manufacturing': {
        label: 'İmalat',
        icon: 'fas fa-industry',
        children: {
            '/manufacturing/machining': {
                label: 'Talaşlı İmalat',
                icon: 'fas fa-cog',
                children: {
                    '/manufacturing/machining/dashboard': {
                        label: 'Dashboard',
                        icon: 'fas fa-chart-line',
                        children: {}
                    },
                                         '/manufacturing/machining/tasks': {
                         label: 'Görevler',
                         icon: 'fas fa-tasks',
                         children: {}
                     },
                    '/manufacturing/machining/reports': {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-pie',
                        children: {

                            '/manufacturing/machining/reports/production': {
                                label: 'Üretim Raporları',
                                icon: 'fas fa-industry',
                                children: {}
                            },
                            '/manufacturing/machining/reports/performance': {
                                label: 'Performans Raporları',
                                icon: 'fas fa-tachometer-alt',
                                children: {}
                            },
                            '/manufacturing/machining/reports/quality': {
                                label: 'Kalite Raporları',
                                icon: 'fas fa-award',
                                children: {}
                            }
                        }
                    },
                    '/manufacturing/machining/capacity': {
                        label: 'Kapasite Yönetimi',
                        icon: 'fas fa-industry',
                        children: {
                            '/manufacturing/machining/capacity/planning': {
                                label: 'Kapasite Planlayıcı',
                                icon: 'fas fa-calendar-alt',
                                children: {}
                            },
                            '/manufacturing/machining/capacity/history': {
                                label: 'Makine Çalışma Geçmişi',
                                icon: 'fas fa-history',
                                children: {}
                            }
                        }
                    }
                }
            },
            '/manufacturing/maintenance': {
                label: 'Bakım',
                icon: 'fas fa-wrench',
                children: {
                    '/manufacturing/maintenance/fault-requests': {
                        label: 'Arıza Talepleri',
                        icon: 'fas fa-exclamation-triangle',
                        children: {
                            '/manufacturing/maintenance/fault-requests/create': {
                                label: 'Yeni Arıza Talebi',
                                icon: 'fas fa-plus-circle',
                                children: {}
                            },
                            '/manufacturing/maintenance/fault-requests/list': {
                                label: 'Arıza Listesi',
                                icon: 'fas fa-list',
                                children: {}
                            },
                            '/manufacturing/maintenance/fault-requests/statistics': {
                                label: 'Arıza İstatistikleri',
                                icon: 'fas fa-chart-bar',
                                children: {}
                            }
                        }
                    }
                }
            },


        }
    },
    '/procurement': {
        label: 'Satın Alma',
        icon: 'fas fa-shopping-cart',
        children: {
            '/procurement/suppliers': {
                label: 'Tedarikçiler',
                icon: 'fas fa-handshake',
                children: {
                    '/procurement/suppliers/list': {
                        label: 'Tedarikçi Listesi',
                        icon: 'fas fa-list',
                        children: {}
                    },
                    '/procurement/suppliers/payment-terms': {
                        label: 'Ödeme Koşulları',
                        icon: 'fas fa-credit-card',
                        children: {}
                    }
                }
            },
            '/procurement/purchase-requests': {
                label: 'Satın Alma Talepleri',
                icon: 'fas fa-shopping-cart',
                children: {
                    '/procurement/purchase-requests/create': {
                        label: 'Talep Oluştur',
                        icon: 'fas fa-plus',
                        children: {}
                    },
                    '/procurement/purchase-requests/pending': {
                        label: 'Bekleyen Talepler',
                        icon: 'fas fa-clock',
                        children: {}
                    },
                    '/procurement/purchase-requests/registry': {
                        label: 'Kayıt Defteri',
                        icon: 'fas fa-archive',
                        children: {}
                    }
                }
            },
            '/procurement/items': {
                label: 'Malzemeler',
                icon: 'fas fa-boxes',
                children: {
                    '/procurement/items/catalog': {
                        label: 'Malzeme Kataloğu',
                        icon: 'fas fa-book',
                        children: {}
                    },
                    '/procurement/items/inventory': {
                        label: 'Stok Takibi',
                        icon: 'fas fa-warehouse',
                        children: {}
                    },
                    '/procurement/items/specifications': {
                        label: 'Teknik Özellikler',
                        icon: 'fas fa-info-circle',
                        children: {}
                    }
                }
            },
            '/procurement/reports': {
                label: 'Raporlar',
                icon: 'fas fa-chart-bar',
                children: {
                    '/procurement/reports/items': {
                        label: 'Ürün Raporu',
                        icon: 'fas fa-chart-bar',
                        children: {}
                    },
                    '/procurement/reports/suppliers': {
                        label: 'Tedarikçi Raporu',
                        icon: 'fas fa-chart-pie',
                        children: {}
                    },
                    '/procurement/reports/staff': {
                        label: 'Personel Raporu',
                        icon: 'fas fa-users',
                        children: {}
                    }
                }
            }
        }
    },

    '/finance': {
        label: 'Finans',
        icon: 'fas fa-dollar-sign',
        children: {
            '/finance/purchase-orders': {
                label: 'Satın Alma Siparişleri',
                icon: 'fas fa-shopping-cart',
                children: {}
            },
            '/finance/reports': {
                label: 'Raporlar',
                icon: 'fas fa-chart-bar',
                children: {
                    '/finance/reports/projects': {
                        label: 'Proje Raporu',
                        icon: 'fas fa-chart-line',
                        children: {}
                    }
                }
            }
        }
    }
};

// Helper function to get breadcrumb path
function getBreadcrumbPath(currentPath) {
    const pathSegments = currentPath.split('/').filter(segment => segment);
    const breadcrumbs = [];
    
    let currentSegment = '';
    for (const segment of pathSegments) {
        currentSegment += `/${segment}`;
        breadcrumbs.push({
            path: currentSegment,
            segment: segment
        });
    }
    
    return breadcrumbs;
}

// Helper function to find navigation item by path
function findNavigationItem(path, structure = NAVIGATION_STRUCTURE) {
    for (const [key, value] of Object.entries(structure)) {
        if (key === path) {
            return value;
        }
        if (value.children) {
            const found = findNavigationItem(path, value.children);
            if (found) return found;
        }
    }
    return null;
}

// Helper function to get parent navigation item
function getParentNavigationItem(path, structure = NAVIGATION_STRUCTURE) {
    const pathSegments = path.split('/').filter(segment => segment);
    if (pathSegments.length <= 1) return null;
    
    const parentPath = '/' + pathSegments.slice(0, -1).join('/');
    return findNavigationItem(parentPath, structure);
}

// Helper function to render navigation items recursively
function renderNavigationItems(items, currentPath, level = 0) {
    let html = '';
    
    for (const [path, item] of Object.entries(items)) {
        const isActive = currentPath === path || currentPath.startsWith(path + '/');
        const hasChildren = Object.keys(item.children).length > 0;
        // Keep dropdowns closed by default - only show when explicitly clicked
        const isExpanded = false; // Changed from: isActive && hasChildren
        
        const activeClass = isActive ? 'active' : '';
        const expandedClass = isExpanded ? 'show' : '';
        
        if (level === 0) {
            // Top level items
            if (hasChildren) {
                html += `
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle ${activeClass}" href="#" role="button" 
                           data-bs-toggle="dropdown" aria-expanded="${isExpanded}" data-path="${path}">
                            <i class="${item.icon} me-1"></i>
                            <span>${item.label}</span>
                        </a>
                        <ul class="dropdown-menu ${expandedClass}">
                            ${renderNavigationItems(item.children, currentPath, level + 1)}
                        </ul>
                    </li>
                `;
            } else {
                html += `
                    <li class="nav-item">
                        <a class="nav-link ${activeClass}" href="#" data-path="${path}">
                            <i class="${item.icon} me-1"></i>
                            <span>${item.label}</span>
                        </a>
                    </li>
                `;
            }
        } else if (level === 1) {
            // Second level items
            if (hasChildren) {
                html += `
                    <li class="dropend">
                        <a class="dropdown-item dropdown-toggle ${activeClass}" href="#" role="button" 
                           data-bs-toggle="dropdown" aria-expanded="${isExpanded}" data-path="${path}">
                            <i class="${item.icon} me-1"></i>
                            <span>${item.label}</span>
                        </a>
                        <ul class="dropdown-menu dropdown-submenu">
                            ${renderNavigationItems(item.children, currentPath, level + 1)}
                        </ul>
                    </li>
                `;
            } else {
                html += `
                    <li>
                        <a class="dropdown-item ${activeClass}" href="#" data-path="${path}">
                            <i class="${item.icon} me-1"></i>
                            <span>${item.label}</span>
                        </a>
                    </li>
                `;
            }
        } else {
            // Third level and deeper items
            html += `
                <li>
                    <a class="dropdown-item ${activeClass}" href="#" data-path="${path}">
                        <i class="${item.icon} me-1"></i>
                        <span>${item.label}</span>
                    </a>
                </li>
            `;
        }
    }
    
    return html;
}

// Helper to create user modal
function createUserEditModal(user) {
    let modal = document.getElementById('user-edit-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'user-edit-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
      <div style="background:#fff;padding:2rem;border-radius:8px;min-width:320px;max-width:90vw;box-shadow:0 2px 16px #0002;position:relative;">
        <button id="user-edit-close" style="position:absolute;top:8px;right:8px;font-size:1.2rem;background:none;border:none;">&times;</button>
        <h5>Kullanıcı Bilgileri</h5>
        <form id="user-edit-form">
          <div class="mb-2">
            <label>Ad</label>
            <input type="text" class="form-control" id="user-edit-firstname" value="${user.first_name||''}" required />
          </div>
          <div class="mb-2">
            <label>Soyad</label>
            <input type="text" class="form-control" id="user-edit-lastname" value="${user.last_name||''}" required />
          </div>
          <div class="mb-2">
            <label>Email</label>
            <input type="email" class="form-control" id="user-edit-email" value="${user.email||''}" required />
          </div>
          <button type="submit" class="btn btn-primary w-100">Kaydet</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('user-edit-close').onclick = () => modal.remove();
    document.getElementById('user-edit-form').onsubmit = async (e) => {
      e.preventDefault();
      const first_name = document.getElementById('user-edit-firstname').value;
      const last_name = document.getElementById('user-edit-lastname').value;
      const email = document.getElementById('user-edit-email').value;
      try {
        const res = await authedFetch(`${backendBase}/users/me/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name, last_name, email })
        });
        if (res.ok) {
          alert('Bilgiler güncellendi!');
          const user_data = await getUser();
          localStorage.setItem('user', JSON.stringify(user_data));
          modal.remove();
          window.location.reload();
        } else {
          alert('Güncelleme başarısız.');
        }
      } catch (err) {
        alert(err)
        alert('Sunucu hatası.');
      }
    };
}



// Function to initialize navbar
export function initNavbar() {
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) {
      return;
    }

    async function renderNavbar() {
      let user = null;
      try {
        const cached = localStorage.getItem('user');
        if (cached) {
          user = JSON.parse(cached);
        } else {
          user = await getUser();
          localStorage.setItem('user', JSON.stringify(user));
        }
      } catch (e) {
        user = await getUser();
        localStorage.setItem('user', JSON.stringify(user));
      }
      
      const username = user.username || user.email || 'Kullanıcı';
      const userDisplayName = user.first_name && user.last_name ? 
        `${user.first_name} ${user.last_name}` : username;
      
      const currentPath = window.location.pathname;
      
      // Filter navigation based on user team access
      const userTeam = user.team || 'other';
      const filteredNavigation = filterNavigationByAccess(NAVIGATION_STRUCTURE, userTeam);
      const navigationItems = renderNavigationItems(filteredNavigation, currentPath);
      
      const navHTML = `
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
            <div class="container-fluid">
                <a class="navbar-brand d-flex align-items-center" href="/">
                    <img src="/images/gemkom.png" alt="Gemkom Logo" style="height: 30px; margin-right: 10px;">
                    <span>GEMKOM</span>
                </a>
                
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" 
                    aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                        ${navigationItems}
                    </ul>
                    
                    <ul class="navbar-nav ms-auto align-items-center">
                        <li class="nav-item dropdown">
                            <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" role="button" 
                               data-bs-toggle="dropdown" aria-expanded="false" id="userDropdown">
                                <div class="user-avatar me-2">
                                    <i class="fas fa-user-circle"></i>
                                </div>
                                <span>${userDisplayName}</span>
                            </a>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li><h6 class="dropdown-header">Kullanıcı Bilgileri</h6></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" href="#" id="edit-profile-btn">
                                    <i class="fas fa-user-edit me-2"></i>Profili Düzenle
                                </a></li>
                                <li><h6 class="dropdown-item">Takım: ${user.team_label || 'Atanmamış'}</h6></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger" href="#" id="logout-button">
                                    <i class="fas fa-sign-out-alt me-2"></i>Çıkış Yap
                                </a></li>
                            </ul>
                        </li>
                    </ul>
                </div>
            </div>
        </nav>
      `;
      
             navbarContainer.innerHTML = navHTML;
      
      // Initialize Bootstrap dropdowns after navbar is created
        const dropdownElementList = navbarContainer.querySelectorAll('.dropdown-toggle');
        dropdownElementList.forEach(dropdownToggleEl => {
            new bootstrap.Dropdown(dropdownToggleEl);
        });
        
        // Add hover functionality for main navbar dropdowns (top level only)
        const mainDropdownToggles = navbarContainer.querySelectorAll('.nav-item.dropdown .dropdown-toggle');
        
        // Function to close all dropdowns except the specified one
        function closeOtherDropdowns(exceptElement) {
            mainDropdownToggles.forEach(toggle => {
                const navItem = toggle.closest('.nav-item');
                const dropdownMenu = toggle.nextElementSibling;
                
                if (navItem !== exceptElement && dropdownMenu) {
                    dropdownMenu.classList.remove('show');
                    // Also close all nested submenus
                    const allSubmenus = dropdownMenu.querySelectorAll('.dropdown-submenu');
                    allSubmenus.forEach(submenu => {
                        submenu.classList.remove('show');
                    });
                }
            });
        }
        
        mainDropdownToggles.forEach(dropdownToggle => {
            const navItem = dropdownToggle.closest('.nav-item');
            const dropdownMenu = dropdownToggle.nextElementSibling;
            let hideTimeout;
            
            // Show dropdown on hover
            navItem.addEventListener('mouseenter', () => {
                if (dropdownMenu) {
                    // Close other dropdowns first
                    closeOtherDropdowns(navItem);
                    
                    // Small delay to ensure smooth transition
                    setTimeout(() => {
                        dropdownMenu.classList.add('show');
                        // Hide all nested submenus when main dropdown opens
                        const allSubmenus = dropdownMenu.querySelectorAll('.dropdown-submenu');
                        allSubmenus.forEach(submenu => {
                            submenu.classList.remove('show');
                        });
                    }, 50);
                }
            });
            
            // Hide dropdown on mouse leave
            navItem.addEventListener('mouseleave', (e) => {
                // Check if the mouse is moving to the dropdown menu or its children
                const relatedTarget = e.relatedTarget;
                if (relatedTarget && (
                    relatedTarget === dropdownMenu || 
                    dropdownMenu.contains(relatedTarget) ||
                    relatedTarget.closest('.dropdown-menu') ||
                    relatedTarget.closest('.nav-item.dropdown')
                )) {
                    return; // Don't hide if moving to dropdown menu or its items
                }
                
                hideTimeout = setTimeout(() => {
                    if (dropdownMenu) {
                        dropdownMenu.classList.remove('show');
                    }
                }, 300); // Reduced delay for better responsiveness
            });
            
            // Cancel hide timeout when entering dropdown menu
            if (dropdownMenu) {
                dropdownMenu.addEventListener('mouseenter', () => {
                    if (hideTimeout) {
                        clearTimeout(hideTimeout);
                    }
                });
                
                dropdownMenu.addEventListener('mouseleave', (e) => {
                    // Check if moving to another dropdown item
                    const relatedTarget = e.relatedTarget;
                    if (relatedTarget && (
                        relatedTarget.closest('.dropdown-menu') ||
                        relatedTarget.closest('.nav-item.dropdown')
                    )) {
                        return;
                    }
                    
                    if (dropdownMenu) {
                        dropdownMenu.classList.remove('show');
                    }
                });
            }
            
            // Handle hover on the dropdown toggle itself
            dropdownToggle.addEventListener('mouseenter', () => {
                if (dropdownMenu) {
                    // Close other dropdowns first
                    closeOtherDropdowns(navItem);
                    
                    setTimeout(() => {
                        dropdownMenu.classList.add('show');
                        // Hide all nested submenus when main dropdown opens
                        const allSubmenus = dropdownMenu.querySelectorAll('.dropdown-submenu');
                        allSubmenus.forEach(submenu => {
                            submenu.classList.remove('show');
                        });
                    }, 50);
                }
            });
        });
        
        // Initialize nested dropdowns (dropend) with hover functionality
        const dropendElements = navbarContainer.querySelectorAll('.dropend .dropdown-toggle');
        
        // Function to close all nested submenus except the specified one
        function closeOtherSubmenus(exceptElement) {
            dropendElements.forEach(toggle => {
                const dropendItem = toggle.closest('.dropend');
                const dropdownMenu = toggle.nextElementSibling;
                
                if (dropendItem !== exceptElement && dropdownMenu && dropdownMenu.classList.contains('dropdown-submenu')) {
                    dropdownMenu.classList.remove('show');
                }
            });
        }
        
        dropendElements.forEach(dropendToggle => {
            // Don't initialize Bootstrap dropdown for nested dropdowns to avoid conflicts
            // const dropdown = new bootstrap.Dropdown(dropendToggle);
            
            const dropendItem = dropendToggle.closest('.dropend');
            const dropdownMenu = dropendToggle.nextElementSibling;
            let hideTimeout;
            
            // Add hover functionality for nested dropdowns
            dropendToggle.addEventListener('mouseenter', () => {
                if (dropdownMenu && dropdownMenu.classList.contains('dropdown-submenu')) {
                    // Close other submenus first
                    closeOtherSubmenus(dropendItem);
                    
                    setTimeout(() => {
                        dropdownMenu.classList.add('show');
                    }, 50);
                }
            });
            
            // Hide nested dropdown on mouse leave
            dropendItem.addEventListener('mouseleave', (e) => {
                // Check if moving to the submenu
                const relatedTarget = e.relatedTarget;
                if (relatedTarget && relatedTarget.closest('.dropdown-submenu')) {
                    return;
                }
                
                hideTimeout = setTimeout(() => {
                    if (dropdownMenu && dropdownMenu.classList.contains('dropdown-submenu')) {
                        dropdownMenu.classList.remove('show');
                    }
                }, 200); // Reduced delay for better responsiveness
            });
            
            // Cancel hide timeout when entering submenu
            if (dropdownMenu && dropdownMenu.classList.contains('dropdown-submenu')) {
                dropdownMenu.addEventListener('mouseenter', () => {
                    if (hideTimeout) {
                        clearTimeout(hideTimeout);
                    }
                });
                
                dropdownMenu.addEventListener('mouseleave', (e) => {
                    // Check if moving to another dropdown item
                    const relatedTarget = e.relatedTarget;
                    if (relatedTarget && (
                        relatedTarget.closest('.dropdown-menu') ||
                        relatedTarget.closest('.dropend')
                    )) {
                        return;
                    }
                    
                    if (dropdownMenu) {
                        dropdownMenu.classList.remove('show');
                    }
                });
            }
                });
        
        // Add click outside handler to close all dropdowns
        document.addEventListener('click', (e) => {
            const isDropdownClick = e.target.closest('.nav-item.dropdown') || 
                                  e.target.closest('.dropdown-menu') ||
                                  e.target.closest('.dropend');
            
            if (!isDropdownClick) {
                // Close all dropdowns when clicking outside
                mainDropdownToggles.forEach(toggle => {
                    const dropdownMenu = toggle.nextElementSibling;
                    if (dropdownMenu) {
                        dropdownMenu.classList.remove('show');
                    }
                });
                
                // Close all nested submenus
                dropendElements.forEach(toggle => {
                    const dropdownMenu = toggle.nextElementSibling;
                    if (dropdownMenu && dropdownMenu.classList.contains('dropdown-submenu')) {
                        dropdownMenu.classList.remove('show');
                    }
                });
            }
        });
        
        // Add event listeners
      const editProfileBtn = document.getElementById('edit-profile-btn');
      if (editProfileBtn) {
          editProfileBtn.addEventListener('click', (e) => {
              e.preventDefault();
              createUserEditModal(user);
          });
      }
      
      const teamInfoBtn = document.getElementById('team-info-btn');
      if (teamInfoBtn) {
          teamInfoBtn.addEventListener('click', (e) => {
              e.preventDefault();
              // Show team info in a simple alert for now
                             const teamName = user.team ? 
                   (user.team === 'manufacturing' ? 'İmalat' : 
                    user.team === 'procurement' ? 'Satın Alma' : user.team) : 'Atanmamış';
              alert(`Takımınız: ${teamName}`);
          });
      }

      const logoutButton = document.getElementById('logout-button');
      if (logoutButton) {
          logoutButton.addEventListener('click', (e) => {
              e.preventDefault();
              logout();
          });
      }
      
                     // Add click handlers for navigation
        const navLinks = navbarContainer.querySelectorAll('.nav-link, .dropdown-item');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const path = link.getAttribute('data-path');
                
                // Handle dropdown toggles with dual functionality
                if (link.classList.contains('dropdown-toggle')) {
                    // If it has a path, navigate to it on click
                    if (path) {
                        e.preventDefault();
                        
                        // Allow home page and login page without authentication
                        if (path === '/' || path === '/login') {
                            navigateTo(path);
                            return;
                        }

                        // Check if user is logged in
                        if (!isLoggedIn()) {
                            navigateTo(ROUTES.LOGIN);
                            return;
                        }
                        
                        // Check if user has access to this route
                        if (!hasRouteAccess(path)) {
                            alert('Bu sayfaya erişim yetkiniz bulunmamaktadır.');
                            return;
                        }
                        
                        

                        
                                                if (path.startsWith('/manufacturing/maintenance/')) {
                            // Allow navigation to maintenance pages
                            navigateTo(path);
                            return;
                        }
                        
                                        if (path.startsWith('/general/') && !path.startsWith('/general/users') && !path.startsWith('/general/machines') && !path.startsWith('/general/overtime')) {
                    // Show placeholder for management pages
                    alert(`Bu sayfa henüz geliştirilme aşamasında: ${path}`);
                    return;
                }
                
                if (path.startsWith('/procurement/')) {
                    // Allow navigation to procurement pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/finance/')) {
                    // Allow navigation to finance pages
                    navigateTo(path);
                    return;
                }
                
                
                
                navigateTo(path);
                    }
                    // If no path, let Bootstrap handle the dropdown toggle
                    return;
                }
                
                // Skip if no path
                if (!path) {
                    return;
                }
                
                e.preventDefault();
                
                // Allow home page and login page without authentication
                if (path === '/' || path === '/login') {
                    navigateTo(path);
                    return;
                }

                // Check if user is logged in
                if (!isLoggedIn()) {
                    navigateTo(ROUTES.LOGIN);
                    return;
                }
                
                // Check if user has access to this route
                if (!hasRouteAccess(path)) {
                    alert('Bu sayfaya erişim yetkiniz bulunmamaktadır.');
                    return;
                }
                
                if (path.startsWith('/manufacturing/maintenance/')) {
                    // Allow navigation to maintenance pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/general/') && !path.startsWith('/general/users') && !path.startsWith('/general/machines') && !path.startsWith('/general/overtime')) {
                    // Show placeholder for management pages
                    alert(`Bu sayfa henüz geliştirilme aşamasında: ${path}`);
                    return;
                }
                
                if (path.startsWith('/procurement/')) {
                    // Allow navigation to procurement pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/finance/')) {
                    // Allow navigation to finance pages
                    navigateTo(path);
                    return;
                }
                
                
                
                navigateTo(path);
            });
        });
    }
    
    renderNavbar();
}

export function setupLogoutButton() {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.onclick = () => {
            logout();
        };
    }
}