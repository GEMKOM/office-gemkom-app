import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';
import { fetchUsers, fetchTeams } from '../generic/users.js';

export async function showUserCreateForm() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `<div class="row justify-content-center user-create-form"><div class="col-12 col-md-8 col-lg-6"><div class="card"><div class="card-header"><h5 class="mb-0">Kullanıcı Ekle</h5></div><div class="card-body"><form id="user-create-form"><div class="mb-3"><label for="username" class="form-label">Kullanıcı Adı</label><input type="text" class="form-control" id="username" required></div><div class="mb-3"><label for="team" class="form-label">Takım</label><select class="form-select" id="team" required><option value="">Takım seçiniz...</option></select></div><button type="submit" class="btn btn-primary w-100" style="background-color: #cc0000; border-color: #cc0000;">Oluştur</button><div id="user-create-error" class="text-danger mt-2" style="display:none;"></div><div id="user-create-success" class="text-success mt-2" style="display:none;"></div></form></div></div></div></div>`;
    // Fetch teams
    try {
        const teams = await fetchTeams();
        if (teams) {
            const teamSelect = document.getElementById('team');
            teams.forEach(team => {
                const opt = document.createElement('option');
                opt.value = team.value;
                opt.textContent = team.label;
                teamSelect.appendChild(opt);
            });
        }
    } catch (e) {}
    // Form submit
    document.getElementById('user-create-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const team = document.getElementById('team').value;
        const errorDiv = document.getElementById('user-create-error');
        const successDiv = document.getElementById('user-create-success');
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        if (!username || !team) {
            errorDiv.textContent = 'Tüm alanları doldurun.';
            errorDiv.style.display = 'block';
            return;
        }
        try {
            const res = await authedFetch(`${backendBase}/users/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, team })
            });
            if (res.ok) {
                successDiv.textContent = 'Kullanıcı başarıyla oluşturuldu!';
                successDiv.style.display = 'block';
                document.getElementById('user-create-form').reset();
            } else {
                const data = await res.json().catch(() => ({}));
                errorDiv.textContent = data.message || 'Kullanıcı oluşturulamadı.';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
            errorDiv.style.display = 'block';
        }
    });
}

export async function fetchUsersList() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `<div class="row justify-content-center user-list"><div class="col-12 col-md-10"><div class="card"><div class="card-header"><h5 class="mb-0">Kullanıcı Listesi</h5></div><div class="card-body"><div id="user-list-table-container">Yükleniyor...</div></div></div></div></div>`;
    try {
        users = fetchUsers();
        if (users.length > 0) {
            const users = await res.json();
            const tableHtml = `<table class="table table-bordered"><thead><tr><th>Kullanıcı Adı</th><th>Admin mi?</th><th>Takım</th></tr></thead><tbody>${users.map(user => `<tr><td>${user.username}</td><td>${user.is_admin ? 'Evet' : 'Hayır'}</td><td>${user.team || ''}</td></tr>`).join('')}</tbody></table>`;
            document.getElementById('user-list-table-container').innerHTML = tableHtml;
        } else {
            document.getElementById('user-list-table-container').innerHTML = 'Kullanıcılar yüklenemedi.';
        }
    } catch (err) {
        document.getElementById('user-list-table-container').innerHTML = 'Bir hata oluştu.';
    }
} 