import { logout, isAdmin, isLoggedIn, getUser, navigateTo, ROUTES } from '../authService.js';
import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

// Navbar component
export function createNavbar() {
    const navbar = document.createElement('nav');
    navbar.className = 'navbar navbar-expand-lg navbar-dark bg-dark';
    navbar.innerHTML = `
        <div class="container">
            <a class="navbar-brand" href="/">GEMKOM</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav"
                aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav">
                    <li class="nav-item">
                        <a class="nav-link" href="/">Ana Sayfa</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/manufacturing">İmalat</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/procurement">Satın Alma</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/planning">Planlama</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/rolling-mill">Haddehane</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/logistics">Lojistik</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/design">Dizayn</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="/quality-control">Kalite Kontrol</a>
                    </li>
                </ul>
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item">
                        <button id="logout-button" class="nav-link">Çıkış</button>
                    </li>
                </ul>
            </div>
        </div>
    `;

    // Add active class to current page link
    const currentPath = window.location.pathname;
    const navLinks = navbar.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href) {
            // Check for exact match first
            if (href === currentPath) {
                link.classList.add('active');
            }
            // Check for partial match for subpages (e.g., /manufacturing/tasks/ should highlight /manufacturing)
            else if (href !== '/' && currentPath.startsWith(href)) {
                link.classList.add('active');
            }
            // Special case for home page - only highlight if we're exactly on home
            else if (href === '/' && currentPath === '/') {
                link.classList.add('active');
            }
        }
    });

    // Add click handlers for navigation
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

    return navbar;
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
                        <li class="nav-item">
                            <a class="nav-link" href="/">
                                <i class="fas fa-home me-1"></i>
                                <span>Ana Sayfa</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/manufacturing">
                                <i class="fas fa-industry me-1"></i>
                                <span>İmalat</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/procurement">
                                <i class="fas fa-shopping-cart me-1"></i>
                                <span>Satın Alma</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/planning">
                                <i class="fas fa-calendar-alt me-1"></i>
                                <span>Planlama</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/rolling-mill">
                                <i class="fas fa-cogs me-1"></i>
                                <span>Haddehane</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/logistics">
                                <i class="fas fa-truck me-1"></i>
                                <span>Lojistik</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/design">
                                <i class="fas fa-drafting-compass me-1"></i>
                                <span>Dizayn</span>
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/quality-control">
                                <i class="fas fa-clipboard-check me-1"></i>
                                <span>Kalite Kontrol</span>
                            </a>
                        </li>
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
      
      // Highlight active page
      const links = navbarContainer.querySelectorAll('.nav-link');
      const currentPath = window.location.pathname;
      links.forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
              // Check for exact match first
              if (href === currentPath) {
                  link.classList.add('active');
              }
              // Check for partial match for subpages (e.g., /manufacturing/tasks/ should highlight /manufacturing)
              else if (href !== '/' && currentPath.startsWith(href)) {
                  link.classList.add('active');
              }
              // Special case for home page - only highlight if we're exactly on home
              else if (href === '/' && currentPath === '/') {
                  link.classList.add('active');
              }
          }
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