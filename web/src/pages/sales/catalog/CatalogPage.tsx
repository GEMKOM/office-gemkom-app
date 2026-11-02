import { Badge, Button, Center, Group, Loader, Stack, Text, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  offerTemplateQueryOptions,
  offerTemplatesQueryOptions,
  useOfferTemplateMutations,
  type OfferTemplateDetail,
  type TemplateNode,
} from '@/api/sales/offerTemplates';
import { confirm, FaIcon, notify, PageHeader, Panel } from '@/ui';
import { CatalogTree } from './CatalogTree';
import { NodeFormModal, TemplateFormModal } from './CatalogFormModals';
import css from './CatalogPage.module.css';

type NodeModal = { mode: 'create'; parentId: number | null } | { mode: 'edit'; node: TemplateNode };

/**
 * Port of sales/catalog (catalog.js), Ürün Kataloğu: offer templates on the
 * left, the selected template's equipment tree on the right. Children load
 * when a node is opened.
 */
export function CatalogPage() {
  const templates = useQuery(offerTemplatesQueryOptions());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [templateModal, setTemplateModal] = useState<'create' | OfferTemplateDetail | null>(null);
  const [nodeModal, setNodeModal] = useState<NodeModal | null>(null);
  const mutations = useOfferTemplateMutations();

  useEffect(() => {
    if (templates.isError) notify.error('Kataloglar yüklenirken hata oluştu');
  }, [templates.isError]);

  const list = templates.data ?? [];

  const deleteNode = async (templateId: number, node: TemplateNode) => {
    const ok = await confirm({
      message: 'Bu ekipmanı ve alt ekipmanlarını silmek istediğinize emin misiniz?',
      icon: 'fas fa-exclamation-triangle',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.deleteNode.mutateAsync({ templateId, nodeId: node.id });
      notify.success('Ekipman silindi');
    } catch {
      notify.error('Silme hatası');
    }
  };

  return (
    <>
      <PageHeader
        title="Ürün Kataloğu"
        subtitle="Teklif şablonları ve ürün ağaçlarını yönetin"
        icon="fas fa-book"
        backTo="/sales/"
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setTemplateModal('create')}>
            Yeni Katalog
          </Button>
        }
      />

      <div className={css.layout}>
        <div data-testid="catalog-list">
          {templates.isPending ? (
            <Center py="lg">
              <Loader size="sm" />
            </Center>
          ) : list.length === 0 ? (
            <Panel>
              <Text c="dimmed" ta="center" py="md">
                Henüz katalog oluşturulmamış.
              </Text>
            </Panel>
          ) : (
            list.map((t) => (
              <UnstyledButton
                key={t.id}
                className={css.card}
                data-selected={t.id === selectedId || undefined}
                aria-pressed={t.id === selectedId}
                onClick={() => setSelectedId(t.id)}
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text fw={600}>{t.name}</Text>
                    {t.description ? (
                      <Text size="sm" c="dimmed">
                        {t.description}
                      </Text>
                    ) : null}
                  </div>
                  <Group gap={4} wrap="nowrap">
                    <Badge color={t.is_active ? 'green' : 'gray'} radius="sm" tt="none">
                      {t.is_active ? 'Aktif' : 'Pasif'}
                    </Badge>
                    <Badge color="gray" variant="light" radius="sm" tt="none">
                      {t.node_count || 0} ekipman
                    </Badge>
                  </Group>
                </Group>
              </UnstyledButton>
            ))
          )}
        </div>

        {selectedId === null ? (
          <Panel>
            <Stack align="center" gap={6} py="xl" c="dimmed">
              <FaIcon icon="fas fa-book" style={{ fontSize: 40 }} />
              <Text>Ürün ağacını görüntülemek için soldaki listeden bir katalog seçin.</Text>
            </Stack>
          </Panel>
        ) : (
          <TemplatePanel
            key={selectedId}
            templateId={selectedId}
            onEdit={(template) => setTemplateModal(template)}
            onAddNode={(parentId) => setNodeModal({ mode: 'create', parentId })}
            onEditNode={(node) => setNodeModal({ mode: 'edit', node })}
            onDeleteNode={(node) => void deleteNode(selectedId, node)}
          />
        )}
      </div>

      {templateModal ? (
        <TemplateFormModal
          template={templateModal === 'create' ? null : templateModal}
          onClose={() => setTemplateModal(null)}
          onSave={async (data) => {
            if (templateModal === 'create') {
              try {
                await mutations.createTemplate.mutateAsync(data);
                notify.success('Katalog oluşturuldu');
                setTemplateModal(null);
              } catch {
                notify.error('Oluşturma hatası');
              }
            } else {
              try {
                await mutations.patchTemplate.mutateAsync({ id: templateModal.id, data });
                notify.success('Katalog güncellendi');
                setTemplateModal(null);
              } catch {
                notify.error('Güncelleme hatası');
              }
            }
          }}
        />
      ) : null}

      {nodeModal && selectedId !== null ? (
        <NodeFormModal
          node={nodeModal.mode === 'edit' ? nodeModal.node : null}
          isChild={nodeModal.mode === 'create' && nodeModal.parentId !== null}
          onClose={() => setNodeModal(null)}
          onSave={async (data) => {
            if (nodeModal.mode === 'create') {
              try {
                await mutations.createNode.mutateAsync({
                  templateId: selectedId,
                  data: { ...data, parent: nodeModal.parentId },
                });
                notify.success('Ekipman eklendi');
                setNodeModal(null);
              } catch {
                notify.error('Ekleme hatası');
              }
            } else {
              try {
                await mutations.patchNode.mutateAsync({ templateId: selectedId, nodeId: nodeModal.node.id, data });
                notify.success('Ekipman güncellendi');
                setNodeModal(null);
              } catch {
                notify.error('Güncelleme hatası');
              }
            }
          }}
        />
      ) : null}
    </>
  );
}

interface TemplatePanelProps {
  templateId: number;
  onEdit: (template: OfferTemplateDetail) => void;
  onAddNode: (parentId: number | null) => void;
  onEditNode: (node: TemplateNode) => void;
  onDeleteNode: (node: TemplateNode) => void;
}

/** The right-hand tree panel (legacy renderTree). */
function TemplatePanel({ templateId, onEdit, onAddNode, onEditNode, onDeleteNode }: TemplatePanelProps) {
  const detail = useQuery(offerTemplateQueryOptions(templateId));
  // Opened nodes stay open across reloads after an edit.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());

  if (detail.isPending) {
    return (
      <Panel>
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      </Panel>
    );
  }
  if (!detail.data) {
    return (
      <Panel>
        <Text c="red" ta="center" py="md">
          Katalog yüklenemedi.
        </Text>
      </Panel>
    );
  }

  const template = detail.data;
  const roots = template.root_nodes ?? [];

  return (
    <Panel
      title={template.name}
      actions={
        <>
          <Button size="xs" variant="outline" leftSection={<FaIcon icon="fas fa-edit" />} onClick={() => onEdit(template)}>
            Düzenle
          </Button>
          <Button size="xs" color="green" leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => onAddNode(null)}>
            Ekipman Ekle
          </Button>
        </>
      }
    >
      <div className={css.treePanel} data-testid="catalog-tree">
        {roots.length === 0 ? (
          <Text c="dimmed" ta="center" py="md">
            Bu katalogda henüz ekipman yok.
          </Text>
        ) : (
          <CatalogTree
            templateId={templateId}
            nodes={roots}
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onAddChild={(node) => onAddNode(node.id)}
            onEdit={onEditNode}
            onDelete={onDeleteNode}
          />
        )}
      </div>
    </Panel>
  );
}
