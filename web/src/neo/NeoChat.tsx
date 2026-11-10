import { renderRichText } from '@/ui/RichText/renderRichText';
import { Tooltip, UnstyledButton } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  quotaLine,
  sendMessageFeedback,
  type AssistantQuota,
  type FeedbackReason,
} from '@/api/assistant';
import { hasSectionAccess } from '@/auth/accessControl';
import { FaIcon } from '@/ui/FaIcon';
import { notify } from '@/ui/notify';
import classes from './neo.module.css';
import { NeoMarkdown } from './NeoMarkdown';
import {
  consumeDraft,
  lastQuestion,
  sendNeoMessage,
  setItemFeedback,
  useNeo,
  type AssistantItem,
  type ChatItem,
  type ToolChip,
} from './neoStore';
import { neoKeys } from './queries';
import { toolLabel } from './toolLabels';

/** Shown to everyone; role suggestions are added in front (see suggestionsFor). */
export const SUGGESTIONS = [
  'Dün neler oldu?',
  'Onayımı bekleyen neler var?',
  'Aktif iş emirlerini listele',
  'Bu ay kaç saat çalışmışım?',
  'İzin bakiyem ne durumda?',
  'İş emri nasıl açılır?',
];

/** One question per area the user can open; they lead the list. */
const ROLE_SUGGESTIONS: { section: string; text: string }[] = [
  { section: 'procurement', text: 'Bekleyen satın alma talepleri neler?' },
  { section: 'quality_control', text: 'Açık NCR’lar hangi işlerde?' },
  { section: 'planning', text: 'Kesimi bekleyen parçalar neler?' },
  { section: 'manufacturing', text: 'Şu an arızalı makine var mı?' },
  { section: 'sales', text: 'Açık satış tekliflerini listele' },
];

/** What Neo can reach, for the empty state (kept in step with the tools). */
export const CAPABILITIES = [
  'İş emirleri, maliyet ve saatler',
  'Malzeme, planlama ve kesim',
  'Satın alma talepleri ve siparişler',
  'Kalite kontrol, NCR ve makine arızaları',
  'Tartışmalar ve etiketlenmeler',
  'Onaylarınız, izin ve mesainiz',
  'Süreç rehberleri',
];

const MAX_SUGGESTIONS = 6;

export function suggestionsFor(canOpen: (section: string) => boolean): string[] {
  const role = ROLE_SUGGESTIONS.filter((s) => canOpen(s.section)).map((s) => s.text);
  const [first = '', ...rest] = SUGGESTIONS;
  const picked = [first, ...role.slice(0, 3), ...rest];
  return [...new Set(picked)].slice(0, MAX_SUGGESTIONS);
}

export const FOOTNOTE = 'Sorular kayıt altına alınır · Neo hata yapabilir';

const REASONS: { value: FeedbackReason; label: string }[] = [
  { value: 'wrong', label: 'Yanlış bilgi' },
  { value: 'incomplete', label: 'Eksik' },
  { value: 'unclear', label: 'Anlaşılmaz' },
  { value: 'slow', label: 'Çok yavaş' },
  { value: 'other', label: 'Diğer' },
];

function UserText({ text }: { text: string }) {
  // renderRichText escapes everything first and only adds its own tags.
  return (
    <div className={classes.rich} dangerouslySetInnerHTML={{ __html: renderRichText(text) }} />
  );
}

function Tool({ tool }: { tool: ToolChip }) {
  const label = toolLabel(tool.name);
  const count = tool.count && tool.count > 1 ? ` ×${tool.count}` : '';
  if (tool.status === 'start') {
    return (
      <span className={classes.tool} data-status="start">
        <FaIcon icon="fas fa-circle-notch fa-spin" size={10} />
        {label}…{count}
      </span>
    );
  }
  return (
    <span
      className={classes.tool}
      data-status={tool.status}
      data-family={tool.status === 'done' ? 'green' : 'red'}
    >
      <FaIcon
        icon={tool.status === 'done' ? 'fas fa-check' : 'fas fa-triangle-exclamation'}
        size={10}
      />
      {label}
      {count}
    </span>
  );
}

/** Copies the answer as formatted text (tables paste into Excel/Outlook) and as plain text. */
/** The answer's HTML without panel controls (table footers with "Excel"). */
export function answerHtml(node: HTMLElement): string {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-copy-skip]').forEach((el) => el.remove());
  return copy.innerHTML;
}

