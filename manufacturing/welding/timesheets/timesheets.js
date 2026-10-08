import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { fetchTimesheetRoster, downloadTimesheetsPdf, fetchTimesheets } from '../../../../apis/welding/timesheets.js';

const MAX_RANGE_DAYS = 14;
const STATUS_BADGE = {
    printed: 'status-blue',
    scanned: 'status-purple',
    approved: 'status-green',
    blank: 'status-grey',
    void: 'status-red',
};

let roster = { teams: [], employees: [] };
let selected = new Set();
let printedRequestSeq = 0;

const $ = (id) => document.getElementById(id);

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toIso(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromIso(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function formatTr(value) {
    const d = fromIso(value);
    return d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short' }) : value;
}

/** Tomorrow, pushed to Monday when tomorrow is a Sunday. */
function defaultDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return toIso(d);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    new HeaderComponent({
        title: 'Kaynak Puantaj Formları',
        subtitle: 'Her kaynakçı için günlük kağıt puantaj formu oluşturun ve yazdırın',
        icon: 'print',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/welding/',
        onRefreshClick: async () => {
            await loadRoster();
            await loadPrinted();
        },
    });

    $('ts-date-from').value = defaultDate();
    $('ts-date-from').addEventListener('change', onDatesChanged);
    $('ts-date-to').addEventListener('change', onDatesChanged);
    $('ts-include-holidays').addEventListener('change', updateSummary);
    $('ts-select-all').addEventListener('click', () => setAll(true));
    $('ts-select-none').addEventListener('click', () => setAll(false));
    $('ts-generate').addEventListener('click', onGenerate);

    await loadRoster();
    await loadPrinted();
});

async function loadRoster() {
    try {
        roster = await fetchTimesheetRoster();
        if (selected.size === 0) {
            roster.employees.forEach((e) => selected.add(e.id));
        } else {
            const known = new Set(roster.employees.map((e) => e.id));
            selected = new Set([...selected].filter((id) => known.has(id)));
        }
        renderRoster();
    } catch (error) {
        console.error('Roster load failed', error);
        $('ts-roster').innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message || 'Çalışan listesi yüklenemedi')}</div>`;
    }
}

function renderRoster() {
    const container = $('ts-roster');
    if (!roster.employees.length) {
        container.innerHTML = '<div class="alert alert-warning mb-0">Hiç ekip üyesi bulunamadı. Önce <a href="/manufacturing/welding/teams">Ekipler</a> sayfasında ekip ve üyeleri tanımlayın.</div>';
        updateSummary();
        return;
    }

    const html = roster.teams
        .filter((team) => team.employees.length)
        .map((team) => {
            const ids = team.employees.map((e) => e.id);
            const checked = ids.every((id) => selected.has(id));
            const partial = !checked && ids.some((id) => selected.has(id));
            const rows = team.employees.map((e) => `
                <label class="ts-employee">
                    <input type="checkbox" class="form-check-input ts-emp" data-id="${e.id}" ${selected.has(e.id) ? 'checked' : ''}>
                    <span>${esc(e.full_name)}</span>
                    <span class="ts-kod">${esc(e.personel_kodu || '')}</span>
                </label>`).join('');
            return `
                <div class="ts-team">
                    <div class="ts-team-header">
                        <input type="checkbox" class="form-check-input ts-team-toggle" data-team="${team.id}" ${checked ? 'checked' : ''} ${partial ? 'data-partial="1"' : ''}>
                        <span>${esc(team.name)}</span>
                        ${team.is_active ? '' : '<span class="status-badge status-grey">pasif ekip</span>'}
                        <span class="ts-team-count">${ids.filter((id) => selected.has(id)).length}/${ids.length}</span>
                    </div>
                    <div class="ts-team-body">${rows}</div>
                </div>`;
        })
        .join('');
    container.innerHTML = html;

    container.querySelectorAll('.ts-team-toggle').forEach((box) => {
        box.indeterminate = box.dataset.partial === '1';
        box.addEventListener('change', (ev) => {
            const team = roster.teams.find((t) => String(t.id) === ev.target.dataset.team);
            if (!team) return;
            team.employees.forEach((e) => (ev.target.checked ? selected.add(e.id) : selected.delete(e.id)));
            renderRoster();
        });
    });
    container.querySelectorAll('.ts-emp').forEach((box) => {
        box.addEventListener('change', (ev) => {
            const id = Number(ev.target.dataset.id);
            if (ev.target.checked) selected.add(id); else selected.delete(id);
            renderRoster();
        });
    });
    updateSummary();
}

function setAll(flag) {
    selected = flag ? new Set(roster.employees.map((e) => e.id)) : new Set();
    renderRoster();
}

function selectedDates() {
    const from = $('ts-date-from').value;
    const to = $('ts-date-to').value || from;
    return { from, to };
}

/** Client-side estimate: Sundays are left out unless asked (holidays are decided server-side). */
function estimateDays() {
    const { from, to } = selectedDates();
    const start = fromIso(from);
    const end = fromIso(to);
    if (!start || !end || end < start) return 0;
    const includeHolidays = $('ts-include-holidays').checked;
    let days = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (!includeHolidays && d.getDay() === 0) continue;
        days += 1;
    }
    return days;
}

function onDatesChanged() {
    const { from, to } = selectedDates();
    const start = fromIso(from);
    const end = fromIso(to);
    if (start && end && end < start) {
        $('ts-date-to').value = '';
        showNotification('Bitiş tarihi başlangıçtan önce olamaz', 'warning');
    }
    updateSummary();
    loadPrinted();
}

function updateSummary() {
    const days = estimateDays();
    const count = selected.size;
    $('ts-selected-count').textContent = count ? `(${count} seçili)` : '';
    const { from, to } = selectedDates();
    const spanDays = fromIso(from) && fromIso(to) ? Math.round((fromIso(to) - fromIso(from)) / 86400000) + 1 : 0;
    let text;
    if (!from) {
        text = 'Tarih seçin.';
    } else if (spanDays > MAX_RANGE_DAYS) {
        text = `En fazla ${MAX_RANGE_DAYS} günlük aralık yazdırılabilir.`;
    } else if (!count) {
        text = 'Çalışan seçilmedi.';
    } else {
        text = `<strong>${count}</strong> çalışan × <strong>${days}</strong> gün = en fazla <strong>${count * days}</strong> sayfa`;
    }
    $('ts-summary').innerHTML = text;
    $('ts-generate').disabled = !from || !count || days === 0 || spanDays > MAX_RANGE_DAYS;
}

async function onGenerate() {
    const { from, to } = selectedDates();
    const btn = $('ts-generate');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Oluşturuluyor...';
    try {
        const { blob, sheetCount } = await downloadTimesheetsPdf({
            date_from: from,
            date_to: to,
            employee_ids: [...selected],
            include_holidays: $('ts-include-holidays').checked,
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = from === to ? `kaynak_puantaj_${from}.pdf` : `kaynak_puantaj_${from}_${to}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        showNotification(sheetCount ? `${sheetCount} sayfa oluşturuldu ve indirildi` : 'PDF indirildi', 'success');
        await loadPrinted();
    } catch (error) {
        console.error('Timesheet PDF failed', error);
        showNotification(error.message || 'Formlar oluşturulamadı', 'error');
    } finally {
        btn.innerHTML = original;
        updateSummary();
    }
}

