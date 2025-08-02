import { logout, isAdmin, isLoggedIn, getUser, navigateTo, ROUTES } from '../authService.js';
import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

// Navigation structure configuration
const NAVIGATION_STRUCTURE = {
    '/': {
        label: 'Ana Sayfa',
        icon: 'fas fa-home',
        children: {}
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
                        children: {}
                    },
                    '/manufacturing/machining/capacity': {
                        label: 'Kapasite Yönetimi',
                        icon: 'fas fa-industry',
                        children: {}
                    }
                }
            },
            '/manufacturing/welding': {
                label: 'Kaynak',
                icon: 'fas fa-fire',
                children: {
                    '/manufacturing/welding/processes': {
                        label: 'Kaynak İşlemleri',
                        icon: 'fas fa-fire',
                        children: {}
                    },
                    '/manufacturing/welding/joining': {
                        label: 'Birleştirme',
                        icon: 'fas fa-link',
                        children: {}
                    },
                    '/manufacturing/welding/quality': {
                        label: 'Kalite Kontrol',
                        icon: 'fas fa-clipboard-check',
                        children: {}
                    }
                }
            },
            '/manufacturing/maintenance': {
                label: 'Bakım',
                icon: 'fas fa-wrench',
                children: {
                    '/manufacturing/maintenance/plans': {
                        label: 'Bakım Planı',
                        icon: 'fas fa-calendar-check',
                        children: {}
                    },
                    '/manufacturing/maintenance/issues': {
                        label: 'Arıza Takibi',
                        icon: 'fas fa-exclamation-triangle',
                        children: {}
                    },
                    '/manufacturing/maintenance/preventive': {
                        label: 'Önleyici Bakım',
                        icon: 'fas fa-shield-alt',
                        children: {}
                    }
                }
            }
        }
    },
    '/procurement': {
        label: 'Satın Alma',
        icon: 'fas fa-shopping-cart',
        children: {}
    },
    '/planning': {
        label: 'Planlama',
        icon: 'fas fa-calendar-alt',
        children: {}
    },
    '/rolling-mill': {
        label: 'Haddehane',
        icon: 'fas fa-cogs',
        children: {}
    },
    '/logistics': {
        label: 'Lojistik',
        icon: 'fas fa-truck',
        children: {}
    },
    '/design': {
        label: 'Dizayn',
        icon: 'fas fa-drafting-compass',
        children: {}
    },
    '/quality-control': {
        label: 'Kalite Kontrol',
        icon: 'fas fa-clipboard-check',
        children: {}
    },
    '/admin': {
        label: 'Yönetim',
        icon: 'fas fa-cogs',
        children: {
            '/admin/taskList': {
                label: 'Görev Listesi',
                icon: 'fas fa-tasks',
                children: {}
            },
            '/admin/listUsers': {
                label: 'Kullanıcı Listesi',
                icon: 'fas fa-users',
                children: {}
            },
            '/admin/machineList': {
                label: 'Makine Listesi',
                icon: 'fas fa-industry',
                children: {}
            },
            '/admin/createUser': {
                label: 'Kullanıcı Oluştur',
                icon: 'fas fa-user-plus',
                children: {}
            },
            '/admin/createMachine': {
                label: 'Makine Oluştur',
                icon: 'fas fa-plus-circle',
                children: {}
            },
            '/admin/bulkTaskCreate': {
                label: 'Toplu Görev Oluştur',
                icon: 'fas fa-layer-group',
                children: {}
            },
            '/admin/bulkUserCreate': {
                label: 'Toplu Kullanıcı Oluştur',
                icon: 'fas fa-users-cog',
                children: {}
            },
            '/admin/finishedTimers': {
                label: 'Tamamlanan Zamanlayıcılar',
                icon: 'fas fa-clock',
                children: {}
            },
            '/admin/mesaiTalebi': {
                label: 'Mesai Talebi',
                icon: 'fas fa-clock',
                children: {}
            },
            '/admin/mesaiTaleplerim': {
                label: 'Mesai Taleplerim',
                icon: 'fas fa-list',
                children: {}
            },
            '/admin/machiningReport': {
                label: 'Talaşlı İmalat Raporu',
                icon: 'fas fa-chart-bar',
                children: {}
            },
            '/admin/machiningDetailedReport': {
                label: 'Detaylı Talaşlı İmalat Raporu',
                icon: 'fas fa-chart-line',
                children: {}
            },
            '/admin/jiraSettings': {
                label: 'Jira Ayarları',
                icon: 'fas fa-cog',
                children: {}
            },
            '/admin/machinePlanning': {
                label: 'Makine Planlama',
                icon: 'fas fa-calendar',
                children: {}
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
        const isExpanded = isActive && hasChildren;
        
        const activeClass = isActive ? 'active' : '';
        const expandedClass = isExpanded ? 'show' : '';
        
        if (level === 0) {
            // Top level items
            if (hasChildren) {
                html += `
                    <li class="nav-item dropdown">
                        <a class="nav-link dropdown-toggle ${activeClass}" href="${path}" role="button" 
                           data-bs-toggle="dropdown" aria-expanded="${isExpanded}">
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
                        <a class="nav-link ${activeClass}" href="${path}">
                            <i class="${item.icon} me-1"></i>
                            <span>${item.label}</span>
                        </a>
                    </li>
                `;
            }
        } else {
            // Sub-level items
            html += `
                <li>
                    <a class="dropdown-item ${activeClass}" href="${path}">
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
      const navigationItems = renderNavigationItems(NAVIGATION_STRUCTURE, currentPath);
      
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
                   user.team === 'procurement' ? 'Satın Alma' :
                   user.team === 'planning' ? 'Planlama' :
                   user.team === 'rolling-mill' ? 'Haddehane' :
                   user.team === 'logistics' ? 'Lojistik' :
                   user.team === 'design' ? 'Dizayn' :
                   user.team === 'quality-control' ? 'Kalite Kontrol' : user.team) : 'Atanmamış';
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
              // Allow home page and login page without authentication
              if (link.getAttribute('href') === '/' || link.getAttribute('href') === '/login') {
                  return;
              }

              // Check if user is logged in
              if (!isLoggedIn()) {
                  e.preventDefault();
                  navigateTo(ROUTES.LOGIN);
              }
          });
      });
    }
    
    renderNavbar();
}

export function setupLogoutButton() {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.onclick = () => {
            localStorage.clear();
            navigateTo(ROUTES.LOGIN);
        };
    }
}