async function copyAnswer(node: HTMLElement | null, text: string) {
  try {
    if (node && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([answerHtml(node)], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    notify.success('Yanıt kopyalandı.');
  } catch {
    notify.error('Kopyalanamadı.');
  }
}

function ActionButton({
  label,
  icon,
  onClick,
  pressed,
  value,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  pressed?: boolean;
  value?: string;
}) {
  return (
    <Tooltip label={label} withArrow openDelay={300}>
      <UnstyledButton
        className={classes.feedbackBtn}
        data-value={value}
        aria-pressed={pressed}
        aria-label={label}
        onClick={onClick}
      >
        <FaIcon icon={icon} />
      </UnstyledButton>
    </Tooltip>
  );
}

function AnswerActions({
  item,
  bodyRef,
  isLast,
  onAsk,
}: {
  item: AssistantItem;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  isLast: boolean;
  onAsk: (text: string) => void;
}) {
  const [askReason, setAskReason] = useState(false);
  const messageId = item.messageId;
  if (item.streaming) return null;

  const vote = async (value: 1 | -1, reason?: FeedbackReason) => {
    if (!messageId) return;
    const next = !reason && item.feedback === value ? null : value;
    try {
      await sendMessageFeedback(messageId, next, reason);
      setItemFeedback(item.id, next);
      setAskReason(next === -1 && !reason);
      if (reason) notify.success('Teşekkürler, Neo’yu geliştirmek için kullanılacak.');
    } catch {
      notify.error('Geri bildirim gönderilemedi.');
    }
  };

  const retry = () => {
    const question = lastQuestion();
    if (question) onAsk(question);
  };

  return (
    <>
      <div className={classes.feedback}>
        {item.text && !item.error && (
          <ActionButton
            label="Kopyala"
            icon="far fa-copy"
            onClick={() => void copyAnswer(bodyRef.current, item.text)}
          />
        )}
        {isLast && <ActionButton label="Tekrar dene" icon="fas fa-rotate-right" onClick={retry} />}
        {messageId ? (
          <>
            <ActionButton
              label="Faydalı"
              icon="fas fa-thumbs-up"
              value="up"
              pressed={item.feedback === 1}
              onClick={() => void vote(1)}
            />
            <ActionButton
              label="Faydasız"
              icon="fas fa-thumbs-down"
              value="down"
              pressed={item.feedback === -1}
              onClick={() => void vote(-1)}
            />
          </>
        ) : null}
      </div>
      {askReason && (
        <div className={classes.reasons} role="group" aria-label="Neden faydasız?">
          <span className={classes.reasonsLabel}>Ne eksikti?</span>
          {REASONS.map((reason) => (
            <UnstyledButton
              key={reason.value}
              className={classes.reason}
              onClick={() => void vote(-1, reason.value)}
            >
              {reason.label}
            </UnstyledButton>
          ))}
        </div>
      )}
    </>
  );
}

const Message = memo(function Message({
  item,
  isLast,
  onAsk,
}: {
  item: ChatItem;
  isLast: boolean;
  onAsk: (text: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  if (item.role === 'user') {
    return (
      <div className={classes.user}>
        <UserText text={item.text} />
      </div>
    );
  }
  const followups = isLast && !item.streaming ? (item.followups ?? []) : [];
  return (
    <div
      className={classes.answer}
      data-streaming={item.streaming || undefined}
      data-error={item.error || undefined}
    >
      {item.tools.length > 0 && (
        <div className={classes.tools}>
          {item.tools.map((tool) => (
            <Tool key={tool.name} tool={tool} />
          ))}
        </div>
      )}
      <div className={classes.answerText} ref={bodyRef} aria-busy={item.streaming || undefined}>
        {item.text ? (
          item.error ? (
            <p className={classes.errorText}>{item.text}</p>
          ) : (
            <NeoMarkdown text={item.text} done={!item.streaming} />
          )
        ) : null}
      </div>
      <AnswerActions item={item} bodyRef={bodyRef} isLast={isLast} onAsk={onAsk} />
      {followups.length > 0 && (
        <div className={classes.followups} aria-label="Önerilen sorular">
          {followups.map((text) => (
            <UnstyledButton key={text} className={classes.followup} onClick={() => onAsk(text)}>
              <FaIcon icon="fas fa-arrow-turn-down" size={10} />
              {text}
            </UnstyledButton>
          ))}
        </div>
      )}
    </div>
  );
});

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const suggestions = useMemo(() => suggestionsFor(hasSectionAccess), []);
  return (
    <div className={classes.empty}>
      <span className={classes.emptyTile}>
        <FaIcon icon="fas fa-robot" />
      </span>
      <p className={classes.emptyTitle}>Merhaba, ben Neo. Size nasıl yardımcı olabilirim?</p>
      <p className={classes.emptyText}>
        Sistemdeki verilere bakıp yanıtlarım; tablo hazırlar, ilgili kayda bağlantı veririm.
      </p>
      <div className={classes.suggestions}>
        {suggestions.map((text) => (
          <UnstyledButton key={text} className={classes.suggestion} onClick={() => onPick(text)}>
            {text}
          </UnstyledButton>
        ))}
      </div>
      <details className={classes.capabilities}>
        <summary>Neo nelere bakabilir?</summary>
        <ul>
          {CAPABILITIES.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p>Yalnızca sizin yetkiniz olan verileri görür.</p>
      </details>
    </div>
  );
}

export function LockedNotice() {
  return (
    <div className={classes.notice} role="status">
      <FaIcon icon="fas fa-lock" />
      <span>
        Neo&apos;ya erişiminiz kapatılmış görünüyor. Gerekli olduğunu düşünüyorsanız yöneticinizle
        görüşün.
      </span>
    </div>
  );
}

/** The conversation, the empty state and the question box. */
export function NeoChat({
  quota,
  locked,
  inputRef,
}: {
  quota: AssistantQuota | undefined;
  locked: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const items = useNeo((s) => s.items);
  const streaming = useNeo((s) => s.streaming);
  const restored = useNeo((s) => s.restored);
  const draft = useNeo((s) => s.draft);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const outOfQuota = quota ? !quota.allowed : false;

  // openNeo({ prompt }) puts its text in the box, unsent.
  useEffect(() => {
    if (!draft || locked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an outside request, applied once
    setText(draft.text);
    consumeDraft();
    inputRef.current?.focus();
  }, [draft, locked, inputRef]);

  // Follow the answer while the user is at the bottom; leave them alone when
  // they scrolled up to read.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [items]);

  // Grow with the text, up to the CSS max-height.
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, [text, inputRef]);

  // The latest values, so the memoised messages get one stable callback.
  const latest = useRef({ streaming, outOfQuota });
  useLayoutEffect(() => {
    latest.current = { streaming, outOfQuota };
  }, [streaming, outOfQuota]);

  const send = useCallback(
    async (value: string, { fromBox = false } = {}) => {
      if (!value.trim() || latest.current.streaming || latest.current.outOfQuota) return;
      if (fromBox) setText('');
      nearBottom.current = true;
      await sendNeoMessage(value);
      void queryClient.invalidateQueries({ queryKey: neoKeys.quota });
      void queryClient.invalidateQueries({ queryKey: neoKeys.conversations });
      inputRef.current?.focus();
    },
    [queryClient, inputRef],
  );

  const ask = useCallback((value: string) => void send(value), [send]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(text, { fromBox: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(text, { fromBox: true });
    }
  };

  return (
    <>
      <div
        className={classes.scroll}
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 140;
        }}
      >
        {locked ? (
          <LockedNotice />
        ) : items.length === 0 ? (
          restored ? (
            <EmptyState onPick={ask} />
          ) : null
        ) : (
          <div className={classes.messages} role="log" aria-live="polite" aria-label="Neo sohbeti">
            {items.map((item, index) => (
              <Message
                key={item.id}
                item={item}
                isLast={index === items.length - 1 && !streaming}
                onAsk={ask}
              />
            ))}
          </div>
        )}
      </div>
      {!locked && (
        <form className={classes.composer} onSubmit={onSubmit}>
          <div className={classes.inputWrap}>
            <textarea
              ref={inputRef}
              className={classes.input}
              rows={1}
              maxLength={4000}
              value={text}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={onKeyDown}
              disabled={outOfQuota}
              placeholder={
                outOfQuota ? 'Günlük veya aylık limitinize ulaştınız.' : 'Sorunuzu yazın...'
              }
              aria-label="Neo'ya sorunuz"
            />
            <UnstyledButton
              type="submit"
              className={classes.sendBtn}
              disabled={streaming || outOfQuota || !text.trim()}
              aria-label="Gönder"
              title="Gönder"
            >
              <FaIcon icon="fas fa-paper-plane" />
            </UnstyledButton>
          </div>
          <div className={classes.footnotes}>
            {quota ? <span>{quotaLine(quota)}</span> : null}
            <span>{FOOTNOTE}</span>
          </div>
        </form>
      )}
    </>
  );
}
