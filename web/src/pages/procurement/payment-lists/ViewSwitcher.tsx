import { Button, Text } from '@mantine/core';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { FaIcon } from '@/ui';
import classes from './PaymentLists.module.css';

export type PaymentRoute = { view: 'lists' } | { view: 'pool' } | { view: 'detail'; listId: number };

/** Legacy readRoute: ?list=<id> is a list, ?view=pool the pool, anything else the lists. */
export function readRoute(search: URLSearchParams): PaymentRoute {
  const list = search.get('list');
  if (list) return { view: 'detail', listId: Number(list) };
  if (search.get('view') === 'pool') return { view: 'pool' };
  return { view: 'lists' };
}

/** Legacy navigate(): a history entry per view, the query replaced as a whole. */
export function usePaymentNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (route: PaymentRoute, { replace = false } = {}) => {
      let search = '';
      if (route.view === 'detail') search = `?list=${route.listId}`;
      else if (route.view === 'pool') search = '?view=pool';
      navigate({ search }, { replace });
    },
    [navigate],
  );
}

/** Listeler / Ödeme Havuzu buttons above the views (the detail counts as Listeler). */
export function ViewSwitcher({ active }: { active: 'lists' | 'pool' }) {
  const go = usePaymentNavigate();
  return (
    <div className={`${classes.switcher} ${classes.noPrint}`}>
      <Button.Group aria-label="Görünüm seçimi">
        <Button
          size="xs"
          variant={active === 'lists' ? 'filled' : 'default'}
          aria-pressed={active === 'lists'}
          leftSection={<FaIcon icon="fas fa-list-check" />}
          onClick={() => go({ view: 'lists' })}
        >
          Listeler
        </Button>
        <Button
          size="xs"
          variant={active === 'pool' ? 'filled' : 'default'}
          aria-pressed={active === 'pool'}
          leftSection={<FaIcon icon="fas fa-water" />}
          onClick={() => go({ view: 'pool' })}
        >
          Ödeme Havuzu
        </Button>
      </Button.Group>
      {active === 'pool' ? (
        <Text size="sm" c="dimmed">
          Varsayılan filtre: Peşin / Avans taksitleri
        </Text>
      ) : null}
    </div>
  );
}
