import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { listCountQueryOptions } from '@/api/counts';
import {
  feedbackReportsQueryOptions,
  feedbackStatsQueryOptions,
  type FeedbackReport,
  type FeedbackStats,
} from '@/api/it/feedback';
import { neoSummaryQueryOptions } from '@/api/it/neo';
import { passwordResetsQueryOptions } from '@/api/it/passwordResets';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import {
  AttentionPanel,
  HubPanels,
  RecordsPanel,
  type AttentionItem,
  type HubRecord,
} from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';
import { KIND_META, PRIORITY_LABELS } from './feedback/feedbackMeta';

const PASSWORD_RESETS = '/it/password-resets';
const FEEDBACK = '/it/feedback';
const NEO = '/it/neo';
const INVENTORY = '/it/inventory';

/** The stats endpoint also sends per-status counts. */
type Stats = FeedbackStats & { by_status?: Record<string, number> };

function feedbackRecord(report: FeedbackReport): HubRecord {
  const priority = report.priority ? PRIORITY_LABELS[report.priority] : undefined;
  return {
    key: report.id,
    link: `${FEEDBACK}?status=new`,
    code: `#${report.id}`,
    title: report.title,
    subtitle: [KIND_META[report.kind]?.label ?? report.kind, report.reporter_name]
      .filter(Boolean)
      .join(' · '),
    status: priority
      ? {
          label: priority,
          color: report.priority === 'critical' || report.priority === 'high' ? 'red' : 'grey',
        }
      : undefined,
    meta: formatDate(report.created_at, { day: 'numeric', month: 'short' }),
  };
}

