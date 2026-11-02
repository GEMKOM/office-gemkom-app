/**
 * Live strip (ŞU AN FABRİKADA): six items, re-rendered only by the 60 s poll.
 * Never affected by any period; office attendance is grey and has no link.
 */
import { escapeHtml, n0, num, stamp, shortDate, chip, dots, skeleton } from './util.js';
import { LIVE_DEPT, teamLabel } from './labels.js';

function item({ key, icon, label, value, sub = '', chips = [], href = null, title = '' }) {
    const tag = href ? 'a' : 'div';
    const hrefAttr = href ? ` href="${escapeHtml(href)}"` : '';
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<${tag} class="dash-live-item${href ? ' dash-live-link' : ''}" data-live="${key}"${hrefAttr}${t}>
        <div class="dash-live-label"><i class="fas fa-${icon}"></i>${escapeHtml(label)}</div>
        <div class="dash-live-value">${value}</div>
        ${sub ? `<div class="dash-live-sub">${sub}</div>` : ''}
        ${chips.length ? `<div class="dash-live-chips">${chips.join('')}</div>` : ''}
    </${tag}>`;
}

export function renderLive(host, live, { errors = {}, offline = false } = {}) {
    if (!host) return;
    if (live === undefined) {
        host.dataset.state = 'loading';
        host.innerHTML = `<div class="dash-live-head"><span class="dash-live-title">ŞU AN FABRİKADA</span></div>
            <div class="dash-live-items">${[1, 2, 3, 4, 5, 6].map(() => `<div class="dash-live-item">${skeleton(3)}</div>`).join('')}</div>`;
        return;
    }
    if (!live) {
        host.dataset.state = 'error';
        host.innerHTML = `<div class="dash-live-head"><span class="dash-live-title">ŞU AN FABRİKADA</span>${chip('red', 'bağlantı yok')}</div>
            <div class="dash-empty small">${escapeHtml(errors.live ? `Canlı şerit yüklenemedi: ${errors.live}` : 'Canlı şerit yüklenemedi')}</div>`;
        return;
    }
    host.dataset.state = 'ready';
    const at = stamp(live.generated_at);
    const items = [];

    const pe = live.people;
    if (pe) {
        const total = n0(pe.total);
        const by = pe.by_department || {};
        const deptParts = Object.keys(LIVE_DEPT).filter((k) => n0(by[k]) > 0).map((k) => `${LIVE_DEPT[k]} ${num(by[k])}`);
        const chips = [];
        if (n0(pe.stale_count) >= 1) chips.push(chip('orange', `unutulmuş ${num(pe.stale_count)}${pe.stale_oldest_hours ? ` (${num(pe.stale_oldest_hours, 0)} sa)` : ''}`, '12 saatten uzun süredir açık sayaçlar'));
        items.push(item({
            key: 'people', icon: 'stopwatch', label: 'Sayaçta çalışan', value: total > 0 ? `${num(total)} <span class="dash-live-unit">kişi</span>` : '<span class="dash-live-empty">Şu an açık sayaç yok</span>',
            sub: deptParts.join(' · '), chips, href: '/manufacturing/machining/dashboard',
        }));
    }
    const mc = live.machines;
    if (mc) {
        const total = n0(mc.total);
        const down = n0(mc.down);
        const longest = Array.isArray(mc.down_list) && mc.down_list.length ? Math.max(...mc.down_list.map((d) => n0(d.hours_down))) : 0;
        items.push(item({
            key: 'machines', icon: 'gears', label: 'Makineler',
            value: total > 0 ? `${num(mc.running)}/${num(total)} <span class="dash-live-unit">çalışıyor</span>` : '<span class="dash-live-empty">Üretim makinesi tanımlı değil</span>',
            sub: total > 0 ? (down >= 1 ? `${chip('red', `${num(down)} arızada`)}${longest ? ` <span class="text-muted">en uzun ${num(longest, 0)} sa</span>` : ''}` : 'arıza yok') : '',
            href: '/manufacturing/maintenance/dashboard',
            title: Array.isArray(mc.down_list) && mc.down_list.length ? mc.down_list.map((d) => `${d.name || ''} ${num(d.hours_down, 1)} sa`).join(', ') : '',
        }));
    }
    const dt = live.downtime;
    if (dt) {
        const waiting = n0(dt.waiting_material) + n0(dt.waiting_tools);
        const any = n0(dt.break) + waiting + n0(dt.fault) + n0(dt.other) > 0;
        items.push(item({
            key: 'downtime', icon: 'mug-hot', label: 'Mola / duruş',
            value: any ? `Mola ${num(dt.break)}` : '<span class="dash-live-empty">Duruş yok</span>',
            sub: any ? dots(
                waiting >= 1 ? chip('orange', `Malzeme bekliyor ${num(dt.waiting_material)} · Takım ${num(dt.waiting_tools)}`) : `Malzeme bekliyor ${num(dt.waiting_material)} · Takım ${num(dt.waiting_tools)}`,
                `Arıza ${num(dt.fault)}`, n0(dt.other) > 0 ? `Diğer ${num(dt.other)}` : '',
            ) : '',
            href: '/manufacturing/maintenance/dashboard',
        }));
    }
    const wl = live.welding_last;
    if (wl) {
        const stale = n0(wl.days_since_wd) > 3;
        items.push(item({
            key: 'welding_last', icon: 'fire', label: 'Kaynak son giriş',
            value: wl.date ? (stale ? chip('orange', shortDate(wl.date), `${num(wl.days_since_wd)} iş günü önce`) : shortDate(wl.date)) : '<span class="dash-live-empty">Kaynak saati girilmemiş</span>',
            sub: wl.date ? dots(`${num(wl.hours)} sa`, `${num(wl.welders)} kaynakçı`, stale ? `${num(wl.days_since_wd)} iş günü önce` : '') : '',
            href: '/manufacturing/welding/reports', title: 'Kaynak saatleri elle ve gecikmeli girilir',
        }));
    }
    const ot = live.overtime_tonight;
    if (ot) {
        const approved = n0(ot.approved_people);
        const pending = n0(ot.pending_people);
        const teams = Object.entries(ot.by_team || {}).filter(([, v]) => n0(v) > 0).map(([k, v]) => `${teamLabel(k)} ${num(v)}`);
        items.push(item({
            key: 'overtime_tonight', icon: 'moon', label: 'Bu akşam mesai',
            value: approved + pending > 0 ? `${num(approved)} <span class="dash-live-unit">kişi onaylı</span>` : '<span class="dash-live-empty">Bu akşam mesai planı yok</span>',
            sub: teams.join(' · '),
            chips: pending >= 1 ? [chip('orange', `${num(pending)} onay bekliyor`)] : [],
            href: '/general/overtime/pending',
        }));
    }
    const of = live.office;
    if (of) {
        items.push(item({
            key: 'office', icon: 'building', label: 'Ofis yoklama',
            value: n0(of.tracked_30d) > 0 ? `${num(of.present)}/${num(of.tracked_30d)}` : '<span class="dash-live-empty">Yoklama kaydı yok</span>',
            sub: n0(of.tracked_30d) > 0 ? `<span class="text-muted">kapsam ${num(of.tracked_30d)}/${num(of.active_users)}</span>` : '',
            title: `Yalnızca ofis IP girişleri · kapsam ${num(of.tracked_30d)}/${num(of.active_users)}`,
        }));
    }

    host.innerHTML = `
        <div class="dash-live-head">
            <span class="dash-live-title"><i class="fas fa-tower-broadcast me-1"></i>ŞU AN FABRİKADA${at ? ` · <span data-live-stamp>${escapeHtml(at)}</span>` : ''}</span>
            ${offline ? chip('red', 'bağlantı yok') : '<span class="dash-live-pulse" title="60 sn\'de bir yenilenir"></span>'}
        </div>
        <div class="dash-live-items">${items.join('') || `<div class="dash-empty small">Canlı veri yok</div>`}</div>`;
}
