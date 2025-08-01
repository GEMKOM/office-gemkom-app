import { authedFetch } from '../authService.js';
import { proxyBase } from '../base.js';

const JIRA_BASE = 'https://gemkom-1.atlassian.net'; // Use your actual Jira base URL

export async function showMesaiTaleplerim() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = '<div class="text-center mt-4">Yükleniyor...</div>';

    // Helper function to extract text from Atlassian Document Format
    function extractTextFromADF(adfContent) {
        if (!adfContent || !adfContent.content) return '';
        
        let text = '';
        
        function processContent(content) {
            if (Array.isArray(content)) {
                content.forEach(item => processContent(item));
            } else if (typeof content === 'object') {
                if (content.type === 'text' && content.text) {
                    text += content.text;
                } else if (content.content) {
                    processContent(content.content);
                }
            }
        }
        
        processContent(adfContent.content);
        return text.trim();
    }
    const user = JSON.parse(localStorage.getItem('user'));
    let jql = `project=MES AND Departman~"${user.team_label}" AND (parent is not EMPTY) ORDER BY created DESC`;
    if (user.is_superuser){
      jql = `project=MES AND (parent is not EMPTY) ORDER BY created DESC`
    }
    // 1. Fetch all MES epics and their stories for current user
    const fields = 'summary,description,key,issuetype,parent,customfield_11172,customfield_11173,customfield_11167,customfield_10117,customfield_11170';
    const jiraUrl = `${JIRA_BASE}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(fields)}&maxResults=5000`;
    const url = proxyBase + encodeURIComponent(jiraUrl);
    let issues = [];
    try {
        const res = await authedFetch(url);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        issues = data.issues || [];
    } catch (e) {
        mainContent.innerHTML = '<div class="text-danger">Veriler alınamadı.</div>';
        return;
    }

    // 2. Group issues by epic (parent)
    const epicGroups = {};
    
    issues.forEach(issue => {
        if (issue.fields.parent) {
            const epicKey = issue.fields.parent.key;
            const epicSummary = issue.fields.parent.fields.summary;
            
            if (!epicGroups[epicKey]) {
                epicGroups[epicKey] = {
                    epic: {
                        key: epicKey,
                        summary: epicSummary,
                        startDate: issue.fields.parent.fields.customfield_11172,
                        endDate: issue.fields.parent.fields.customfield_11173,
                        status: issue.fields.parent.fields.status?.name || 'Unknown'
                    },
                    stories: []
                };
            }
            
            // Extract description text from ADF format
            const descriptionText = extractTextFromADF(issue.fields.description);
            
            // Add story to epic group
            epicGroups[epicKey].stories.push({
                key: issue.key,
                summary: issue.fields.summary,
                description: descriptionText,
                startDate: issue.fields.customfield_11172,
                endDate: issue.fields.customfield_11173,
                customfield_11167: issue.fields.customfield_11167 || '-',
                customfield_10117: issue.fields.customfield_10117 || '-',
                customfield_11170: issue.fields.customfield_11170 || '-'
            });
        }
    });

    // 3. Sort epics by start date (latest first)
    const sortedEpics = Object.values(epicGroups).sort((a, b) => {
        const aDate = a.epic.startDate ? new Date(a.epic.startDate) : 0;
        const bDate = b.epic.startDate ? new Date(b.epic.startDate) : 0;
        return bDate - aDate;
    });

    // 4. Render epics as collapsible, with stories inside
    mainContent.innerHTML = '<h4 class="mb-4">Mesai Taleplerim</h4>';
    if (sortedEpics.length === 0) {
        mainContent.innerHTML += '<div class="text-muted">Hiç mesai talebi bulunamadı.</div>';
        return;
    }
    
    sortedEpics.forEach((epicGroup, idx) => {
        const epic = epicGroup.epic;
        const stories = epicGroup.stories;
        const start = stories[0].startDate ? formatDateTime(stories[0].startDate) : '-';
        const end = stories[0].endDate ? formatDateTime(stories[0].endDate) : '-';
        const epicId = `epic-${epic.key}`;
        
        mainContent.innerHTML += `
        <div class="card mb-3">
          <div class="card-header" style="cursor:pointer;" data-bs-toggle="collapse" data-bs-target="#${epicId}">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <b>
                    <a href="https://gemkom-1.atlassian.net/browse/${epic.key}" target="_blank" class="text-decoration-none text-dark">
                    ${epic.summary}
                    </a>
                </b>
                <span class="text-secondary">
                    (<a href="https://gemkom-1.atlassian.net/browse/${epic.key}" target="_blank" class="text-decoration-none">
                    ${epic.key}
                    </a>)
                </span>
                <span class="badge py-1 ms-2 bg-${
                    epic.status === 'İŞLENİYOR' ? 'primary' :
                    epic.status === 'Tamamlandı' ? 'success' :
                    'secondary'
                }">
                    ${epic.status}
                </span>
                </div>
              <div class="text-end">
                <div class="small text-muted">Başlangıç: <b>${start}</b></div>
                <div class="small text-muted">Bitiş: <b>${end}</b></div>
                <div class="small text-muted">${stories.length} Çalışan</div>
              </div>
            </div>
          </div>
          <div id="${epicId}" class="collapse">
            <div class="card-body p-0">
              ${stories.length === 0 ? 
                '<div class="p-3 text-muted">Hiç story yok.</div>' :
                `
                <div class="table-responsive">
                  <table class="table table-sm table-hover mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Key</th>
                        <th>Summary</th>
                        <th>Açıklama</th>
                        <th>Başlangıç</th>
                        <th>Bitiş</th>
                        <th>Departman</th>
                        <th>İş Emri</th>
                        <th>Görev</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${stories.map(story => `
                        <tr>
                          <td><a href="https://gemkom-1.atlassian.net/browse/${story.key}" target="_blank" class="text-decoration-none"><strong>${story.key}</strong></a></td>
                          <td>${story.summary}</td>
                          <td>${story.description || '-'}</td>
                          <td>${story.startDate ? formatDateTime(story.startDate) : '-'}</td>
                          <td>${story.endDate ? formatDateTime(story.endDate) : '-'}</td>
                          <td>${story.customfield_11167}</td>
                          <td>${story.customfield_10117}</td>
                          <td>${story.customfield_11170}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
                `}
            </div>
          </div>
        </div>
        `;
    });
    
    // Bootstrap collapse support
    setTimeout(() => {
      // Remove the custom click handler - let Bootstrap handle collapse properly
      // The data-bs-toggle="collapse" attribute will handle the toggle automatically
    }, 100);
}

function formatDateTime(dt) {
    // Jira date format: 2024-06-01T08:00:00.000+0300
    const d = new Date(dt);
    if (isNaN(d)) return '-';
    return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

export function toJiraDateTimeLocal(dateStr) {
  return `${dateStr}:00.000+0300`; // Assuming "2024-06-01T17:00"
}