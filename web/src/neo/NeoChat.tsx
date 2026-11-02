import { renderRichText } from '@legacy/utils/richText.js';
import { UnstyledButton } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { quotaLine, sendMessageFeedback, type AssistantQuota } from '@/api/assistant';
import { FaIcon } from '@/ui/FaIcon';
import { notify } from '@/ui/notify';
import classes from './neo.module.css';
import {
  consumeDraft,
  sendNeoMessage,
  setItemFeedback,
  useNeo,
  type AssistantItem,
  type ChatItem,
  type ToolChip,
} from './neoStore';
import { neoKeys } from './queries';

const TOOL_LABELS: Record<string, string> = {
  search_job_orders: 'İş emri aranıyor',
  get_job_order_brief: 'İş emri özeti alınıyor',
  get_job_order_hours: 'Çalışma saatleri alınıyor',
  get_job_costs: 'Maliyetler alınıyor',
  get_material_status: 'Malzeme durumu alınıyor',
  get_discussions: 'Tartışmalar okunuyor',
  get_my_mentions: 'Etiketlenmeler alınıyor',
  get_my_summary: 'Kişisel özet alınıyor',
  get_daily_summary: 'Günlük özet okunuyor',
  search_docs: 'Rehber dokümanlar aranıyor',
  read_doc: 'Rehber okunuyor',
};

export const SUGGESTIONS = [
  'Dün neler oldu?',
  'İş emri nasıl açılır?',
  'Aktif iş emirlerini listele',
  'Bu ay kaç saat çalışmışım?',
  'İzin bakiyem ne durumda?',
];

export const FOOTNOTE = 'Sorular kayıt altına alınır · Neo hata yapabilir';

function RichText({ text }: { text: string }) {
  // renderRichText escapes everything first and only adds its own tags.
  return (
    <div className={classes.rich} dangerouslySetInnerHTML={{ __html: renderRichText(text) }} />
  );
}

function Tool({ tool }: { tool: ToolChip }) {
  const label = TOOL_LABELS[tool.name] ?? tool.name;
  if (tool.status === 'start') {
    return (
      <span className={classes.tool} data-status="start">
        <FaIcon icon="fas fa-circle-notch fa-spin" size={10} />
        {label}…
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
    </span>
  );
}

function Feedback({ item }: { item: AssistantItem }) {
  const messageId = item.messageId;
  if (!messageId || item.streaming) return null;
  const vote = async (value: 1 | -1) => {
    const next = item.feedback === value ? null : value;
    try {
      await sendMessageFeedback(messageId, next);
      setItemFeedback(item.id, next);
    } catch {
      notify.error('Geri bildirim gönderilemedi.');
    }
  };
  return (
    <div className={classes.feedback}>
      <UnstyledButton
        className={classes.feedbackBtn}
        data-value="up"
        aria-pressed={item.feedback === 1}
        aria-label="Faydalı"
        title="Faydalı"
        onClick={() => void vote(1)}
      >
        <FaIcon icon="fas fa-thumbs-up" />
      </UnstyledButton>
      <UnstyledButton
        className={classes.feedbackBtn}
        data-value="down"
        aria-pressed={item.feedback === -1}
        aria-label="Faydasız"
        title="Faydasız"
        onClick={() => void vote(-1)}
      >
        <FaIcon icon="fas fa-thumbs-down" />
      </UnstyledButton>
    </div>
  );
}

const Message = memo(function Message({ item }: { item: ChatItem }) {
  if (item.role === 'user') {
    return (
      <div className={classes.user}>
        <RichText text={item.text} />
      </div>
    );
  }
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
      <div className={classes.answerText} aria-busy={item.streaming || undefined}>
        {item.text ? <RichText text={item.text} /> : null}
      </div>
      <Feedback item={item} />
    </div>
  );
});

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className={classes.empty}>
      <span className={classes.emptyTile}>
        <FaIcon icon="fas fa-robot" />
      </span>
      <p className={classes.emptyTitle}>Merhaba, ben Neo. Size nasıl yardımcı olabilirim?</p>
      <p className={classes.emptyText}>
        İş emirleri, saatler, malzeme durumu, tartışma özetleri ve süreç soruları.
      </p>
      <div className={classes.suggestions}>
        {SUGGESTIONS.map((text) => (
          <UnstyledButton key={text} className={classes.suggestion} onClick={() => onPick(text)}>
            {text}
          </UnstyledButton>
        ))}
      </div>
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

  const send = async (value: string) => {
    if (!value.trim() || streaming || outOfQuota) return;
    setText('');
    nearBottom.current = true;
    await sendNeoMessage(value);
    void queryClient.invalidateQueries({ queryKey: neoKeys.quota });
    void queryClient.invalidateQueries({ queryKey: neoKeys.conversations });
    inputRef.current?.focus();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(text);
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
            <EmptyState onPick={(value) => void send(value)} />
          ) : null
        ) : (
          <div className={classes.messages} role="log" aria-live="polite" aria-label="Neo sohbeti">
            {items.map((item) => (
              <Message key={item.id} item={item} />
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
