import { authedFetch } from '../authService.js';
import { proxyBase, jiraBase } from '../base.js';
import { toJiraDateTimeLocal } from './mesaiTaleplerim.js';
import { fetchUsers } from '../generic/users.js';
import { getAllowedTeams } from '../generic/teams.js';

export async function showMesaiTalebiForm() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    
    // Get current user's team
    const user = JSON.parse(localStorage.getItem('user'));
    const departman = user.team_label;
    
    // Fetch users for the current team
    const users = await fetchUsers(getAllowedTeams(user.team));
    console.log(users);
    // Create user table HTML
    const userTableHtml = `
        <div class="table-responsive">
            <table class="table table-bordered table-hover">
                <thead class="table-light">
                    <tr>
                        <th width="50">
                            <input type="checkbox" id="select-all-users" class="form-check-input">
                        </th>
                        <th>İsim</th>
                        <th>Görev</th>
                        <th>İş Emri Numarası</th>
                        <th>Açıklama</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr>
                            <td>
                                <input type="checkbox" class="form-check-input user-select-checkbox" data-username="${user.username}">
                            </td>
                            <td>
                                <strong>${user.first_name ? `${user.first_name} ${user.last_name}` : user.username}</strong>
                            </td>
                            <td>
                                <span class="text-muted">${user.occupation_label || 'Görev belirtilmemiş'}</span>
                            </td>
                            <td>
                                <input type="text" class="form-control job-order-input" data-username="${user.username}" placeholder="İş emri numarası">
                            </td>
                            <td>
                                <textarea class="form-control description-input" data-username="${user.username}" rows="2" placeholder="Açıklama giriniz..."></textarea>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    mainContent.innerHTML = `
        <div class="row justify-content-center mesai-talebi-form">
            <div class="col-12 col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Mesai Talebi Gönder - ${departman}</h5>
                    </div>
                    <div class="card-body">
                        <form id="mesai-talebi-form">
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label for="start" class="form-label">Başlangıç Tarihi/Saati</label>
                                    <input type="datetime-local" class="form-control" id="start" required>
                                </div>
                                <div class="col-md-6">
                                    <label for="end" class="form-label">Bitiş Tarihi/Saati</label>
                                    <input type="datetime-local" class="form-control" id="end" required>
                                </div>
                            </div>
                            <div class="mb-3">
                                <h6>Takım Üyeleri</h6>
                                ${userTableHtml}
                            </div>
                            <button type="submit" class="btn btn-primary w-100" style="background-color: #cc0000; border-color: #cc0000;">Gönder</button>
                            <div id="mesai-talebi-error" class="text-danger mt-2" style="display:none;"></div>
                            <div id="mesai-talebi-success" class="text-success mt-2" style="display:none;"></div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners for checkbox functionality
    const selectAllCheckbox = document.getElementById('select-all-users');
    const userCheckboxes = document.querySelectorAll('.user-select-checkbox');
    
    // Select all functionality
    selectAllCheckbox.addEventListener('change', function() {
        userCheckboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
    });
    
    // Update select all when individual checkboxes change
    userCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const allChecked = Array.from(userCheckboxes).every(cb => cb.checked);
            const anyChecked = Array.from(userCheckboxes).some(cb => cb.checked);
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = anyChecked && !allChecked;
        });
    });
    
    document.getElementById('mesai-talebi-form').addEventListener('submit', handleMesaiTalebiSubmit);
}

