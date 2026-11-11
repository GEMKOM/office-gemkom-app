import { hasRouteAccess } from '@/auth/accessControl';
import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { AttentionPanel, HubPanels, RecordsPanel } from '@/pages/hub/HubPanels';
import { NeoHomePanel } from '@/neo';
import { allNavPages } from '@/shell/pageVisits';
import { useUnreadCount } from '@/shell/notifications';
import { SpecialDaysPanel, useTodayOccasions } from '@/shell/occasion';
import { formatDate, formatNumber } from '@/lib/format';
import { PageHeader, Panel, PendingValue, type PageFigure } from '@/ui';
import { useApprovals, userDepartment } from './approvals';
import { greeting } from './homeFormat';
import { NotificationsPanel, ShortcutsBar, TodayPanel } from './HomePanels';
import { usePinnedPages } from './pinnedPages';
import { DEPARTMENT_LABELS, shortcuts } from './shortcuts';
import { TASK_PAGES, useMyIsg, useMyRequests, useMyTasks } from './work';
import css from './HomePage.module.css';

const figure = (value: number | undefined, failed = false) =>
  failed ? '-' : value === undefined ? <PendingValue /> : formatNumber(value);

const sum = (...values: (number | undefined)[]) =>
  values.some((v) => v === undefined) ? undefined : values.reduce<number>((a, b) => a + (b ?? 0), 0);

/**
 * The landing page at /: what needs the signed-in user right now. Approvals
 * waiting on them, their tasks and İSG actions, their own requests, today's
 * PDKS and notifications, with the shortcuts right under the band. What waits
 * on them wears a red badge, which goes when it is cleared. Every request
 * starts at once, and nothing is asked for a list the user cannot open.
 */
export function HomePage() {
  const { user } = useAuth();
  const departmentCode = userDepartment(user);
  const positionTitle = typeof user.position_title === 'string' ? user.position_title : null;

  const approvals = useApprovals({ departmentCode });
  const tasks = useMyTasks(user.id);
  const isg = useMyIsg();
  const requests = useMyRequests(user.id);
  const unread = useUnreadCount();
  const occasions = useTodayOccasions();
  const { pinned, toggle } = usePinnedPages(user.id);
  const menuPages = useMemo(() => allNavPages().filter((page) => page.path !== '/' && hasRouteAccess(page.path)), []);

  // Tasks are any department's; the panel shows for task departments and for
  // anyone who has some.
  const ownTaskPage = departmentCode ? TASK_PAGES[departmentCode] : undefined;
  const showTasks = Boolean(ownTaskPage) || Boolean(tasks.count);
  const tasksMore = ownTaskPage && hasRouteAccess(ownTaskPage) ? `${ownTaskPage}?assigned_to=${user.id}` : undefined;
  const showIsg = Boolean(isg.count);

  const stats: PageFigure[] = [];
  if (!approvals.none) {
    stats.push({
      id: 'home-approvals',
      label: 'Onayınızı Bekleyen',
      value: figure(approvals.total),
      icon: 'fas fa-stamp',
      link: approvals.onlyRoute ?? undefined,
    });
  }
  if (showTasks || showIsg) {
    stats.push({
      id: 'home-tasks',
      label: 'Açık İşim',
      value: figure(sum(tasks.count, isg.count)),
      icon: 'fas fa-list-check',
      link: tasksMore,
    });
    stats.push({
      id: 'home-overdue',
      label: 'Geciken',
      value: figure(sum(tasks.overdue.data, isg.overdue.data), tasks.overdue.isError && isg.overdue.isError),
      icon: 'fas fa-triangle-exclamation',
      link: tasksMore,
    });
  }
  stats.push({
    id: 'home-unread',
    label: 'Okunmamış Bildirim',
    value: figure(unread.data, unread.isError),
    icon: 'fas fa-bell',
    link: '/general/notifications',
  });

  const firstName = user.first_name || user.username;
  // On a special day the band greets with it: the person's own day takes the
  // title ("İyi ki doğdunuz, Ayşe"), a holiday or company day leads the subtitle.
  const occasion = occasions.primary;
  const ownDay = occasion && (occasion.kind === 'birthday' || occasion.kind === 'work_anniversary');
  const title = ownDay && occasion.title ? occasion.title : `${greeting()}, ${firstName}`;
  const subtitle = [
    !ownDay && occasion ? occasion.title || occasion.name : null,
    // The day the occasions are for (an HR preview shows another day).
    formatDate(occasions.data?.date || new Date(), { weekday: 'long', day: 'numeric', month: 'long' }),
    positionTitle,
    departmentCode ? DEPARTMENT_LABELS[departmentCode] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const left = [
    !approvals.none ? (
      <RecordsPanel
        key="approvals"
        title="Onayınızı Bekleyenler"
        icon="fas fa-stamp"
        query={approvals.records}
        badge={approvals.total}
        noun="Onay bekleyen kayıtlar"
        empty="Şu an onayınızı bekleyen bir şey yok. Yeni bir talep geldiğinde burada görünür."
      />
    ) : null,
    showTasks ? (
      <RecordsPanel
        key="tasks"
        title="Görevlerim"
        icon="fas fa-list-check"
        more={tasksMore}
        query={tasks.records}
        noun="Görevler"
        empty="Üzerinize atanmış açık bir görev yok."
      />
    ) : null,
    showIsg ? (
      <RecordsPanel
        key="isg"
        title="İSG Aksiyonlarım"
        icon="fas fa-helmet-safety"
        more="/isg/issues?mine=true"
        query={isg.records}
        noun="İSG aksiyonları"
        empty="Size atanmış açık bir İSG aksiyonu yok."
      />
    ) : null,
    requests.visible ? (
      <RecordsPanel
        key="requests"
        title="Taleplerim"
        icon="fas fa-paper-plane"
        query={requests.records}
        noun="Talepleriniz"
        empty="Henüz bir izin ya da mesai talebiniz yok."
      />
    ) : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        stats={stats}
        figureStyle="tiles"
      />
      <ShortcutsBar pages={shortcuts(user.id, departmentCode, pinned)} addable={menuPages} onToggle={toggle} />
      <HubPanels>
        <div key="main" className={css.column}>
          {left.length > 0 ? (
            left
          ) : (
            <Panel title="Sizi Bekleyenler" icon="fas fa-mug-hot">
              <p className={css.calm}>
                Üzerinizde bekleyen bir onay, görev ya da talep yok. Soldaki menüden ya da kısayollardan devam edebilirsiniz.
              </p>
            </Panel>
          )}
        </div>
        <div key="side" className={css.column}>
          <NeoHomePanel />
          <SpecialDaysPanel />
          {!approvals.none ? (
            <AttentionPanel title="Onay Kuyruklarım" icon="fas fa-inbox" items={approvals.items} badges />
          ) : null}
          <TodayPanel />
          <NotificationsPanel unread={unread.data} />
        </div>
      </HubPanels>
    </>
  );
}
