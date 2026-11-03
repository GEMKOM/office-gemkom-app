import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import {
  departmentRequestsToTransferCountQueryOptions,
  planningRequestCountQueryOptions,
  procurementLinesPendingCountQueryOptions,
} from '@/api/planning/hubs';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { TaskDeadlinesPanel, useDepartmentTaskFigures } from '../hub/departmentTasks';
import { AttentionPanel, HubPanels, type AttentionItem } from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';

const REQUESTS = '/planning/department-requests';
const PROCUREMENT_LINES = '/planning/procurement-lines';
const PROJECTS = '/planning/projects';

export function PlanningHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canRequests = hasRouteAccess(REQUESTS);
  const canLines = hasRouteAccess(PROCUREMENT_LINES);
  const toTransfer = useQuery({
    ...departmentRequestsToTransferCountQueryOptions(),
    enabled: canRequests,
  });
  const stockCheck = useQuery({
    ...planningRequestCountQueryOptions('pending_inventory'),
    enabled: canRequests,
  });
  const erpEntry = useQuery({
    ...planningRequestCountQueryOptions('pending_erp_entry'),
    enabled: canRequests,
  });
  const missingCost = useQuery({
    ...procurementLinesPendingCountQueryOptions(),
    enabled: canLines,
  });
  const tasks = useDepartmentTaskFigures('planning', PROJECTS);

  // Ported from planning/planning.js. All seven were blue; neighbours now
  // differ, the request and cost queues in the waiting colours.
  const cards: MenuCard[] = [
    {
      title: 'Departman Talepleri',
      description: 'Onaylanan departman taleplerinin listesi ve transfer işlemleri.',
      icon: 'fas fa-boxes',
      iconColor: 'warning',
      link: REQUESTS,
      stat: { value: countValue(toTransfer), label: 'aktarılmayı bekliyor' },
    },
    {
      title: 'Görev Şablonları',
      description: 'Departman görev şablonlarını yönetin ve oluşturun.',
      icon: 'fas fa-tasks',
      iconColor: 'secondary',
      link: '/planning/task-templates',
    },
    {
      title: 'Stok',
      description: 'Stok yönetimi ve stok kartları.',
      icon: 'fas fa-warehouse',
      iconColor: 'success',
      link: '/planning/inventory',
    },
    {
      title: 'Projeler',
      description: 'Planlama departmanı görevlerini görüntüleyin ve yönetin.',
      icon: 'fas fa-project-diagram',
      iconColor: 'primary',
      link: PROJECTS,
      stat: { value: countValue(tasks.active), label: 'aktif görev' },
    },
    {
      title: 'Proje Planlama',
      description: 'İmalat iş planını kurun, kapasite önerilerini ve sapmaları takip edin.',
      icon: 'fas fa-calendar-alt',
      iconColor: 'purple',
      link: '/planning/project-planning',
    },
    {
      title: 'Malzeme Maliyeti Satırları',
      description: 'Satın alma bekleyen iş emirleri ve malzeme maliyeti satırlarını yönetin.',
      icon: 'fas fa-shopping-cart',
      iconColor: 'orange',
      link: PROCUREMENT_LINES,
      stat: { value: countValue(missingCost), label: 'iş emri maliyet bekliyor' },
    },
    {
      title: 'Planlama Kalemleri',
      description: 'Planlama taleplerindeki ürün/kalem listesini filtreleyin ve takip edin.',
      icon: 'fas fa-list',
      iconColor: 'info',
      link: '/planning/items',
    },
    // CNC and linear cutting moved here from İmalat (kesim planı, nesting,
    // fire plakalar, kapasite planı); their hubs are in manufacturing/hubs.ts.
    {
      title: 'CNC Kesim',
      description: 'CNC kesim operasyonları, nesting dosyaları ve kesim görevleri yönetimi.',
      icon: 'fas fa-cut',
      iconColor: 'primary',
      link: '/planning/cnc-cutting',
      features: [
        { label: 'Dashboard', icon: 'fas fa-chart-line', link: '/planning/cnc-cutting/dashboard' },
        { label: 'Kesimler', icon: 'fas fa-scissors', link: '/planning/cnc-cutting/cuts' },
        { label: 'Fire Plakalar', icon: 'fas fa-layer-group', link: '/planning/cnc-cutting/remnants' },
        { label: 'Raporlar', icon: 'fas fa-chart-bar', link: '/planning/cnc-cutting/reports' },
        { label: 'Kapasite Planlayıcı', icon: 'fas fa-calendar-alt', link: '/planning/cnc-cutting/capacity' },
      ],
    },
    {
      title: 'Lineer Kesim',
      description: 'Profil ve çubuk kesim optimizasyonu, oturum ve bar görevleri yönetimi.',
      icon: 'fas fa-ruler-horizontal',
      iconColor: 'success',
      link: '/planning/linear-cutting',
      features: [
        { label: 'Dashboard', icon: 'fas fa-chart-line', link: '/planning/linear-cutting/dashboard' },
        { label: 'Kesimler', icon: 'fas fa-ruler-horizontal', link: '/planning/linear-cutting/cuts' },
        { label: 'Görevler', icon: 'fas fa-tasks', link: '/planning/linear-cutting/tasks' },
        { label: 'Kapasite Planlayıcı', icon: 'fas fa-calendar-alt', link: '/planning/linear-cutting/capacity' },
      ],
    },
  ];

  const stats: PageFigure[] = [
    ...(canRequests
      ? [
          countFigure(
            {
              id: 'to-transfer',
              label: 'Aktarım Bekleyen',
              icon: 'fas fa-right-left',
              link: REQUESTS,
            },
            toTransfer,
          ),
          countFigure(
            {
              id: 'erp-entry',
              label: 'ERP Girişi Bekleyen',
              icon: 'fas fa-keyboard',
              link: REQUESTS,
            },
            erpEntry,
          ),
        ]
      : []),
    // Bana Atanan and Hedefi Geçen.
    ...tasks.figures.slice(0, 2),
  ];

  // The queues planning works through, in the order a request passes them.
  const queues: AttentionItem[] = [];
  if (canRequests) {
    queues.push(
      {
        id: 'queue-transfer',
        label: 'Onaylı departman talepleri',
        hint: 'Satın almaya aktarılmayı bekliyor',
        icon: 'fas fa-right-left',
        color: 'yellow',
        link: REQUESTS,
        count: toTransfer,
      },
      {
        id: 'queue-stock',
        label: 'Stok kontrolü',
        hint: 'Planlama talebi stok kontrolünde',
        icon: 'fas fa-warehouse',
        color: 'blue',
        link: `${REQUESTS}?pr_status=pending_inventory`,
        count: stockCheck,
      },
      {
        id: 'queue-erp',
        label: 'ERP girişi',
        hint: 'Planlama talebi ERP girişi bekliyor',
        icon: 'fas fa-keyboard',
        color: 'yellow',
        link: REQUESTS,
        count: erpEntry,
      },
    );
  }
  if (canLines) {
    queues.push({
      id: 'queue-cost',
      label: 'Malzeme maliyeti',
      hint: 'Maliyet satırı girilmemiş iş emri',
      icon: 'fas fa-euro-sign',
      color: 'orange',
      link: PROCUREMENT_LINES,
      count: missingCost,
    });
  }
  if (tasks.enabled) {
    queues.push({
      id: 'queue-blocked',
      label: 'Engellenen görevler',
      hint: 'Planlama görevi engellendi',
      icon: 'fas fa-ban',
      color: 'red',
      link: `${PROJECTS}?status=blocked`,
      count: tasks.blocked,
    });
  }

  return (
    <MenuCards
      title="Planlama"
      subtitle="Planlama süreçlerinizi yönetin ve optimize edin"
      stats={stats}
      compact={queues.length > 0}
      cards={cards}
    >
      {queues.length > 0 ? (
        <HubPanels>
          {tasks.enabled ? <TaskDeadlinesPanel department="planning" route={PROJECTS} /> : null}
          <AttentionPanel title="Planlamayı Bekleyenler" icon="fas fa-inbox" items={queues} />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
