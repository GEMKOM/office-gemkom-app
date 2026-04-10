import { logout, isAdmin, isLoggedIn, getUser, navigateTo, ROUTES, fetchAndStorePermissions } from '../authService.js';
import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';
import { filterNavigationByAccess, hasRouteAccess } from '../apis/accessControl.js';
import { NAVIGATION_STRUCTURE } from '../navigationStructure.js';
import { NotificationBell } from './notificationBell/notificationBell.js';

async function safeJson(resp) {
    const text = await resp.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

async function attendanceApiFetch(path, options = {}) {
    return authedFetch(`${backendBase}${path}`, options);
}

function formatTime(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function pick(obj, keys) {
    for (const k of keys) {
        if (obj && obj[k] != null) return obj[k];
    }
    return null;
}

function getAttendanceUiModelFromTodayResponse(respStatus, data) {
    if (respStatus === 404) {
        return { state: 'not_checked_in', label: 'Giriş yapılmadı', variant: 'secondary', details: 'Bugün için kayıt yok.' };
    }
    if (!data || typeof data !== 'object') {
        return { state: 'unknown', label: 'Bilinmiyor', variant: 'secondary', details: 'Beklenmeyen yanıt.' };
    }
    const status = data.status || 'unknown';
    if (status === 'active') {
        const t = formatTime(pick(data, ['check_in_at', 'check_in_time', 'check_in', 'start_at', 'start_time']));
        return { state: 'active', label: 'Giriş yapıldı', variant: 'success', details: t ? `Giriş saati: ${t}` : 'Giriş yapıldı.' };
    }
    if (status === 'complete') {
        return { state: 'complete', label: 'Tamamlandı', variant: 'primary', details: 'Bugün tamamlandı.' };
    }
    if (status === 'pending_override') {
        return { state: 'pending_override', label: 'Onay bekliyor', variant: 'warning', details: 'İK onayı bekleniyor.' };
    }
    return { state: String(status), label: String(status), variant: 'secondary', details: 'Detay için açın.' };
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


// Maximum number of top-level nav items shown in the bar; rest go into "Daha Fazla" dropdown
const MAX_VISIBLE_NAV_ITEMS = 6;

// Helper: split filtered nav into visible + more, return HTML for both (more as one dropdown)
function renderNavigationWithMore(items, currentPath) {
    const entries = Object.entries(items);
    if (entries.length === 0) return '';
    const visibleEntries = entries.slice(0, MAX_VISIBLE_NAV_ITEMS);
    const moreEntries = entries.slice(MAX_VISIBLE_NAV_ITEMS);
    const visibleObj = Object.fromEntries(visibleEntries);
    let html = renderNavigationItems(visibleObj, currentPath);
    if (moreEntries.length > 0) {
        const moreObj = Object.fromEntries(moreEntries);
        const moreMenuContent = renderNavigationItems(moreObj, currentPath, 1);
        html += `
            <li class="nav-item dropdown">
                <a class="nav-link dropdown-toggle" href="#" role="button" 
                   data-bs-toggle="dropdown" aria-expanded="false" data-nav-more>
                    <i class="fas fa-ellipsis-h me-1"></i>
                    <span>Daha Fazla</span>
                </a>
                <ul class="dropdown-menu">
                    ${moreMenuContent}
                </ul>
            </li>
        `;
    }
    return html;
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
      // Refresh permission cache so newly granted routes are reflected
      // without requiring users to log out and back in.
      if (isLoggedIn()) {
        await fetchAndStorePermissions();
      }

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
      
      // Filter navigation based on permission access
      const filteredNavigation = filterNavigationByAccess(NAVIGATION_STRUCTURE);
      const navigationItems = renderNavigationWithMore(filteredNavigation, currentPath);
      
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
                        <li class="nav-item dropdown attendance-nav">
                            <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" role="button"
                               data-bs-toggle="dropdown" aria-expanded="false" id="attendanceDropdownToggle">
                                <span class="attendance-dot attendance-dot--secondary" id="attendanceDot" aria-hidden="true"></span>
                                <i class="fas fa-user-check me-1"></i>
                                <span id="attendanceText">Yoklama</span>
                            </a>
                            <ul class="dropdown-menu dropdown-menu-end attendance-menu" aria-labelledby="attendanceDropdownToggle">
                                <li class="px-3 py-2">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div class="fw-semibold text-light">Yoklama</div>
                                        <span class="badge text-bg-secondary" id="attendanceBadge">…</span>
                                    </div>
                                    <div class="small attendance-muted mt-1" id="attendanceDetails">Yükleniyor…</div>
                                </li>
                                <li><hr class="dropdown-divider"></li>
                                <li class="px-3 pb-2">
                                    <div class="d-flex gap-2">
                                        <button type="button" class="btn btn-sm btn-success flex-fill" id="attendanceCheckInBtn">Giriş yap</button>
                                        <button type="button" class="btn btn-sm btn-danger flex-fill" id="attendanceCheckOutBtn">Çıkış yap</button>
                                    </div>
                                </li>
                                <li class="px-3 pb-2 d-none" id="attendanceOverrideBox">
                                    <div class="small text-warning fw-semibold mb-1">Ofis ağı dışında</div>
                                    <input type="text" class="form-control form-control-sm mb-2" id="attendanceOverrideReason" placeholder="Açıklama" />
                                    <button type="button" class="btn btn-sm btn-warning w-100" id="attendanceOverrideSubmitBtn">
                                        Ofis dışı giriş gönder
                                    </button>
                                </li>
                                <li class="px-3 pb-2">
                                    <button type="button" class="btn btn-sm btn-outline-light w-100" id="attendanceRefreshBtn">
                                        Yenile
                                    </button>
                                </li>
                            </ul>
                        </li>
                        <li class="nav-item">
                            <div class="notification-bell-container" id="notification-bell-container">
                                <button class="notification-bell-button" type="button" aria-label="Bildirimler">
                                    <i class="fas fa-bell"></i>
                                    <span class="notification-badge"></span>
                                </button>
                                <div class="notification-dropdown">
                                    <div class="notification-dropdown-header">
                                        <h6>Bildirimler</h6>
                                        <div class="notification-dropdown-actions">
                                            <button class="mark-all-read-btn" type="button" style="display: none;">Tümünü Okundu İşaretle</button>
                                        </div>
                                    </div>
                                    <div class="notification-list"></div>
                                </div>
                            </div>
                        </li>
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
      
      // Initialize notification bell
      const notificationBellContainer = navbarContainer.querySelector('#notification-bell-container');
      if (notificationBellContainer) {
          window.notificationBell = new NotificationBell(notificationBellContainer);
      }

      // Attendance indicator (check-in / check-out)
      async function refreshAttendanceIndicator() {
          const dot = document.getElementById('attendanceDot');
          const text = document.getElementById('attendanceText');
          const badge = document.getElementById('attendanceBadge');
          const details = document.getElementById('attendanceDetails');
          const btnIn = document.getElementById('attendanceCheckInBtn');
          const btnOut = document.getElementById('attendanceCheckOutBtn');
          const overrideBox = document.getElementById('attendanceOverrideBox');

          if (!dot || !text || !badge || !details || !btnIn || !btnOut || !overrideBox) return;

          overrideBox.classList.add('d-none');
          btnIn.disabled = true;
          btnOut.disabled = true;

          if (!isLoggedIn()) {
              dot.className = 'attendance-dot attendance-dot--secondary';
              text.textContent = 'Yoklama';
              badge.className = 'badge text-bg-secondary';
              badge.textContent = 'Giriş';
              details.textContent = 'Giriş yapılmadı.';
              return;
          }

          badge.className = 'badge text-bg-secondary';
          badge.textContent = '…';
          details.textContent = 'Loading…';

          try {
              const resp = await attendanceApiFetch('/attendance/today/', { method: 'GET' });
              const data = await safeJson(resp);
              const model = getAttendanceUiModelFromTodayResponse(resp.status, data);

              dot.className = `attendance-dot attendance-dot--${model.variant}`;
              text.textContent = model.label;
              badge.className = `badge text-bg-${model.variant}`;
              badge.textContent = model.label;
              details.textContent = model.details;

              if (model.state === 'not_checked_in') {
                  btnIn.disabled = false;
              } else if (model.state === 'active') {
                  btnOut.disabled = false;
              }
          } catch (e) {
              dot.className = 'attendance-dot attendance-dot--danger';
              text.textContent = 'Yoklama';
              badge.className = 'badge text-bg-danger';
              badge.textContent = 'Hata';
              details.textContent = 'Yüklenemedi.';
          }
      }

      async function doAttendanceCheckIn(payload) {
          const overrideBox = document.getElementById('attendanceOverrideBox');
          const overrideReason = document.getElementById('attendanceOverrideReason');
          if (overrideBox) overrideBox.classList.add('d-none');

          const resp = await attendanceApiFetch('/attendance/check-in/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload ? JSON.stringify(payload) : '{}'
          });
          const data = await safeJson(resp);

          if (resp.status === 201) {
              await refreshAttendanceIndicator();
              return;
          }

          if (resp.status === 403 && data && data.reason === 'not_on_office_network') {
              if (overrideBox) overrideBox.classList.remove('d-none');
              if (overrideReason) overrideReason.focus();
              return;
          }

          await refreshAttendanceIndicator();
      }

      async function doAttendanceCheckOut() {
          await attendanceApiFetch('/attendance/check-out/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}'
          });
          await refreshAttendanceIndicator();
      }
      
      // Initialize Bootstrap dropdowns after navbar is created
        const dropdownElementList = navbarContainer.querySelectorAll('.dropdown-toggle');
        dropdownElementList.forEach(dropdownToggleEl => {
            new bootstrap.Dropdown(dropdownToggleEl);
        });

        const attendanceToggle = document.getElementById('attendanceDropdownToggle');
        if (attendanceToggle) {
            attendanceToggle.addEventListener('show.bs.dropdown', () => {
                refreshAttendanceIndicator();
            });
        }

        const attendanceRefreshBtn = document.getElementById('attendanceRefreshBtn');
        if (attendanceRefreshBtn) {
            attendanceRefreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                refreshAttendanceIndicator();
            });
        }

        const attendanceInBtn = document.getElementById('attendanceCheckInBtn');
        if (attendanceInBtn) {
            attendanceInBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                attendanceInBtn.disabled = true;
                await doAttendanceCheckIn(null);
            });
        }

        const attendanceOutBtn = document.getElementById('attendanceCheckOutBtn');
        if (attendanceOutBtn) {
            attendanceOutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                attendanceOutBtn.disabled = true;
                await doAttendanceCheckOut();
            });
        }

        const attendanceOverrideSubmitBtn = document.getElementById('attendanceOverrideSubmitBtn');
        if (attendanceOverrideSubmitBtn) {
            attendanceOverrideSubmitBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const reasonEl = document.getElementById('attendanceOverrideReason');
                const reason = (reasonEl && reasonEl.value ? reasonEl.value : '').trim();
                if (!reason) {
                    if (reasonEl) reasonEl.focus();
                    return;
                }
                attendanceOverrideSubmitBtn.disabled = true;
                try {
                    await doAttendanceCheckIn({ override_reason: reason });
                } finally {
                    attendanceOverrideSubmitBtn.disabled = false;
                }
            });
        }

        refreshAttendanceIndicator();
        
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
                        
                        

                        
                                                if (path.startsWith('/manufacturing/machining/')) {
                            // Allow navigation to machining pages
                            navigateTo(path);
                            return;
                        }
                        
                        if (path.startsWith('/manufacturing/maintenance/')) {
                            // Allow navigation to maintenance pages
                            navigateTo(path);
                            return;
                        }
                        
                        if (path.startsWith('/manufacturing/cnc-cutting/')) {
                            // Allow navigation to CNC cutting pages
                            navigateTo(path);
                            return;
                        }
                        
                                        if (path.startsWith('/general/') && !path.startsWith('/general/users') && !path.startsWith('/general/machines') && !path.startsWith('/general/overtime') && !path.startsWith('/general/department-requests')) {
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

                if (path.startsWith('/accounting/')) {
                    // Allow navigation to accounting pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/it/')) {
                    // Allow navigation to IT pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/human_resources/')) {
                    // Allow navigation to HR pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/management/')) {
                    // Allow navigation to management pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/planning/')) {
                    // Allow navigation to planning pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/sales/')) {
                    // Allow navigation to sales pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/projects/')) {
                    // Allow navigation to projects pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/design/')) {
                    // Allow navigation to design pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/quality-control/')) {
                    // Allow navigation to quality control pages
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
                
                if (path.startsWith('/manufacturing/machining/')) {
                    // Allow navigation to machining pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/manufacturing/maintenance/')) {
                    // Allow navigation to maintenance pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/manufacturing/cnc-cutting/')) {
                    // Allow navigation to CNC cutting pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/general/') && !path.startsWith('/general/users') && !path.startsWith('/general/machines') && !path.startsWith('/general/overtime') && !path.startsWith('/general/department-requests')) {
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

                if (path.startsWith('/accounting/')) {
                    // Allow navigation to accounting pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/it/')) {
                    // Allow navigation to IT pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/human_resources/')) {
                    // Allow navigation to HR pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/management/')) {
                    // Allow navigation to management pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/planning/')) {
                    // Allow navigation to planning pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/sales/')) {
                    // Allow navigation to sales pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/projects/')) {
                    // Allow navigation to projects pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/design/')) {
                    // Allow navigation to design pages
                    navigateTo(path);
                    return;
                }
                
                if (path.startsWith('/quality-control/')) {
                    // Allow navigation to quality control pages
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