async function handleMesaiTalebiSubmit(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user'));
    console.log(user);
    const departman = user.team_label;
    const start = document.getElementById('start').value;
    const end = document.getElementById('end').value;
    const errorDiv = document.getElementById('mesai-talebi-error');
    const successDiv = document.getElementById('mesai-talebi-success');
    const submitBtn = document.querySelector('#mesai-talebi-form button[type="submit"]');
    
    submitBtn.disabled = true;
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Gönderiliyor...';
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    if (!departman || !start || !end) {
        errorDiv.textContent = 'Tüm alanları doldurun.';
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
        return;
    }
    
    try {
        // Collect data from form inputs for selected users only
        const rows = [];
        
        // Get all checkboxes that are checked
        const checkedCheckboxes = document.querySelectorAll('.user-select-checkbox:checked');
        
        checkedCheckboxes.forEach(checkbox => {
            const username = checkbox.getAttribute('data-username');
            const jobOrderInput = document.querySelector(`input.job-order-input[data-username="${username}"]`);
            const descriptionInput = document.querySelector(`textarea.description-input[data-username="${username}"]`);
            
            const jobOrderNumber = jobOrderInput ? jobOrderInput.value.trim() : '';
            const description = descriptionInput ? descriptionInput.value.trim() : '';
            
            // Only include users who have job order numbers
            if (jobOrderNumber) {
                // Get user display name from the table
                const userRow = checkbox.closest('tr');
                const nameCell = userRow.querySelector('td:nth-child(2) strong');
                const occupationCell = userRow.querySelector('td:nth-child(3) span');
                
                const displayName = nameCell ? nameCell.textContent : username;
                const occupation = occupationCell ? occupationCell.textContent : 'Görev belirtilmemiş';
                
                rows.push({
                    'İsim': displayName,
                    'Görev': occupation,
                    'İş Emri Numarası': jobOrderNumber,
                    'Açıklama (Opsiyonel)': description
                });
            }
        });
        
        if (!rows.length) {
            errorDiv.textContent = 'En az bir kullanıcı seçin ve iş emri numarası giriniz.';
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
            return;
        }
        
        // Prepare Epic (parent issue)
        const projectKey = 'MES'; // TODO: Replace with your Jira project key
        const epicSummary = `${departman} - ${new Date(start).toLocaleDateString('tr-TR', { weekday: 'long' })} - ${rows.length} Kişi`;
        const epicFields = {
            project: { key: projectKey },
            summary: epicSummary,
            issuetype: { name: 'Mesai Talebi' },
            "customfield_11172": toJiraDateTimeLocal(start),
            "customfield_11173": toJiraDateTimeLocal(end)
            // Add custom fields as needed
        };
        
        const epicRes = await authedFetch(proxyBase + encodeURIComponent(`${jiraBase}/rest/api/3/issue`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: epicFields })
        });
        
        if (!epicRes.ok) {
            errorDiv.textContent = 'Epic oluşturulamadı!';
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
            return;
        }
        
        const epicData = await epicRes.json();
        const epicKey = epicData.key;

        // Create sub-tasks for each row
        for (const row of rows) {
            if (!row['İsim'] || !row['Görev'] || !row['İş Emri Numarası']) continue;
            
            const subTaskFields = {
                project: { key: projectKey },
                summary: row['İsim'],
                issuetype: { name: 'Çalışan' },
                parent: { key: epicKey },
                "customfield_10117": String(row['İş Emri Numarası']),
                "customfield_11167": departman,
                "customfield_11170": row['Görev'],
                "customfield_11172": toJiraDateTimeLocal(start),
                "customfield_11173": toJiraDateTimeLocal(end),
                "description": {
                    "content": [
                        {
                            "content": [
                                {
                                    "text": row["Açıklama (Opsiyonel)"],
                                    "type": "text"
                                }
                            ],
                            "type": "paragraph"
                        }
                    ],
                    "type": "doc",
                    "version": 1
                },
                // Map other fields as needed
            };
            
            await authedFetch(proxyBase + encodeURIComponent(`${jiraBase}/rest/api/3/issue`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: subTaskFields })
            });
        }
        
        successDiv.textContent = 'Mesai talebi başarıyla gönderildi!';
        successDiv.style.display = 'block';
        document.getElementById('mesai-talebi-form').reset();
        
        // Clear all input fields and uncheck all checkboxes
        document.querySelectorAll('.job-order-input, .description-input').forEach(input => {
            input.value = '';
        });
        document.querySelectorAll('.user-select-checkbox, #select-all-users').forEach(checkbox => {
            checkbox.checked = false;
        });
        
    } catch (err) {
        errorDiv.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
        errorDiv.style.display = 'block';
    }
    
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;
} 