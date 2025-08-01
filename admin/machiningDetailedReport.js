// admin/machiningDetailedReport.js
import { backendBase } from "../base.js";
import { authedFetch } from "../authService.js";
import { fetchMachines } from "../generic/machines.js";
import { fetchUsers } from "../generic/users.js";


export function showMachiningDetailedReport() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `
        <div class="row mb-3">
            <div class="col-12">
                <h3>Gruplu Talaşlı İmalat Raporu</h3>
                <form id="detailed-report-filters" class="row g-3 align-items-end">
                    <div class="col-md-2">
                        <label for="group_by" class="form-label">Gruplama</label>
                        <select class="form-select" id="group_by">
                            <option value="user">Kullanıcı</option>
                            <option value="machine">Makine</option>
                            <option value="job_no">İş No</option>
                            <option value="issue_key">TI Numarası</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Filtreler</label>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="synced_only">
                            <label class="form-check-label" for="synced_only">Sadece Jira'ya Senkronize</label>
                        </div>
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" id="manual_only">
                            <label class="form-check-label" for="manual_only">Sadece Manuel Girişler</label>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <label for="start_after" class="form-label">Başlangıç Tarihi (dahil)</label>
                        <div class="input-group">
                            <input type="date" class="form-control" id="start_after">
                            <input type="time" class="form-control" id="start_after_time" value="07:30">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <label for="start_before" class="form-label">Bitiş Tarihi (dahil)</label>
                        <div class="input-group">
                            <input type="date" class="form-control" id="start_before">
                            <input type="time" class="form-control" id="start_before_time" value="17:00">
                        </div>
                    </div>
                    <div class="col-md-2">
                        <button type="button" id="fetch-report-btn" class="btn btn-primary w-100">Raporu Getir</button>
                    </div>
                </form>
            </div>
        </div>
        <div class="row">
            <div class="col-12">
                <div id="detailed-report-table-container"></div>
            </div>
        </div>
    `;

    // Set default values for date inputs (today for finish, 7 days ago for start)
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7);
    document.getElementById('start_after').value = startDate.toISOString().slice(0, 10);
    document.getElementById('start_before').value = today.toISOString().slice(0, 10);

    document.getElementById('fetch-report-btn').addEventListener('click', async () => {
        const groupBy = document.getElementById('group_by').value;
        const syncedOnly = document.getElementById('synced_only').checked;
        const manualOnly = document.getElementById('manual_only').checked;
        const startAfter = document.getElementById('start_after').value;
        const startAfterTime = document.getElementById('start_after_time').value;
        const startBefore = document.getElementById('start_before').value;
        const startBeforeTime = document.getElementById('start_before_time').value;

        // Combine date and time for timestamps
        function toTimestamp(date, time) {
            if (!date) return null;
            const t = time || '00:00';
            const dt = new Date(`${date}T${t}:00`);
            return dt.getTime();
        }

        const params = new URLSearchParams();
        params.append('group_by', groupBy);
        if (syncedOnly) params.append('synced_only', 'true');
        if (manualOnly) params.append('manual_only', 'true');
        const startAfterTs = toTimestamp(startAfter, startAfterTime);
        const startBeforeTs = toTimestamp(startBefore, startBeforeTime);
        if (startAfterTs) params.append('start_after', Math.floor(startAfterTs));
        if (startBeforeTs) params.append('start_before', Math.floor(startBeforeTs));

        const url = `${backendBase}/machining/timer-report/?${params.toString()}`;
        const container = document.getElementById('detailed-report-table-container');
        container.innerHTML = '<div>Yükleniyor...</div>';
        try {
            // Fetch report data
            const resp = await authedFetch(url);
            if (!resp.ok) throw new Error('Rapor alınamadı');
            const data = await resp.json();
            console.log(data);
            let mergedData = [];
            let groupLabel = 'Grup';
            if (groupBy === 'user') {
                groupLabel = 'Kullanıcı';
                const users = await fetchUsers('machining');
                mergedData = users.map(user => {
                    const found = data.find(row => row.group === user.username);
                    return {
                        group: user.display_name || user.username || user.id,
                        total_hours: found ? found.total_hours : 0
                    };
                });
            } else if (groupBy === 'machine') {
                groupLabel = 'Makine';
                const machines = await fetchMachines('machining');
                mergedData = machines.map(machine => {
                    const found = data.find(row => row.group === machine.id);
                    return {
                        group: machine.name || machine.id,
                        total_hours: found ? found.total_hours : 0
                    };
                });
            } else {
                // Default: use data as is
                mergedData = data.map(row => ({
                    group: Object.values(row)[0],
                    total_hours: row.total_hours || 0
                }));
                if (groupBy === 'job_no') groupLabel = 'İş No';
                else if (groupBy === 'issue_key') groupLabel = 'TI Numarası';
            }
            // Order by hours descending
            mergedData.sort((a, b) => b.total_hours - a.total_hours);
            // Render table
            let html = `<div class="table-responsive"><table class="table table-bordered"><thead><tr><th>${groupLabel}</th><th>Saat (Toplam)</th></tr></thead><tbody>`;
            for (const row of mergedData) {
                html += `<tr><td>${row.group}</td><td>${(row.total_hours || 0).toFixed(2)}</td></tr>`;
            }
            html += '</tbody></table></div>';
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = `<div class="text-danger">Hata: ${err.message}</div>`;
        }
    });
} 