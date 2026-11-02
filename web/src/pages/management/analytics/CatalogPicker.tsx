import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Group,
  Loader,
  Pill,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import {
  costTableCatalogNodesQueryOptions,
  type CostCatalogNode,
  type CostTableFilters,
} from '@/api/projects/cost';
import { FaIcon } from '@/ui';
import {
  buildCatalogTree,
  nodeTitle,
  scopePath,
  scopeTemplates,
  searchCatalog,
  type CatalogTreeNode,
} from './catalogTree';
import classes from './analytics.module.css';

export interface CatalogPickerProps {
  opened: boolean;
  onClose: () => void;
  /** The table's filters; the scope is the catalog items of those job orders (every page). */
  scopeFilters: CostTableFilters;
  selected: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Port of components/catalog-tree-picker in its scoped mode: a side panel with
 * a template select, a search box (2+ characters), the selected chips and a
 * collapsible tree with job counts. Changes apply at once.
 */
export function CatalogPicker({
  opened,
  onClose,
  scopeFilters,
  selected,
  onChange,
}: CatalogPickerProps) {
  const scope = useQuery({ ...costTableCatalogNodesQueryOptions(scopeFilters), enabled: opened });
  const [template, setTemplate] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());

  const nodes = useMemo(() => scope.data ?? [], [scope.data]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const templates = useMemo(() => scopeTemplates(nodes), [nodes]);
  const activeTemplate = template && templates.some((t) => t.id === template) ? template : null;
  const visible = useMemo(
    () => (activeTemplate ? nodes.filter((n) => String(n.template_id) === activeTemplate) : nodes),
    [nodes, activeTemplate],
  );
  const searching = query.trim().length >= 2;
  const groups = useMemo(() => buildCatalogTree(visible), [visible]);
  const hits = useMemo(
    () => (searching ? searchCatalog(visible, query, byId) : []),
    [searching, visible, query, byId],
  );
  const selectedSet = new Set(selected);

  const labelFor = (id: string) => {
    const node = byId.get(Number(id));
    return node ? scopePath(node, byId) : `#${id}`;
  };

  const toggle = (id: number, checked: boolean) => {
    const key = String(id);
    onChange(
      checked ? [...selected.filter((s) => s !== key), key] : selected.filter((s) => s !== key),
    );
  };

  const row = (node: CostCatalogNode, title: string, path: string, chevron?: ReactNode) => {
    const isChecked = selectedSet.has(String(node.id));
    return (
      <div className={classes.pickerRow} data-selected={isChecked || undefined}>
        {chevron}
        <Checkbox
          size="xs"
          checked={isChecked}
          onChange={(event) => toggle(node.id, event.currentTarget.checked)}
          label={
            <span title={path}>
              {title}
              {node.code ? <span className={classes.pickerCode}> {node.code}</span> : null}
            </span>
          }
          aria-label={path}
        />
        {node.job_count !== null && node.job_count !== undefined ? (
          <span className={classes.pickerCount} title="Bu kalemdeki iş emri sayısı">
            {node.job_count} iş
          </span>
        ) : null}
      </div>
    );
  };

  const renderNodes = (list: CatalogTreeNode[]) =>
    list.map(({ node, path, children }) => {
      const isOpen = !collapsed.has(node.id);
      const chevron = children.length ? (
        <button
          type="button"
          className={classes.pickerChevron}
          aria-label={isOpen ? 'Daralt' : 'Genişlet'}
          aria-expanded={isOpen}
          onClick={() =>
            setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(node.id)) next.delete(node.id);
              else next.add(node.id);
              return next;
            })
          }
        >
          <FaIcon icon={isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-right'} />
        </button>
      ) : (
        <span className={classes.pickerChevron} aria-hidden />
      );
      return (
        <div key={node.id}>
          {row(node, nodeTitle(node), path, chevron)}
          {children.length && isOpen ? (
            <div className={classes.pickerChildren}>{renderNodes(children)}</div>
          ) : null}
        </div>
      );
    });

  let body: ReactNode;
  if (scope.isPending || scope.isFetching) {
    body = (
      <Group gap="xs" c="dimmed" py="md">
        <Loader size="xs" /> Tablodaki kalemler yükleniyor...
      </Group>
    );
  } else if (!visible.length) {
    body = (
      <Text c="dimmed" size="sm" py="md">
        Tablodaki iş emirlerinde katalog kalemi yok.
      </Text>
    );
  } else if (searching) {
    body = hits.length ? (
      <div className={classes.pickerTree}>
        {hits.map(({ node, path }) => (
          <div key={node.id}>{row(node, path, path)}</div>
        ))}
      </div>
    ) : (
      <Text c="dimmed" size="sm" py="md">
        Sonuç bulunamadı.
      </Text>
    );
  } else {
    const showHeads = !activeTemplate && groups.length > 1;
    body = (
      <div className={classes.pickerTree}>
        {groups.map((group) => (
          <div key={group.templateId}>
            {showHeads ? <div className={classes.pickerHead}>{group.name}</div> : null}
            {renderNodes(group.roots)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Group gap={8}>
          <FaIcon icon="fas fa-sitemap" color="var(--gk-red-700)" />
          <Text fw={600}>Katalog Kalemi Filtresi</Text>
        </Group>
      }
    >
      <Stack gap="sm">
        <Select
          size="xs"
          aria-label="Şablon"
          placeholder="Tüm şablonlar"
          data={templates.map((t) => ({ value: t.id, label: t.name }))}
          value={activeTemplate}
          onChange={setTemplate}
          clearable
        />
        <TextInput
          size="xs"
          aria-label="Kalem ara"
          placeholder="Kalem ara (min 2 karakter)..."
          leftSection={<FaIcon icon="fas fa-search" />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          data-autofocus
        />
        {selected.length ? (
          <Stack gap={6}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {selected.length} seçili
              </Text>
              <Button variant="subtle" size="compact-xs" onClick={() => onChange([])}>
                Tümünü temizle
              </Button>
            </Group>
            <Group gap={6}>
              {selected.map((id) => (
                <Pill
                  key={id}
                  withRemoveButton
                  onRemove={() => onChange(selected.filter((s) => s !== id))}
                  maw="100%"
                >
                  <span title={labelFor(id)}>{labelFor(id)}</span>
                </Pill>
              ))}
            </Group>
          </Stack>
        ) : null}
        <Alert variant="light" color="gray" p="xs" icon={<FaIcon icon="fas fa-filter" />}>
          <Text size="xs">
            Tablodaki iş emirlerinin kalemleri (mevcut filtrelere göre, tüm sayfalar).
          </Text>
        </Alert>
        {body}
      </Stack>
    </Drawer>
  );
}