async function loadPrinted() {
    const { from, to } = selectedDates();
    const container = $('ts-printed');
    if (!from) {
        container.innerHTML = '<div class="text-muted">Tarih seçin.</div>';
        return;
    }
    const seq = ++printedRequestSeq;
    try {
        const data = await fetchTimesheets({ date_from: from, date_to: to, page_size: 500 });
        if (seq !== printedRequestSeq) return;
        const rows = Array.isArray(data) ? data : (data.results || []);
        if (!rows.length) {
            container.innerHTML = '<div class="text-muted">Bu tarihler için henüz form yazdırılmadı.</div>';
            return;
        }
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover ts-printed-table mb-0">
                    <thead>
                        <tr>
                            <th>Tarih</th><th>Çalışan</th><th>Ekip</th><th>Form kodu</th>
                            <th>Hazır satır</th><th>Durum</th><th>Yazdırma</th><th>Son yazdıran</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((r) => `
                            <tr>
                                <td>${esc(formatTr(r.date))}</td>
                                <td>${esc(r.employee_full_name)} <span class="text-muted small">${esc(r.personel_kodu || '')}</span></td>
                                <td>${esc(r.team_name || '-')}</td>
                                <td class="ts-code">${esc(r.code)}</td>
                                <td>${(r.printed_jobs || []).length}</td>
                                <td><span class="status-badge ${STATUS_BADGE[r.status] || 'status-grey'}">${esc(r.status_display || r.status)}</span></td>
                                <td>${r.print_count}×</td>
                                <td>${esc(r.printed_by_username || '-')}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        if (seq !== printedRequestSeq) return;
        console.error('Printed sheets load failed', error);
        container.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message || 'Formlar yüklenemedi')}</div>`;
    }
}
