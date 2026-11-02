import { UnstyledButton } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { archiveConversation, getConversation } from '@/api/assistant';
import { confirm } from '@/ui/confirm';
import { FaIcon } from '@/ui/FaIcon';
import { notify } from '@/ui/notify';
import classes from './neo.module.css';
import { getNeoState, showConversation, startNewChat, useNeo } from './neoStore';
import { neoKeys, useConversations } from './queries';

const shortDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '-';

/** Past conversations: open one, or archive it. */
export function NeoHistory() {
  const { data, isPending, isError } = useConversations(true);
  const currentId = useNeo((s) => s.conversationId);
  const queryClient = useQueryClient();

  const open = async (id: number) => {
    if (getNeoState().streaming) return;
    try {
      showConversation(await getConversation(id));
    } catch {
      notify.error('Sohbet açılamadı.');
    }
  };

  const archive = async (id: number, title: string) => {
    if (getNeoState().streaming) return;
    const ok = await confirm({
      title: 'Sohbeti Arşivle',
      icon: 'fas fa-box-archive',
      message: 'Bu sohbet arşivlensin mi?',
      details: title,
      confirmLabel: 'Arşivle',
    });
    if (!ok) return;
    try {
      await archiveConversation(id);
      if (id === getNeoState().conversationId) startNewChat();
      void queryClient.invalidateQueries({ queryKey: neoKeys.conversations });
    } catch {
      notify.error('Sohbet arşivlenemedi.');
    }
  };

  let body;
  if (isPending) body = <div className={classes.muted}>Yükleniyor…</div>;
  else if (isError) body = <div className={classes.muted}>Sohbetler yüklenemedi.</div>;
  else if (data.length === 0)
    body = <div className={classes.muted}>Henüz sohbet yok. İlk sorunuzu sorun.</div>;
  else
    body = (
      <ul className={classes.list}>
        {data.map((conversation) => {
          const title = conversation.title || `Sohbet #${conversation.id}`;
          return (
            <li key={conversation.id} className={classes.convItem}>
              <UnstyledButton
                className={classes.row}
                data-active={conversation.id === currentId || undefined}
                aria-current={conversation.id === currentId || undefined}
                onClick={() => void open(conversation.id)}
              >
                <span className={classes.rowMain}>
                  <span className={classes.rowTitle} title={title}>
                    {title}
                  </span>
                  <span className={classes.rowMeta}>{shortDate(conversation.updated_at)}</span>
                </span>
              </UnstyledButton>
              <UnstyledButton
                className={classes.rowAction}
                aria-label={`Arşivle: ${title}`}
                title="Arşivle"
                onClick={() => void archive(conversation.id, title)}
              >
                <FaIcon icon="fas fa-trash" />
              </UnstyledButton>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className={classes.scroll}>
      <h3 className={classes.sectionTitle}>Sohbetler</h3>
      {body}
    </div>
  );
}
