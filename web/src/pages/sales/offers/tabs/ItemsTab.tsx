import { ActionIcon, Badge, Button, Group, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useReducer, useRef, useState, type DragEvent } from 'react';
import {
  addOfferItems,
  bulkDeleteOfferItems,
  bulkUpdateOfferItems,
  offerErrorMessage,
  offerItemsQueryOptions,
  useInvalidateOffers,
  type OfferItem,
} from '@/api/sales/offers';
import { confirm, FaIcon, notify } from '@/ui';
import { PasteItemsModal } from '../dialogs/PasteModals';
import {
  buildKalemTree,
  draftBadge,
  draftHasChanges,
  editsPayload,
  EMPTY_DRAFT,
  flatItemMap,
  flattenStaged,
  isClosed,
  originalTitle,
  savedSubtree,
  stagedSubtree,
  wouldCreateCycle,
  type ItemEdit,
  type ItemsDraft,
  type KalemNode,
  type StagedItem,
} from '../logic';
import { TabFooter, type TabProps } from '../OfferModal';
import { ErrorText, LoadingText } from '../parts';
import css from '../OffersPage.module.css';
import { CatalogPanel, NODE_MIME, type CatalogPick } from './CatalogPanel';

type Parent = { parentRef?: string | null; parentId?: number | null };

type Action =
  | { type: 'stage'; items: StagedItem[] }
  | {
      type: 'staged-field';
      ref: string;
      patch: Partial<Pick<StagedItem, 'titleOverride' | 'quantity'>>;
    }
  | { type: 'unstage'; ref: string }
  | { type: 'edit'; id: number; patch: ItemEdit }
  | { type: 'delete'; ids: number[] }
  | { type: 'clear'; parts: ('staged' | 'edits' | 'deletes')[] };

function reducer(draft: ItemsDraft, action: Action): ItemsDraft {
  switch (action.type) {
    case 'stage':
      return { ...draft, staged: [...draft.staged, ...action.items] };
    case 'staged-field':
      return {
        ...draft,
        staged: draft.staged.map((s) => (s.ref === action.ref ? { ...s, ...action.patch } : s)),
      };
    case 'unstage': {
      const gone = stagedSubtree(draft.staged, action.ref);
      return { ...draft, staged: draft.staged.filter((s) => !gone.has(s.ref)) };
    }
    case 'edit':
      return {
        ...draft,
        edits: { ...draft.edits, [action.id]: { ...draft.edits[action.id], ...action.patch } },
      };
    case 'delete': {
      const edits = { ...draft.edits };
      for (const id of action.ids) delete edits[id];
      return { ...draft, edits, deletes: [...new Set([...draft.deletes, ...action.ids])] };
    }
    case 'clear':
      return {
        staged: action.parts.includes('staged') ? [] : draft.staged,
        edits: action.parts.includes('edits') ? {} : draft.edits,
        deletes: action.parts.includes('deletes') ? [] : draft.deletes,
      };
  }
}

const resolvedTitle = (item: OfferItem) =>
  String(item.resolved_title || item.title_override || item.title || '');

/**
 * Legacy Kalemler: the catalog on the left, the offer's item tree on the
 * right. Additions, edits, moves and deletes stay on the page until
 * "Değişiklikleri Kaydet" sends them (add, then update, then delete).
 */
