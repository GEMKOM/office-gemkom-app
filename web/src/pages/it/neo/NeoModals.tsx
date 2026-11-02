import { renderRichText } from '@/ui/RichText/renderRichText';
import { Text } from '@mantine/core';
import type { DailySummaryDetail, NeoConversation, NeoMessage } from '@/api/it/neo';
import { DetailModal, FaIcon, type DetailSection } from '@/ui';
import { SummaryStatusBadge } from './columns';
import { DailySummaryBody } from './DailySummaryBody';
import {
  expandRateLabel,
  fmtInt,
  formatIstanbulDateTime,
  formatSummaryDate,
  formatWindowLabel,
  latencyLabel,
  OUTCOME_LABELS,
  readSecondsLabel,
  toolLabel,
  triggerLabel,
  usd,
} from './labels';
import classes from './NeoUsagePage.module.css';

// ---------------------------------------------------------------- transcript

function messageMeta(message: NeoMessage): string[] {
  if (message.role === 'user') return [];
  const meta: string[] = [];
  meta.push((message.outcome && OUTCOME_LABELS[message.outcome]) || String(message.outcome ?? ''));
  meta.push(`$${Number(message.cost_usd || 0).toFixed(4)}`);
  if (message.latency_ms != null) meta.push(latencyLabel(message.latency_ms));
  if (message.feedback === 1) meta.push('👍');
  if (message.feedback === -1) meta.push('👎');
  for (const call of message.tool_calls ?? []) {
    meta.push(`${toolLabel(call.tool_name)}${call.job_no ? ` (${call.job_no})` : ''}${call.allowed ? '' : ' — reddedildi'}`);
  }
  return meta;
}

function TranscriptMessage({ message }: { message: NeoMessage }) {
  const isUser = message.role === 'user';
  const meta = messageMeta(message);
  return (
    <div className={classes.msg} data-role={isUser ? 'user' : 'assistant'}>
      <div className={classes.msgRole}>{isUser ? 'Soru' : 'Neo'}</div>
      {/* renderRichText escapes the text first and only adds its own tags. */}
      <div className={classes.richText} dangerouslySetInnerHTML={{ __html: renderRichText(message.content) }} />
      {meta.length ? (
        <div className={classes.msgMeta}>
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Port of openConversationModal: the whole conversation, Neo's turns with their ledger. */
export function ConversationModal({ detail, onClose }: { detail: NeoConversation; onClose: () => void }) {
  const messages = detail.messages ?? [];
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${detail.user} — ${detail.title || `Sohbet #${detail.id}`}`}
      icon="fas fa-comments"
      size="lg"
      sections={[
        {
          title: 'Sohbet Dökümü',
          icon: 'fas fa-comments',
          content: messages.length ? (
            messages.map((message, i) => <TranscriptMessage key={message.id ?? i} message={message} />)
          ) : (
            <Text c="dimmed">Mesaj yok.</Text>
          ),
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------- daily summary

/** Ledger strip at the top of the modal — the only place users see summary USD. */
function SummaryMeta({ detail }: { detail: DailySummaryDetail }) {
  const items: [string, string][] = [
    ['Pencere', formatWindowLabel(detail)],
    ['Model', detail.model || '—'],
    [
      'Token',
      `${fmtInt(detail.input_tokens)} giriş · ${fmtInt(detail.output_tokens)} çıkış` +
        (detail.cache_read_tokens ? ` · ${fmtInt(detail.cache_read_tokens)} önbellek` : ''),
    ],
    ['Maliyet', usd(detail.cost_usd)],
    ['Süre', latencyLabel(detail.latency_ms)],
    ['Deneme', fmtInt(detail.attempts)],
    ['Tetik', triggerLabel(detail.triggered_by)],
    ['Üretildi', detail.generated_at ? formatIstanbulDateTime(detail.generated_at) : '—'],
    ['Okuma', fmtInt(detail.read_count)],
    ['Ort. okuma', readSecondsLabel(detail.avg_read_seconds)],
    ['Detay', expandRateLabel(detail.expand_rate)],
  ];
  if (detail.redactions) items.push(['Sansürlenen', fmtInt(detail.redactions)]);
  if (detail.facts_chars) items.push(['Girdi metni', `${fmtInt(detail.facts_chars)} karakter`]);
  return (
    <div className={classes.meta}>
      <SummaryStatusBadge status={detail.status} />
      {items.map(([label, value]) => (
        <span key={label}>
          <strong>{label}:</strong> {value}
        </span>
      ))}
    </div>
  );
}

function statusSection(detail: DailySummaryDetail): DetailSection {
  switch (detail.status) {
    case 'ok':
      return { content: <DailySummaryBody summary={detail} /> };
    case 'empty':
      return { content: <Text c="dimmed">Bu pencerede kayda değer bir hareket yok; model çağrısı yapılmadı.</Text> };
    case 'failed':
      return {
        title: 'Hata',
        icon: 'fas fa-triangle-exclamation',
        content: <pre className={classes.errorDetail}>{detail.error_detail || 'Ayrıntı yok.'}</pre>,
      };
    default:
      return {
        content: (
          <Text c="dimmed">
            <FaIcon icon="fas fa-spinner fa-spin" style={{ marginRight: 4 }} />
            Özet şu anda üretiliyor.
          </Text>
        ),
      };
  }
}

/** Port of openSummaryModal: ledger, the summary itself (or why there is none), warnings. */
export function DailySummaryModal({ detail, onClose }: { detail: DailySummaryDetail; onClose: () => void }) {
  const warnings = Array.isArray(detail.warnings) ? detail.warnings : [];
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Günlük Özet · ${formatSummaryDate(detail.summary_date)}`}
      icon="fas fa-newspaper"
      size="xl"
      sections={[
        { content: <SummaryMeta detail={detail} /> },
        statusSection(detail),
        {
          hidden: warnings.length === 0,
          title: `Uyarılar (${warnings.length})`,
          icon: 'fas fa-circle-info',
          content: (
            <ul style={{ margin: 0, fontSize: 13 }}>
              {warnings.map((w, i) => (
                <li key={i}>{String(w)}</li>
              ))}
            </ul>
          ),
        },
      ]}
    />
  );
}
