import { updateActiveTimers, updateMachines } from './adminView.js';
import { getSyncedNow } from '../generic/timeService.js';
import { stopTimerShared } from '../machining/machiningService.js';

export async function showMachiningLiveReport() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `
        <div class="d-flex justify-content-end mb-3">
            <button id="refresh-btn" class="btn btn-primary"> ⟳ Yenile</button>
        </div>
        <div class="row">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="card-title mb-0">Aktif Zamanlayıcılar</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Kullanıcı</th>
                                        <th>Makine</th>
                                        <th>Görev</th>
                                        <th>Süre</th>
                                        <th>İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody id="active-timers">
                                    <!-- Active timers will be inserted here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h5 class="card-title mb-0">Makineler</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Makine Adı</th>
                                        <th>Durum</th>
                                        <th>İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody id="machines-list">
                                    <!-- Users will be inserted here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('refresh-btn').addEventListener('click', async () => {
        await updateActiveTimers();
        updateMachines();
    });
    await updateActiveTimers();
    updateMachines();
    setupMachiningTableEventListeners();
}

function setupMachiningTableEventListeners() {
    const tbody = document.getElementById('active-timers');
    if (!tbody) return;
    tbody.addEventListener('click', async (e) => {
        const stopBtn = e.target.closest('.stop-only');
        if (stopBtn) {
            const timerId = stopBtn.getAttribute('data-timer-id');
            await handleStopOnly(timerId);
        }
    });
}

async function handleStopOnly(timerId) {
    const finishTime = getSyncedNow();
    // Stop timer with syncToJira=false
    const stopped = await stopTimerShared({ timerId, finishTime, syncToJira: false });
    if (stopped) {
        alert(`Timer ${timerId} sadece durduruldu ve veritabanına kaydedildi!`);
    } else {
        alert('Timer durdurulamadı!');
    }
    
    await updateActiveTimers();
}