export function ItemsTab({ offer }: TabProps) {
  const items = useQuery(offerItemsQueryOptions(offer.id));
  const invalidate = useInvalidateOffers();
  const [draft, dispatch] = useReducer(reducer, EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState<(Parent & { parentTitle?: string }) | null>(null);
  const [focusRef, setFocusRef] = useState<string | null>(null);
  const counter = useRef(0);
  const editable = !isClosed(offer.status);
  const flat = useMemo(() => flatItemMap(items.data ?? []), [items.data]);
  const tree = useMemo(() => buildKalemTree(flat, draft), [flat, draft]);
  const changed = draftHasChanges(draft);

  const nextRef = () => `item-${++counter.current}`;
  const staged = (
    fields: Pick<StagedItem, 'templateNode' | 'titleOverride' | 'quantity' | 'label' | 'isCustom'>,
    at: Parent,
  ): StagedItem => ({
    ref: nextRef(),
    parentRef: at.parentRef ?? null,
    parentId: at.parentId ?? null,
    ...fields,
  });

  const addNode = (node: CatalogPick, at: Parent = {}) =>
    dispatch({
      type: 'stage',
      items: [
        staged(
          {
            templateNode: node.id,
            titleOverride: null,
            quantity: 1,
            label: node.title,
            isCustom: false,
          },
          at,
        ),
      ],
    });

  const addCustom = (at: Parent = {}) => {
    const item = staged(
      {
        templateNode: null,
        titleOverride: 'Yeni Kalem',
        quantity: 1,
        label: 'Yeni Kalem',
        isCustom: true,
      },
      at,
    );
    dispatch({ type: 'stage', items: [item] });
    setFocusRef(item.ref);
  };

  const addBulk = (rows: { title: string; quantity: number }[], at: Parent) => {
    const list = rows
      .filter((r) => r.title.trim())
      .map((r) =>
        staged(
          {
            templateNode: null,
            titleOverride: r.title.trim(),
            quantity: Math.max(1, Math.trunc(r.quantity) || 1),
            label: r.title.trim(),
            isCustom: true,
          },
          at,
        ),
      );
    if (list.length) dispatch({ type: 'stage', items: list });
    return list.length;
  };

  const reparent = (itemId: number, parentId: number) => {
    if (wouldCreateCycle(itemId, parentId, flat, draft)) {
      notify.error('Bir kalem kendi alt kaleminin altına taşınamaz.');
      return;
    }
    dispatch({ type: 'edit', id: itemId, patch: { parent: parentId } });
  };

  const submit = async () => {
    if (!changed) return;
    setSaving(true);
    const snapshot = draft;
    try {
      // Staged rows leave local state as soon as they are created, so a
      // later failure or a retry cannot post them twice.
      if (snapshot.staged.length) {
        await addOfferItems(offer.id, flattenStaged(snapshot.staged));
        dispatch({ type: 'clear', parts: ['staged'] });
      }
      const edits = editsPayload(snapshot);
      if (edits.length) await bulkUpdateOfferItems(offer.id, edits);
      dispatch({ type: 'clear', parts: ['edits'] });
      if (snapshot.deletes.length) await bulkDeleteOfferItems(offer.id, snapshot.deletes);
      dispatch({ type: 'clear', parts: ['deletes'] });
      notify.success('Değişiklikler kaydedildi');
    } catch (error) {
      notify.error(offerErrorMessage(error, 'Değişiklikler kaydedilemedi'));
    } finally {
      // Back to the server's tree whatever happened: add-items returns only the new rows.
      await invalidate();
      setSaving(false);
    }
  };

  const discard = async () => {
    const ok = await confirm({
      title: 'Değişiklikleri Sil',
      icon: 'fas fa-exclamation-triangle',
      message: 'Kaydedilmemiş tüm değişiklikler silinsin mi?',
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (ok) dispatch({ type: 'clear', parts: ['staged', 'edits', 'deletes'] });
  };

  const rowProps: RowHandlers = {
    editable,
    focusRef,
    onFocused: () => setFocusRef(null),
    dispatch,
    addNode,
    addCustom,
    reparent,
    paste: (at) => setPaste(at),
    deleteSaved: (item) => dispatch({ type: 'delete', ids: savedSubtree(item) }),
  };

  return (
    <>
      <div className={css.kalemler}>
        <CatalogPanel onAdd={(node) => addNode(node)} />

        <div className={css.panel}>
          <div className={css.panelHeader}>
            <div className={css.panelHeaderRow}>
              <Group gap="xs">
                <strong>
                  <FaIcon icon="fas fa-list" /> Teklif Kalemleri
                </strong>
                {changed ? (
                  <Badge color="yellow" variant="light" data-testid="staged-count">
                    {draftBadge(draft)}
                  </Badge>
                ) : null}
              </Group>
              <Button
                size="xs"
                variant="light"
                title="Excel/tablodan kalem yapıştır"
                disabled={!editable}
                leftSection={<FaIcon icon="fas fa-paste" />}
                onClick={() => setPaste({})}
              >
                Yapıştır
              </Button>
            </div>
          </div>
          <div className={css.panelBody}>
            {items.isPending ? (
              <LoadingText />
            ) : items.isError ? (
              <ErrorText>Kalemler yüklenemedi.</ErrorText>
            ) : !tree.length ? (
              <div className={css.mutedCenter}>
                <div>
                  <FaIcon icon="fas fa-inbox" /> Henüz kalem eklenmemiş.
                </div>
                {editable ? (
                  <>
                    <Group justify="center" gap="xs" mt="sm">
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<FaIcon icon="fas fa-paste" />}
                        onClick={() => setPaste({})}
                      >
                        Excel&apos;den Yapıştır
                      </Button>
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<FaIcon icon="fas fa-plus" />}
                        onClick={() => addCustom()}
                      >
                        Özel Kalem Ekle
                      </Button>
                    </Group>
                    <Text size="xs" c="dimmed" mt="sm">
                      Katalogdan sürükleyerek de ekleyebilirsiniz.
                    </Text>
                  </>
                ) : null}
              </div>
            ) : (
              <div className={css.offerTree}>
                {tree.map((node) => (
                  <KalemRow key={nodeKey(node)} node={node} level={0} {...rowProps} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {paste ? (
        <PasteItemsModal
          parentTitle={paste.parentTitle}
          subItems={Boolean(paste.parentRef || paste.parentId)}
          onClose={() => setPaste(null)}
          onAdd={(rows) => addBulk(rows, paste)}
        />
      ) : null}

      <TabFooter>
        {editable ? (
          <>
            <Button
              leftSection={<FaIcon icon="fas fa-save" />}
              disabled={!changed}
              loading={saving}
              onClick={() => void submit()}
            >
              Değişiklikleri Kaydet
            </Button>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-undo" />}
              onClick={() => void discard()}
            >
              Vazgeç
            </Button>
          </>
        ) : null}
      </TabFooter>
    </>
  );
}

const nodeKey = (node: KalemNode) => (node.kind === 'existing' ? `e${node.id}` : node.staged.ref);

interface RowHandlers {
  editable: boolean;
  focusRef: string | null;
  onFocused: () => void;
  dispatch: (action: Action) => void;
  addNode: (node: CatalogPick, at: Parent) => void;
  addCustom: (at: Parent) => void;
  reparent: (itemId: number, parentId: number) => void;
  paste: (at: Parent & { parentTitle?: string }) => void;
  deleteSaved: (item: OfferItem) => void;
}

/** Drop target: a catalog node becomes a staged child; a saved item moves under a saved item. */
function useDrop(onNode: (node: CatalogPick) => void, onExisting?: (id: number) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        e.stopPropagation();
        setOver(false);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        // Rows nest; only the innermost one under the pointer takes the drop.
        e.stopPropagation();
        setOver(false);
        const nodeId = Number.parseInt(e.dataTransfer.getData(NODE_MIME), 10);
        if (nodeId) onNode({ id: nodeId, title: e.dataTransfer.getData('nodeTitle') || '-' });
        const existingId = Number.parseInt(e.dataTransfer.getData('existingId'), 10);
        if (existingId && onExisting) onExisting(existingId);
      },
    },
  };
}

function KalemRow({ node, level, ...h }: RowHandlers & { node: KalemNode; level: number }) {
  return node.kind === 'existing' ? (
    <SavedRow node={node} level={level} {...h} />
  ) : (
    <StagedRow node={node} level={level} {...h} />
  );
}

function Children({ node, level, ...h }: RowHandlers & { node: KalemNode; level: number }) {
  if (!node.children.length) return null;
  return (
    <div className={css.offerChildren}>
      {node.children.map((child) => (
        <KalemRow key={nodeKey(child)} node={child} level={level + 1} {...h} />
      ))}
    </div>
  );
}

function SavedRow({
  node,
  level,
  ...h
}: RowHandlers & { node: Extract<KalemNode, { kind: 'existing' }>; level: number }) {
  const { item, edit } = node;
  const title = edit.title_override !== undefined ? edit.title_override : resolvedTitle(item);
  const qty = edit.quantity !== undefined ? edit.quantity : Number(item.quantity ?? 1);
  const original = originalTitle(item);
  const showOriginal = Boolean(original && title && original.trim() !== title.trim());
  const pending = Object.keys(edit).length > 0;
  const drop = useDrop(
    (pick) => h.addNode(pick, { parentId: item.id }),
    (id) => {
      if (id !== item.id) h.reparent(id, item.id);
    },
  );

  return (
    <div
      className={css.offerItem}
      data-state={pending ? 'edited' : undefined}
      data-drag-over={drop.over || undefined}
      data-item-id={item.id}
      style={{ ['--kalem-level' as string]: level }}
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        try {
          e.dataTransfer.setData('existingId', String(item.id));
        } catch {
          /* noop */
        }
      }}
      {...drop.handlers}
    >
      <div className={css.offerRow}>
        <div className={css.offerTitleWrap}>
          <input
            className={css.titleInput}
            aria-label="Kalem adı"
            value={title || (h.editable ? '' : '-')}
            placeholder="-"
            disabled={!h.editable}
            onChange={(e) =>
              h.dispatch({
                type: 'edit',
                id: item.id,
                patch: { title_override: e.currentTarget.value },
              })
            }
          />
          {showOriginal ? (
            <span className={css.originalTitle} title={original}>
              {original}
            </span>
          ) : null}
        </div>
        <input
          type="number"
          min={1}
          className={css.qtyInput}
          aria-label="Adet"
          value={qty}
          disabled={!h.editable}
          onChange={(e) =>
            h.dispatch({
              type: 'edit',
              id: item.id,
              patch: { quantity: Math.max(1, Number.parseInt(e.currentTarget.value, 10) || 1) },
            })
          }
        />
        <div className={css.offerActions}>
          <Button
            size="xs"
            variant="default"
            disabled={!h.editable}
            onClick={() => h.addCustom({ parentId: item.id })}
          >
            + alt
          </Button>
          <ActionIcon
            variant="default"
            size="md"
            title="Alt kalemleri yapıştır"
            aria-label="Alt kalemleri yapıştır"
            disabled={!h.editable}
            onClick={() => h.paste({ parentId: item.id, parentTitle: title })}
          >
            <FaIcon icon="fas fa-paste" />
          </ActionIcon>
          <ActionIcon
            variant="outline"
            color="red"
            size="md"
            aria-label="Kalemi sil"
            disabled={!h.editable}
            onClick={() => h.deleteSaved(item)}
          >
            ✕
          </ActionIcon>
        </div>
      </div>
      <Children node={node} level={level} {...h} />
    </div>
  );
}

function StagedRow({
  node,
  level,
  ...h
}: RowHandlers & { node: Extract<KalemNode, { kind: 'staged' }>; level: number }) {
  const { staged } = node;
  const title = staged.titleOverride ?? staged.label;
  const showOriginal = Boolean(
    !staged.isCustom && staged.titleOverride && staged.label.trim() !== staged.titleOverride.trim(),
  );
  const drop = useDrop((pick) => h.addNode(pick, { parentRef: staged.ref }));
  const focus = h.focusRef === staged.ref;

  return (
    <div
      className={css.offerItem}
      data-state="staged"
      data-drag-over={drop.over || undefined}
      data-ref={staged.ref}
      style={{ ['--kalem-level' as string]: level }}
      {...drop.handlers}
    >
      <div className={css.offerRow}>
        <div className={css.offerTitleWrap}>
          <input
            className={css.titleInput}
            aria-label="Kalem adı"
            value={title}
            placeholder={staged.label || 'Başlık'}
            ref={
              focus
                ? (el) => {
                    if (el) {
                      el.focus();
                      el.select();
                      h.onFocused();
                    }
                  }
                : undefined
            }
            onChange={(e) =>
              h.dispatch({
                type: 'staged-field',
                ref: staged.ref,
                patch: { titleOverride: e.currentTarget.value },
              })
            }
          />
          {showOriginal ? (
            <span className={css.originalTitle} title={staged.label}>
              {staged.label}
            </span>
          ) : null}
        </div>
        <input
          type="number"
          min={1}
          className={css.qtyInput}
          aria-label="Adet"
          value={staged.quantity}
          onChange={(e) =>
            h.dispatch({
              type: 'staged-field',
              ref: staged.ref,
              patch: { quantity: Math.max(1, Number.parseInt(e.currentTarget.value, 10) || 1) },
            })
          }
        />
        <div className={css.offerActions}>
          <Button
            size="xs"
            variant="default"
            title="Alt kalem ekle"
            onClick={() => h.addCustom({ parentRef: staged.ref })}
          >
            + alt
          </Button>
          <ActionIcon
            variant="default"
            size="md"
            title="Alt kalemleri yapıştır"
            aria-label="Alt kalemleri yapıştır"
            onClick={() => h.paste({ parentRef: staged.ref, parentTitle: title || staged.label })}
          >
            <FaIcon icon="fas fa-paste" />
          </ActionIcon>
          <ActionIcon
            variant="outline"
            color="red"
            size="md"
            title="Kaldır"
            aria-label="Kaldır"
            onClick={() => h.dispatch({ type: 'unstage', ref: staged.ref })}
          >
            ✕
          </ActionIcon>
          {staged.isCustom ? (
            <Badge variant="outline" color="gray" size="sm">
              custom
            </Badge>
          ) : null}
        </div>
      </div>
      <Children node={node} level={level} {...h} />
    </div>
  );
}
