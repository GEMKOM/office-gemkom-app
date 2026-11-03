import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { shippingPendingCountQueryOptions } from '@/api/finance/hubs';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { TaskDeadlinesPanel, useDepartmentTaskFigures } from '../hub/departmentTasks';
import { AttentionPanel, HubPanels, type AttentionItem } from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';

const PROJECTS = '/logistics/projects';
const COST_LINES = '/logistics/cost-lines';

export function LogisticsHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canCosts = hasRouteAccess(COST_LINES);
  const missingCost = useQuery({ ...shippingPendingCountQueryOptions(), enabled: canCosts });
  const tasks = useDepartmentTaskFigures('logistics', PROJECTS);

  // Ported from logistics/logistics.js. Both were blue; Maliyet Satırları
  // takes orange, the colour of what is waiting.
  const cards: MenuCard[] = [
    {
      title: 'Projeler',
      description: 'Lojistik departmanı görevlerini görüntüleyin ve yönetin.',
      icon: 'fas fa-project-diagram',
      iconColor: 'primary',
      link: PROJECTS,
      stat: { value: countValue(tasks.active), label: 'aktif sevkiyat görevi' },
    },
    {
      title: 'Maliyet Satırları',
      description: 'Sevkiyat maliyeti girilmemiş iş emirleri ve maliyet satırları.',
      icon: 'fas fa-euro-sign',
      iconColor: 'orange',
      link: COST_LINES,
      stat: { value: countValue(missingCost), label: 'iş emri maliyet bekliyor' },
    },
  ];

  const stats: PageFigure[] = [
    ...tasks.figures.slice(0, 2),
    ...(canCosts
      ? [
          countFigure(
            {
              id: 'shipping-missing',
              label: 'Maliyet Girilmemiş',
              icon: 'fas fa-euro-sign',
              link: COST_LINES,
            },
            missingCost,
          ),
        ]
      : []),
  ];

  const queues: AttentionItem[] = [];
  if (tasks.enabled) {
    queues.push(
      {
        id: 'queue-overdue',
        label: 'Hedefi geçen görevler',
        hint: 'Sevkiyat görevi, hedef tarihi geçti',
        icon: 'fas fa-flag',
        color: 'orange',
        link: PROJECTS,
        count: tasks.overdue,
      },
      {
        id: 'queue-blocked',
        label: 'Engellenen görevler',
        icon: 'fas fa-ban',
        color: 'red',
        link: `${PROJECTS}?status=blocked`,
        count: tasks.blocked,
      },
    );
  }
  if (canCosts) {
    queues.push({
      id: 'queue-cost',
      label: 'Sevkiyat maliyeti',
      hint: 'Maliyet satırı girilmemiş iş emri',
      icon: 'fas fa-euro-sign',
      color: 'orange',
      link: COST_LINES,
      count: missingCost,
    });
  }

  return (
    <MenuCards
      title="Lojistik Modülü"
      subtitle="Lojistik süreçlerinizi yönetin ve optimize edin"
      stats={stats}
      compact={queues.length > 0}
      cards={cards}
    >
      {queues.length > 0 ? (
        <HubPanels>
          {tasks.enabled ? <TaskDeadlinesPanel department="logistics" route={PROJECTS} /> : null}
          <AttentionPanel title="Lojistiği Bekleyenler" icon="fas fa-inbox" items={queues} />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
