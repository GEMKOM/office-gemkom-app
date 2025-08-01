import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

export async function showJiraSettings() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `
        <div class="row justify-content-center jira-settings-form">
            <div class="col-12 col-md-8 col-lg-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Jira API Token Ayarları</h5>
                    </div>
                    <div class="card-body">
                        <form id="jira-settings-form">
                            <div class="mb-3">
                                <label for="jira-api-token" class="form-label">Jira API Token</label>
                                <input type="text" class="form-control" id="jira-api-token" required>
                            </div>
                            <button type="submit" class="btn btn-primary w-100" style="background-color: #cc0000; border-color: #cc0000;">Kaydet</button>
                            <div id="jira-settings-error" class="text-danger mt-2" style="display:none;"></div>
                            <div id="jira-settings-success" class="text-success mt-2" style="display:none;"></div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('jira-settings-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const token = document.getElementById('jira-api-token').value.trim();
        const errorDiv = document.getElementById('jira-settings-error');
        const successDiv = document.getElementById('jira-settings-success');
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        if (!token) {
            errorDiv.textContent = 'Token alanı boş olamaz.';
            errorDiv.style.display = 'block';
            return;
        }
        try {
            const res = await authedFetch(`${backendBase}/users/me/`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jira_api_token: token })
            });
            if (res.ok) {
                successDiv.textContent = 'Jira API token başarıyla kaydedildi!';
                successDiv.style.display = 'block';
                document.getElementById('jira-settings-form').reset();
            } else {
                const data = await res.json().catch(() => ({}));
                errorDiv.textContent = data.message || 'Token kaydedilemedi.';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
            errorDiv.style.display = 'block';
        }
    });
} 