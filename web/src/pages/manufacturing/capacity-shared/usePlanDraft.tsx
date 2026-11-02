import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/ui';
import { applyOverrides, mergeOverrides, sameValue } from './planLogic';

// The planners' unsaved edits. Server rows stay in the query cache; the draft
// is a map of changed fields per row layered on top (an edit to one row
// creates one new object, so only that bar re-renders).
//
// Saving is optimistic: the sent fields are written into the cache and leave
// the draft at once, so edits made while saving stack on top of them. If the
// request fails, the cache goes back and the sent fields return to the draft
// under any newer edits: nothing is lost, and nothing is sent twice because a
// second save waits for the first. A success refetches the server's version.

interface Keyed {
  key: string;
}

interface Draft<T> {
  scope: string;
  overrides: Map<string, Partial<T>>;
  /** Extra per-row flags (the machining planner's "moved by hand"). */
  marks: Set<string>;
}

function emptyDraft<T>(scope: string): Draft<T> {
  return { scope, overrides: new Map(), marks: new Set() };
}

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface SaveVariables<T, P> {
  scope: string;
  queryKey: QueryKey;
  payload: P;
  sent: Draft<T>;
}

interface SaveContext<T> {
  snapshot: T[] | undefined;
}

export interface PlanDraftOptions<T, P, R> {
  /** Changes of scope (machine, filters) start an empty draft. */
  scope: string;
  /** The query holding the server rows (written optimistically, then refetched). */
  queryKey: QueryKey;
  base: readonly T[];
  save: (payload: P) => Promise<R>;
}

export function usePlanDraft<T extends Keyed, P, R = unknown>({
  scope,
  queryKey,
  base,
  save,
}: PlanDraftOptions<T, P, R>) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Draft<T>>(() => emptyDraft(scope));
  const draft = useMemo(
    () => (state.scope === scope ? state : emptyDraft<T>(scope)),
    [state, scope],
  );

  const baseMap = useMemo(() => new Map(base.map((row) => [row.key, row])), [base]);
  const rows = useMemo(() => applyOverrides(base, draft.overrides), [base, draft.overrides]);

  /** Rows with a field that really differs from the server. */
  const changedKeys = useMemo(() => {
    const keys: string[] = [];
    for (const [key, patch] of draft.overrides) {
      const original = baseMap.get(key);
      if (
        !original ||
        Object.entries(patch).some(([f, v]) => !sameValue(v, original[f as keyof T]))
      )
        keys.push(key);
    }
    return keys;
  }, [draft.overrides, baseMap]);

  const edit = useCallback(
    (patches: ReadonlyMap<string, Partial<T>>, marks?: Iterable<string>) => {
      if (patches.size === 0) return;
      setState((prev) => {
        const current = prev.scope === scope ? prev : emptyDraft<T>(scope);
        return {
          scope,
          overrides: mergeOverrides(current.overrides, patches, baseMap),
          marks: marks ? new Set([...current.marks, ...marks]) : current.marks,
        };
      });
    },
    [scope, baseMap],
  );

  const mutation = useMutation<R, unknown, SaveVariables<T, P>, SaveContext<T>>({
    mutationFn: ({ payload }) => save(payload),
    onMutate: async ({ queryKey: key, sent, scope: sentScope }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<T[]>(key);
      if (snapshot) queryClient.setQueryData<T[]>(key, applyOverrides(snapshot, sent.overrides));
      // Take exactly what was sent out of the draft; anything edited since stays.
      setState((prev) => {
        if (prev.scope !== sentScope) return prev;
        const overrides = new Map(prev.overrides);
        for (const [k, v] of sent.overrides) if (overrides.get(k) === v) overrides.delete(k);
        const marks = new Set([...prev.marks].filter((m) => !sent.marks.has(m)));
        return { scope: prev.scope, overrides, marks };
      });
      return { snapshot };
    },
    onError: (_error, { queryKey: key, sent, scope: sentScope }, context) => {
      if (context?.snapshot) queryClient.setQueryData<T[]>(key, context.snapshot);
      setState((prev) => {
        if (prev.scope !== sentScope) return prev;
        // Back into the draft, under anything edited while the request ran.
        const overrides = new Map(sent.overrides);
        for (const [k, v] of prev.overrides) overrides.set(k, { ...overrides.get(k), ...v });
        return { scope: prev.scope, overrides, marks: new Set([...sent.marks, ...prev.marks]) };
      });
    },
    onSuccess: (_result, { queryKey: key }) => queryClient.invalidateQueries({ queryKey: key }),
  });

  /** Sends the draft; resolves to the server result, or undefined when nothing was sent. */
  const commit = useCallback(
    async (payload: P): Promise<R | undefined> => {
      if (mutation.isPending) return undefined;
      return mutation.mutateAsync({ scope, queryKey, payload, sent: draft });
    },
    [mutation, scope, queryKey, draft],
  );

  const discard = useCallback(() => {
    setState(emptyDraft(scope));
    mutation.reset();
  }, [scope, mutation]);

  const mine = mutation.variables?.scope === scope;
  const dirty = changedKeys.length > 0;
  const status: SaveState =
    mine && mutation.isPending
      ? 'saving'
      : dirty
        ? mine && mutation.isError
          ? 'error'
          : 'dirty'
        : mine && mutation.isSuccess
          ? 'saved'
          : 'idle';

  return {
    /** Server rows with the draft applied. */
    rows,
    edit,
    commit,
    discard,
    dirty,
    changedCount: changedKeys.length,
    marks: draft.marks as ReadonlySet<string>,
    saving: mutation.isPending,
    status,
  };
}

/** Warns before closing or reloading the tab with unsaved plan changes. */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

/** Unsaved / saving / saved state next to "Planı Kaydet". */
export function SaveStatus({ status, changedCount }: { status: SaveState; changedCount: number }) {
  switch (status) {
    case 'dirty':
      return <StatusBadge color="orange">Kaydedilmemiş değişiklik: {changedCount}</StatusBadge>;
    case 'saving':
      return <StatusBadge color="blue">Kaydediliyor…</StatusBadge>;
    case 'saved':
      return <StatusBadge color="green">Kaydedildi</StatusBadge>;
    case 'error':
      return (
        <StatusBadge color="red">Kaydedilemedi: {changedCount} değişiklik bekliyor</StatusBadge>
      );
    default:
      return null;
  }
}
