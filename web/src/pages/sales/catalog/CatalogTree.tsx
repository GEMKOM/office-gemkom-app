import { ActionIcon, Group, Loader, Text, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { nodeChildrenQueryOptions, type TemplateNode } from '@/api/sales/offerTemplates';
import { FaIcon, notify } from '@/ui';
import css from './CatalogPage.module.css';

export interface CatalogTreeProps {
  templateId: number;
  nodes: TemplateNode[];
  expanded: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onAddChild: (node: TemplateNode) => void;
  onEdit: (node: TemplateNode) => void;
  onDelete: (node: TemplateNode) => void;
}

/** The equipment tree (legacy renderNodes); a node's children load when it is opened. */
export function CatalogTree(props: CatalogTreeProps) {
  return (
    <>
      {props.nodes.map((node) => (
        <CatalogNode key={node.id} node={node} {...props} />
      ))}
    </>
  );
}

function CatalogNode({ node, ...props }: CatalogTreeProps & { node: TemplateNode }) {
  const { templateId, expanded, onToggle, onAddChild, onEdit, onDelete } = props;
  const childCount = node.children_count ?? node.children?.length ?? 0;
  const hasChildren = childCount > 0;
  const isOpen = hasChildren && expanded.has(node.id);
  const children = useQuery({ ...nodeChildrenQueryOptions(templateId, node.id), enabled: isOpen });

  useEffect(() => {
    if (children.isError) notify.error('Alt ekipmanlar yüklenemedi');
  }, [children.isError]);

  const loaded = children.data ?? (children.isError ? [] : node.children) ?? [];

  return (
    <>
      <div className={css.node} data-node-id={node.id}>
        {hasChildren ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`${node.title} ${isOpen ? 'daralt' : 'genişlet'}`}
            aria-expanded={isOpen}
            title={isOpen ? 'Daralt' : 'Genişlet'}
            onClick={() => onToggle(node.id)}
          >
            <FaIcon icon={isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-right'} />
          </ActionIcon>
        ) : (
          <span className={css.spacer} />
        )}
        <FaIcon
          icon={hasChildren ? 'fas fa-folder' : 'fas fa-file'}
          color={hasChildren ? 'var(--mantine-color-yellow-6)' : 'var(--mantine-color-blue-6)'}
        />
        <span className={css.nodeTitle}>
          {node.title}
          {node.description ? (
            <Text span size="xs" c="dimmed" ml={4}>
              {node.description}
            </Text>
          ) : null}
          {hasChildren ? (
            <span className={css.count} title="Alt ekipman sayısı">
              {childCount}
            </span>
          ) : null}
        </span>
        <span className={css.sequence}>#{node.sequence ?? ''}</span>
        <Group gap={4} className={css.actions} wrap="nowrap">
          <Tooltip label="Alt ekipman ekle">
            <ActionIcon variant="outline" size="sm" aria-label={`${node.title} altına ekipman ekle`} onClick={() => onAddChild(node)}>
              <FaIcon icon="fas fa-plus" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Düzenle">
            <ActionIcon variant="outline" color="gray" size="sm" aria-label={`${node.title} düzenle`} onClick={() => onEdit(node)}>
              <FaIcon icon="fas fa-edit" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Sil">
            <ActionIcon variant="outline" color="red" size="sm" aria-label={`${node.title} sil`} onClick={() => onDelete(node)}>
              <FaIcon icon="fas fa-trash" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>
      {isOpen ? (
        <div className={css.children}>
          {children.isPending ? (
            <Text size="sm" c="dimmed" py={6}>
              <Loader size={12} mr={6} />
              Yükleniyor...
            </Text>
          ) : loaded.length ? (
            <CatalogTree {...props} nodes={loaded} />
          ) : (
            <Text size="sm" c="dimmed" py={6}>
              Alt ekipman yok.
            </Text>
          )}
        </div>
      ) : null}
    </>
  );
}
