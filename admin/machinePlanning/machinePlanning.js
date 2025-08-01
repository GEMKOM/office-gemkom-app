import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
import { fetchMachines } from '../../generic/machines.js';
import { extractResultsFromResponse } from '../../generic/paginationHelper.js';

const planningColumns = [
    { id: "machine", label: "Makine" },
    { id: "job_no", label: "İş Emri Numarası" },
    { id: "estimated", label: "Tahminler (s)" },
    { id: "spent", label: "Harcanan Saat" },
    { id: "progress", label: "İlerleme (saat)" },
    { id: "finish_time", label: "Bitiş Tarihi" },
];

export async function showMachinePlanning() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="mb-0">Makine Planlaması</h3>
            <button id="refresh-planning-btn" class="btn btn-primary">
                <i class="fas fa-sync-alt"></i> Yenile
            </button>
        </div>
        <div id="planning-container">
            <div class="text-center">
                <div class="spinner-border" role="status">
                    <span class="visually-hidden">Yükleniyor...</span>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('refresh-planning-btn').addEventListener('click', async () => {
        await loadMachinePlanning();
    });
    await loadMachinePlanning();
}

async function loadMachinePlanning() {
    const container = document.getElementById('planning-container');
    container.innerHTML = `
        <div class="text-center">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">Yükleniyor...</span>
            </div>
        </div>
    `;
    
    try {
        const tasksResponse = await authedFetch(`${backendBase}/machining/tasks/?completion_date__isnull=true&page_size=1000`);
        if (!tasksResponse.ok) throw new Error('Görevler alınamadı');
        const tasksResult = await tasksResponse.json();
        const tasks = extractResultsFromResponse(tasksResult) || [];
        const machines = await fetchMachines('machining');
        
        // Group tasks by machine
        const machineGroups = {};
        machines.forEach(machine => {
            machineGroups[machine.id] = {
                machine: machine,
                tasks: [],
                totalEstimated: 0,
                totalSpent: 0,
                totalRemaining: 0
            };
        });
        
        tasks.forEach(task => {
            if (task.machine_fk && machineGroups[task.machine_fk]) {
                const estimated = Number(task.estimated_hours) || 0;
                const spent = Number(task.total_hours_spent) || 0;
                const remaining = Math.max(0, estimated - spent);
                machineGroups[task.machine_fk].tasks.push({
                    ...task,
                    remaining_hours: remaining
                });
                machineGroups[task.machine_fk].totalEstimated = Number(machineGroups[task.machine_fk].totalEstimated || 0) + estimated;
                machineGroups[task.machine_fk].totalSpent = Number(machineGroups[task.machine_fk].totalSpent || 0) + spent;
                machineGroups[task.machine_fk].totalRemaining = Number(machineGroups[task.machine_fk].totalRemaining || 0) + remaining;
            }
        });
        
        renderMachinePlanningTable(machineGroups);
    } catch (error) {
        console.error('Error loading machine planning:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <strong>Hata:</strong> Makine planlaması yüklenirken bir hata oluştu: ${error.message}
            </div>
        `;
    }
}

function renderMachinePlanningTable(machineGroups) {
    const container = document.getElementById('planning-container');
    let html = `
        <div class="planning-table-container">
        <div class="table-responsive">
        <table class="table table-bordered align-middle mb-0">
            <thead class="table-light">
                <tr>
                    <th style="width:40px"></th>
                    ${planningColumns.map(col => `<th>${col.label}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `;
    
    // Sort machines by earliest finish_time among their tasks
    const sortedMachines = Object.entries(machineGroups).sort(([, a], [, b]) => {
        const aEarliest = a.tasks.reduce((min, t) => {
            if (!t.finish_time) return min;
            const tTime = new Date(t.finish_time).getTime();
            return tTime < min ? tTime : min;
        }, Infinity);
        const bEarliest = b.tasks.reduce((min, t) => {
            if (!t.finish_time) return min;
            const tTime = new Date(t.finish_time).getTime();
            return tTime < min ? tTime : min;
        }, Infinity);
        return aEarliest - bEarliest;
    });
    
    for (const [machineId, group] of sortedMachines) {
        const machine = group.machine;
        // Sort tasks by finish_time ascending
        group.tasks.sort((a, b) => {
            const aTime = a.finish_time ? new Date(a.finish_time).getTime() : Infinity;
            const bTime = b.finish_time ? new Date(b.finish_time).getTime() : Infinity;
            return aTime - bTime;
        });
        
        html += `<tr class="machine-row" data-machine-id="${machineId}">`;
        html += `<td class="collapse-toggle" data-machine-id="${machineId}">
            <button class="collapse-toggle-btn" data-machine-id="${machineId}" aria-label="Aç/Kapat">
                <span class="collapse-icon" data-machine-id="${machineId}">&#8250;</span>
            </button>
        </td>`;
        html += planningColumns.map(col => renderMachineCell(col, group, machine)).join('');
        html += `</tr>`;
        
        group.tasks.forEach(task => {
            html += `<tr class="task-row" data-machine-id="${machineId}" style="display:none"><td></td>`;
            html += planningColumns.map(col => renderTaskCell(col, task)).join('');
            html += `</tr>`;
        });
    }
    
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
    
    // Collapse/expand logic
    document.querySelectorAll('.collapse-toggle-btn').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            const machineId = this.getAttribute('data-machine-id');
            const icon = document.querySelector(`.collapse-icon[data-machine-id="${machineId}"]`);
            const taskRows = document.querySelectorAll(`.task-row[data-machine-id="${machineId}"]`);
            const isOpen = icon.classList.contains('open');
            
            if (isOpen) {
                icon.classList.remove('open');
                icon.innerHTML = '&#8250;';
                icon.style.transform = ''; // Reset rotation
                taskRows.forEach(row => row.style.background = '');
                taskRows.forEach(row => row.style.display = 'none');
            } else {
                icon.classList.add('open');
                icon.innerHTML = '&#8250;';
                icon.style.transform = 'rotate(90deg)';
                taskRows.forEach(row => row.style.display = '');
                setTimeout(() => { taskRows.forEach(row => row.style.background = '#f6faff'); }, 80);
            }
        });
    });
}

