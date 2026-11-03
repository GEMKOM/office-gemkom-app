import { ActionIcon, Button, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState, type DragEvent } from 'react';
import {
  nodeChildrenQueryOptions,
  offerTemplatesQueryOptions,
  searchTemplateNodesQueryOptions,
  templateRootNodesQueryOptions,
  type OfferTemplate,
  type TemplateNode,
} from '@/api/sales/offerTemplates';
import { FaIcon } from '@/ui';
import { ErrorText, LoadingText } from '../parts';
import css from '../OffersPage.module.css';

/** What a catalog row hands to the item list: the node and its title. */
export interface CatalogPick {
  id: number;
  title: string;
}

export const NODE_MIME = 'nodeId';

function dragNode(event: DragEvent, node: CatalogPick) {
  // Child rows sit inside their parent's row; the parent must not take over the drag.
  event.stopPropagation();
  try {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(NODE_MIME, String(node.id));
    // The title rides along so a drop can stage the row without a lookup.
    event.dataTransfer.setData('nodeTitle', node.title);
  } catch {
    /* some browsers refuse custom types; the + button still works */
  }
}

const pickOf = (node: TemplateNode): CatalogPick => ({ id: node.id, title: node.title || '-' });

function CatalogNodeRow({
  node,
  templateId,
  onAdd,
}: {
  node: TemplateNode;
  templateId: number;
  onAdd: (node: CatalogPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const ownTemplate = Number((node as { template?: unknown }).template) || templateId;
  const hasChildren = (node.children_count ?? 0) > 0;
  const children = useQuery({
    ...nodeChildrenQueryOptions(ownTemplate, node.id),
    enabled: open && hasChildren,
  });
  const code = (node as { code?: unknown }).code;

  return (
    <div className={css.catalogNode} draggable onDragStart={(e) => dragNode(e, pickOf(node))}>
      <button
        type="button"
        className={css.nodeToggle}
        disabled={!hasChildren}
        aria-label={hasChildren ? `${node.title} ${open ? 'daralt' : 'genişlet'}` : undefined}
        aria-expanded={hasChildren ? open : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {hasChildren ? (
          <FaIcon icon={open ? 'fas fa-chevron-down' : 'fas fa-chevron-right'} />
        ) : (
          '·'
        )}
      </button>
      <div className={css.nodeMain}>
        <div className={css.nodeTitle}>{node.title || '-'}</div>
        {code ? <div className={css.nodeCode}>{String(code)}</div> : null}
      </div>
      <ActionIcon
        variant="outline"
        size="md"
        title="Teklife ekle"
        aria-label={`${node.title} teklife ekle`}
        onClick={() => onAdd(pickOf(node))}
      >
        +
      </ActionIcon>
      {open ? (
        <div className={css.catalogChildren}>
          {children.isPending ? (
            <LoadingText />
          ) : children.isError ? (
            <ErrorText>Katalog yüklenemedi.</ErrorText>
          ) : (
            (children.data ?? []).map((child) => (
              <CatalogNodeRow key={child.id} node={child} templateId={ownTemplate} onAdd={onAdd} />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function TemplateBody({
  template,
  onAdd,
}: {
  template: OfferTemplate;
  onAdd: (node: CatalogPick) => void;
}) {
  const roots = useQuery(templateRootNodesQueryOptions(template.id));
  if (roots.isPending) return <LoadingText />;
  if (roots.isError) return <ErrorText>Katalog yüklenemedi.</ErrorText>;
  return (
    <>
      {roots.data.map((node) => (
        <CatalogNodeRow key={node.id} node={node} templateId={template.id} onAdd={onAdd} />
      ))}
    </>
  );
}

function SearchResults({ q, onAdd }: { q: string; onAdd: (node: CatalogPick) => void }) {
  const results = useQuery(searchTemplateNodesQueryOptions(q));
  if (results.isPending) return <LoadingText />;
  if (results.isError) return <ErrorText>Arama başarısız.</ErrorText>;
  if (!results.data.length) return <div className={css.mutedCenter}>Sonuç bulunamadı.</div>;
  return (
    <div className={css.searchResults}>
      {results.data.map((node) => (
        <div
          key={node.id}
          className={css.searchRow}
          draggable
          onDragStart={(e) => dragNode(e, pickOf(node))}
        >
          <div className={css.nodeMain}>
            <div className={css.breadcrumb}>{(node.breadcrumb ?? []).join(' › ')}</div>
            <div className={css.nodeTitle}>{node.title || '-'}</div>
          </div>
          <ActionIcon
            variant="outline"
            size="md"
            aria-label={`${node.title} teklife ekle`}
            onClick={() => onAdd(pickOf(node))}
          >
            +
          </ActionIcon>
        </div>
      ))}
    </div>
  );
}

/**
 * The catalog side of Kalemler: one template open at a time, each node's
 * children fetched when it is opened, or search results from two characters.
 * Rows are added with + or dragged onto an item.
 */
export function CatalogPanel({ onAdd }: { onAdd: (node: CatalogPick) => void }) {
  const [search, setSearch] = useState('');
  const [q] = useDebouncedValue(search.trim(), 300);
  const [openTemplate, setOpenTemplate] = useState<number | null>(null);
  const templates = useQuery(offerTemplatesQueryOptions());
  const searching = search.trim().length >= 2 && q.length >= 2;

  return (
    <div className={css.panel}>
      <div className={css.panelHeader}>
        <div className={css.panelHeaderRow}>
          <strong>
            <FaIcon icon="fas fa-sitemap" /> Katalog
          </strong>
          <Button
            component="a"
            href="/sales/catalog/"
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            variant="light"
            title="Ürün kataloğunu yeni sekmede aç"
            leftSection={<FaIcon icon="fas fa-external-link-alt" />}
          >
            Katalogu Aç
          </Button>
        </div>
        <TextInput
          mt="xs"
          size="xs"
          placeholder="Ara (en az 2 karakter)..."
          aria-label="Katalogda ara"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </div>
      <div className={css.panelBody}>
        {searching ? (
          <SearchResults q={q} onAdd={onAdd} />
        ) : templates.isPending ? (
          <LoadingText>Şablonlar yükleniyor...</LoadingText>
        ) : templates.isError ? (
          <ErrorText>Şablonlar yüklenemedi.</ErrorText>
        ) : !templates.data.length ? (
          <div className={css.mutedCenter}>Şablon bulunamadı.</div>
        ) : (
          <div className={css.templates}>
            {templates.data.map((tpl) => {
              const open = openTemplate === tpl.id;
              const label = String(
                (tpl as { title?: unknown }).title || tpl.name || `Şablon #${tpl.id}`,
              );
              return (
                <div key={tpl.id} className={css.template}>
                  <UnstyledButton
                    className={css.templateToggle}
                    aria-expanded={open}
                    onClick={() => setOpenTemplate(open ? null : tpl.id)}
                  >
                    <FaIcon icon={open ? 'fas fa-chevron-down' : 'fas fa-chevron-right'} />{' '}
                    <strong>{label}</strong>
                  </UnstyledButton>
                  {open ? (
                    <div className={css.templateBody}>
                      <TemplateBody template={tpl} onAdd={onAdd} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
