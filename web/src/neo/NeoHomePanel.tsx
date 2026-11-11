import { UnstyledButton } from '@mantine/core';
import { useMemo, useState, type FormEvent } from 'react';
import { hasSectionAccess } from '@/auth/accessControl';
import { FaIcon, Panel } from '@/ui';
import classes from './neo.module.css';
import { suggestionsFor } from './NeoChat';
import { askNeo, openNeo, useNeo } from './neoStore';
import { useNeoAccess } from './queries';

const HOME_SUGGESTIONS = 3;

/**
 * Neo on the home page: a question box that asks at once (the panel opens with
 * the answer), three suggestions for this user's sections, and today's summary
 * when it is unread. Hidden for users whose Neo access is known to be closed.
 */
export function NeoHomePanel() {
  const [text, setText] = useState('');
  const unread = useNeo((s) => s.unreadSummary);
  const streaming = useNeo((s) => s.streaming);
  const { locked } = useNeoAccess(false);
  const suggestions = useMemo(
    () => suggestionsFor(hasSectionAccess).slice(0, HOME_SUGGESTIONS),
    [],
  );
  if (locked) return null;

  const ask = (question: string) => {
    if (!question.trim()) return;
    setText('');
    void askNeo(question, 'home');
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(text);
  };

  return (
    <Panel title="Neo'ya sorun" icon="fas fa-robot">
      <p className={classes.homeIntro}>
        İş emirleri, maliyetler, satın alma, kalite: sistemdeki veriye bakıp yanıtlar.
      </p>
      <form className={classes.homeForm} onSubmit={onSubmit}>
        <input
          className={classes.homeInput}
          value={text}
          maxLength={4000}
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder="Örn. 293-10 işinin maliyeti ne?"
          aria-label="Neo'ya sorunuz"
        />
        <UnstyledButton
          type="submit"
          className={classes.sendBtn}
          disabled={!text.trim() || streaming}
          aria-label="Neo'ya sor"
          title="Neo'ya sor"
        >
          <FaIcon icon="fas fa-paper-plane" />
        </UnstyledButton>
      </form>
      <div className={classes.homeSuggestions}>
        {suggestions.map((question) => (
          <UnstyledButton
            key={question}
            className={classes.suggestion}
            disabled={streaming}
            onClick={() => ask(question)}
          >
            {question}
          </UnstyledButton>
        ))}
      </div>
      {unread ? (
        <UnstyledButton
          className={classes.homeSummary}
          onClick={() => openNeo({ summaryId: unread.id, openSummary: true })}
        >
          <FaIcon icon="fas fa-newspaper" />
          Bugünün özeti hazır, okunmadı
          <FaIcon icon="fas fa-chevron-right" size={10} />
        </UnstyledButton>
      ) : null}
    </Panel>
  );
}