function renderMachineCell(col, group, machine) {
    const totalEstimated = Number(group.totalEstimated) || 0;
    const totalSpent = Number(group.totalSpent) || 0;
    const progress = totalEstimated > 0 ? Math.min(100, (totalSpent / totalEstimated) * 100) : 0;
    
    switch (col.id) {
        case "machine":
            return `<td>${machine.name}</td>`;
        case "progress":
            return `<td style="position:relative;">
                <div class="progress" style="position:relative;">
                    <div class="progress-bar-inner bg-success" style="width: ${progress}%; background: linear-gradient(90deg, #4ade80 0%, #22d3ee 100%);"></div>
                    <div class="progress-bar">${progress.toFixed(1)}%</div>
                </div>
            </td>`;
        case "estimated":
            return `<td>${totalEstimated.toFixed(2)} (Toplam)</td>`;
        case "spent":
            return `<td>${totalSpent.toFixed(2)}</td>`;
        case "finish_time": {
            // Find the latest finish_time among tasks
            const latest = group.tasks.reduce((max, t) => {
                if (!t.finish_time) return max;
                const tTime = new Date(t.finish_time).getTime();
                return tTime > max ? tTime : max;
            }, 0);
            return `<td>${latest ? new Date(latest).toLocaleDateString('tr-TR') : ''}</td>`;
        }
        case "job_no":
            return `<td></td>`;
        default:
            return `<td></td>`;
    }
}

function renderTaskCell(col, task) {
    const taskEstimated = Number(task.estimated_hours) || 0;
    const taskSpent = Number(task.total_hours_spent) || 0;
    const taskProgress = taskEstimated > 0 ? Math.min(100, (taskSpent / taskEstimated) * 100) : 0;
    
    switch (col.id) {
        case "machine":
            return `<td class="task-title">${task.key ? `<b>${task.key}</b>` : ''} ${task.name || ''}</td>`;
        case "progress":
            return `<td style="position:relative;">
                <div class="progress" style="position:relative;">
                    <div class="progress-bar-inner bg-info" style="width: ${taskProgress}%; background: linear-gradient(90deg, #38bdf8 0%, #818cf8 100%);"></div>
                    <div class="progress-bar">${taskProgress.toFixed(1)}%</div>
                </div>
            </td>`;
        case "estimated":
            return `<td>${taskEstimated.toFixed(2)}</td>`;
        case "spent":
            return `<td>${taskSpent.toFixed(2)}</td>`;
        case "finish_time":
            return `<td>${task.finish_time ? new Date(task.finish_time).toLocaleDateString('tr-TR') : ''}</td>`;
        case "job_no":
            return `<td>${task.job_no || ''}</td>`;
        default:
            return `<td></td>`;
    }
}

 