export function ItHubPage() {
  const { isAdmin } = useAuth();
  // Figures follow the cards: nothing is fetched for a page the user cannot
  // open. The reset requests are staff-only, as on their page.
  const canResets = isAdmin && hasRouteAccess(PASSWORD_RESETS);
  const canFeedback = hasRouteAccess(FEEDBACK);
  const canNeo = hasRouteAccess(NEO);
  const resets = useQuery({
    ...passwordResetsQueryOptions(),
    select: (rows) => rows.length,
    enabled: canResets,
  });
  const stats = useQuery({
    ...feedbackStatsQueryOptions(),
    select: (s) => s as Stats,
    enabled: canFeedback,
  });
  const fresh = useQuery({
    ...feedbackReportsQueryOptions({ status: 'new' }),
    select: (rows) => rows.slice(0, 6).map(feedbackRecord),
    enabled: canFeedback,
  });
  const neo = useQuery({
    ...neoSummaryQueryOptions(7),
    select: (s) => s.questions,
    enabled: canNeo,
  });
  const devices = useQuery({
    ...listCountQueryOptions(['itInventory', 'list'], '/machines/', { used_in: 'it' }, 5 * 60_000),
    enabled: hasRouteAccess(INVENTORY),
  });
  const statCount = (pick: (s: Stats) => number | undefined) => ({
    data: stats.data ? (pick(stats.data) ?? 0) : undefined,
    isError: stats.isError,
  });
  const newFeedback = statCount((s) => s.by_status?.new);
  const awaiting = statCount((s) => s.awaiting_decision);
  const pipeline = statCount((s) => s.in_pipeline);

  // Ported from it/it.js. The four Envanter links all open the inventory
  // page, as in legacy.
  const cards: MenuCard[] = [
    {
      title: 'Envanter',
      description:
        'IT cihazlarını yönetin, donanım envanterini takip edin ve cihaz durumlarını izleyin.',
      icon: 'fas fa-desktop',
      iconColor: 'primary',
      link: INVENTORY,
      stat: { value: countValue(devices), label: 'cihaz' },
      features: [
        { label: 'Bilgisayarlar', icon: 'fas fa-desktop', link: INVENTORY },
        { label: 'Laptoplar', icon: 'fas fa-laptop', link: INVENTORY },
        { label: 'Yazıcılar', icon: 'fas fa-print', link: INVENTORY },
        { label: 'Ağ Cihazları', icon: 'fas fa-network-wired', link: INVENTORY },
      ],
    },
    {
      title: 'Şifre Sıfırlama Talepleri',
      description: 'Kullanıcı şifre sıfırlama taleplerini yönetin ve işleme alın.',
      icon: 'fas fa-key',
      iconColor: 'warning',
      link: PASSWORD_RESETS,
      stat: canResets ? { value: countValue(resets), label: 'talep bekliyor' } : undefined,
    },
    {
      title: 'Bildirim Yönlendirmeleri',
      description: 'Bildirim türlerine göre kullanıcı atamalarını yönetin ve yapılandırın.',
      icon: 'fas fa-bell',
      iconColor: 'info',
      link: '/it/notifications',
    },
    {
      title: 'Yetki Yönetimi',
      description: 'Kullanıcı gruplarını ve detaylı yetki matrisini yönetin.',
      icon: 'fas fa-user-shield',
      iconColor: 'danger',
      link: '/it/permissions',
    },
    {
      title: 'Onay Yönetimi',
      description: 'Onay akışlarını ve adım şablonlarını görüntüleyin ve düzenleyin.',
      icon: 'fas fa-check-circle',
      iconColor: 'success',
      link: '/it/approvals',
    },
    {
      title: 'Organizasyon Grupları',
      description: 'Pozisyon gruplarını oluşturun, düzenleyin ve gruba toplu pozisyon atayın.',
      icon: 'fas fa-object-group',
      iconColor: 'secondary',
      link: '/it/groups',
    },
    {
      title: 'İş Emri Tamamlama',
      description:
        'Seçilen iş emirlerini ve tüm departman görevlerini kontrolleri atlayarak toplu tamamlayın.',
      icon: 'fas fa-check-double',
      iconColor: 'danger',
      link: '/it/job-completion',
    },
    {
      title: 'Neo Kullanımı',
      description:
        'Neo asistanın kullanım analizleri: kim neyi sordu, konu dağılımı, maliyet ve soru kayıtları.',
      icon: 'fas fa-robot',
      iconColor: 'primary',
      link: NEO,
      stat: { value: countValue(neo), label: 'soru, son 7 gün' },
    },
    {
      title: 'Geri Bildirimler',
      description: 'Kullanıcı geri bildirimlerini triyaj edin, durumlarını ve yanıtlarını yönetin.',
      icon: 'fas fa-comment-dots',
      iconColor: 'info',
      link: FEEDBACK,
      stat: { value: countValue(newFeedback), label: 'yeni geri bildirim' },
    },
  ];

  const figures: PageFigure[] = [
    ...(canResets
      ? [
          countFigure(
            {
              id: 'password-resets',
              label: 'Şifre Sıfırlama',
              icon: 'fas fa-key',
              link: PASSWORD_RESETS,
            },
            resets,
          ),
        ]
      : []),
    ...(canFeedback
      ? [
          countFigure(
            {
              id: 'feedback-new',
              label: 'Yeni Geri Bildirim',
              icon: 'fas fa-inbox',
              link: `${FEEDBACK}?status=new`,
            },
            newFeedback,
          ),
          countFigure(
            {
              id: 'feedback-awaiting',
              label: 'Karar Bekleyen',
              icon: 'fas fa-gavel',
              link: FEEDBACK,
            },
            awaiting,
          ),
        ]
      : []),
    ...(canNeo
      ? [
          countFigure(
            {
              id: 'neo-questions',
              label: 'Neo Sorusu · 7 Gün',
              icon: 'fas fa-robot',
              link: `${NEO}?days=7`,
            },
            neo,
          ),
        ]
      : []),
  ];

  const queues: AttentionItem[] = [];
  if (canResets) {
    queues.push({
      id: 'queue-resets',
      label: 'Şifre sıfırlama talepleri',
      icon: 'fas fa-key',
      color: 'yellow',
      link: PASSWORD_RESETS,
      count: resets,
    });
  }
  if (canFeedback) {
    queues.push(
      {
        id: 'queue-feedback-new',
        label: 'Yeni geri bildirimler',
        hint: 'Henüz triyaj edilmedi',
        icon: 'fas fa-inbox',
        color: 'yellow',
        link: `${FEEDBACK}?status=new`,
        count: newFeedback,
      },
      {
        id: 'queue-feedback-awaiting',
        label: 'Karar bekleyen geri bildirimler',
        hint: 'İncelendi, bilgi bekleniyor veya başarısız',
        icon: 'fas fa-gavel',
        color: 'orange',
        link: FEEDBACK,
        count: awaiting,
      },
      {
        id: 'queue-feedback-pipeline',
        label: 'Geliştirmede',
        hint: 'Kuyrukta veya PR incelemesinde',
        icon: 'fas fa-code-pull-request',
        color: 'blue',
        link: FEEDBACK,
        count: pipeline,
      },
    );
  }

  return (
    <MenuCards
      title="Bilgi İşlem Departmanı"
      subtitle="IT sistemlerini yönetin, teknik destek sağlayın ve güvenlik süreçlerini takip edin"
      stats={figures}
      compact={queues.length > 0}
      cards={cards}
    >
      {queues.length > 0 ? (
        <HubPanels>
          {canFeedback ? (
            <RecordsPanel
              title="Yeni Geri Bildirimler"
              icon="fas fa-comment-dots"
              more={`${FEEDBACK}?status=new`}
              noun="Geri bildirimler"
              empty="Triyaj bekleyen geri bildirim yok."
              query={fresh}
            />
          ) : null}
          <AttentionPanel title="Bilgi İşlemi Bekleyenler" icon="fas fa-inbox" items={queues} />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
