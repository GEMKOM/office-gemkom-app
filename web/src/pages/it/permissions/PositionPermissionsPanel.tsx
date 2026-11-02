import { Accordion, Badge, Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  positionCodenames,
  positionDetailQueryOptions,
  useSavePositionPermissions,
} from '@/api/it/permissions';
import { FaIcon, notify, Panel } from '@/ui';
import { LevelPill, SectionBadge, sectionLabel, setsEqual, useCatalog, type CatalogItem } from './permissionsMeta';
import css from './PermissionsPage.module.css';

export interface PositionPermissionsPanelProps {
  positionId: number;
  /** Shown while the detail loads or when it fails. */
  fallbackTitle: string;
  /** Open sections, kept across positions (legacy sectionCollapseState). */
  expandedSections: string[];
  onExpandedSectionsChange: (sections: string[]) => void;
}

/**
 * The selected position's card (legacy loadPositionDetail): holders and a
 * draft of its permissions, saved with Kaydet in one PATCH.
 */
export function PositionPermissionsPanel({
  positionId,
  fallbackTitle,
  expandedSections,
  onExpandedSectionsChange,
}: PositionPermissionsPanelProps) {
  const detail = useQuery(positionDetailQueryOptions(positionId));
  const { catalog } = useCatalog();
  const save = useSavePositionPermissions();
  // null: no edits, the saved set is shown.
  const [draft, setDraft] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (detail.isError) notify.error(detail.error, { fallback: 'Pozisyon detayları yüklenirken hata oluştu' });
  }, [detail.isError, detail.error]);

  const original = useMemo(() => new Set(positionCodenames(detail.data)), [detail.data]);
  const current = draft ?? original;
  const dirty = draft !== null && !setsEqual(draft, original);

  const sections = useMemo(() => {
    const bySection = new Map<string, CatalogItem[]>();
    for (const p of catalog) {
      const list = bySection.get(p.section) ?? [];
      list.push(p);
      bySection.set(p.section, list);
    }
    return [...bySection.keys()]
      .sort((a, b) => a.localeCompare(b, 'tr'))
      .map((section) => ({
        section,
        items: (bySection.get(section) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      }));
  }, [catalog]);

  if (!detail.data) {
    return (
      <Panel className={css.detail}>
        <Text fw={700} size="lg">
          <FaIcon icon="fas fa-sitemap" style={{ marginRight: 8 }} />
          {fallbackTitle}
        </Text>
        <Text c="dimmed" size="sm" mt={4}>
          {detail.isError ? 'Detaylar yüklenemedi.' : 'Yükleniyor...'}
        </Text>
      </Panel>
    );
  }

  const position = detail.data;
  const holders = position.holders ?? [];

  const setCodes = (codes: string[], on: boolean) => {
    const next = new Set(current);
    for (const code of codes) {
      if (on) next.add(code);
      else next.delete(code);
    }
    setDraft(next);
  };

  const submit = async () => {
    if (!dirty || !draft) {
      setDraft(null);
      return;
    }
    try {
      await save.mutateAsync({ id: positionId, codenames: [...draft] });
      notify.success('Pozisyon yetkileri kaydedildi');
      setDraft(null);
    } catch (error) {
      notify.error(error, { fallback: 'Kaydetme sırasında hata oluştu' });
    }
  };

  return (
    <Panel className={css.detail}>
      <Stack gap="md" data-testid="position-permissions">
        <div>
          <Text fw={700} size="lg">
            <FaIcon icon="fas fa-sitemap" style={{ marginRight: 8 }} />
            {position.title || '-'} <LevelPill level={position.level} />
          </Text>
          <Text c="dimmed" size="sm">
            {position.department_name || ''}
            {position.parent_title ? (
              <>
                {' '}
                · Bağlı: <strong>{position.parent_title}</strong>
              </>
            ) : null}
          </Text>
        </div>

        <Group gap="xs">
          <Badge color="gray" radius="sm" tt="none">
            Kişi: {holders.length}
          </Badge>
          <Badge color="gray" radius="sm" tt="none" data-testid="position-perm-count">
            Yetki: {current.size}
          </Badge>
          <Badge color={position.is_active ? 'green' : 'gray'} radius="sm" tt="none">
            {position.is_active ? 'Aktif' : 'Pasif'}
          </Badge>
        </Group>

        <Group gap="xs">
          <Button
            size="xs"
            color="green"
            leftSection={<FaIcon icon="fas fa-save" />}
            disabled={!dirty}
            loading={save.isPending}
            onClick={() => void submit()}
          >
            Kaydet
          </Button>
          <Button
            size="xs"
            variant="outline"
            color="gray"
            leftSection={<FaIcon icon="fas fa-undo" />}
            disabled={!dirty || save.isPending}
            onClick={() => setDraft(null)}
          >
            Vazgeç
          </Button>
          <Text size="xs" c="dimmed" ml="auto">
            {save.isPending ? 'Kaydediliyor...' : dirty ? 'Kaydedilmemiş değişiklikler' : ''}
          </Text>
        </Group>

        <div>
          <div className={css.sectionTitle}>Mevcut Kullanıcılar</div>
          <div className={css.holders}>
            {holders.length ? (
              holders.map((h) => <div key={h.id}>{h.full_name || h.username || '-'}</div>)
            ) : (
              <Text c="dimmed" size="sm">
                Bu pozisyonda kullanıcı yok.
              </Text>
            )}
          </div>
        </div>

        <div>
          <div className={css.sectionTitle}>Yetkiler</div>
          {sections.length === 0 ? (
            <Text c="dimmed" size="sm">
              -
            </Text>
          ) : (
            <Accordion
              multiple
              variant="contained"
              value={expandedSections}
              onChange={onExpandedSectionsChange}
              className={css.sections}
            >
              {sections.map(({ section, items }) => {
                const codes = items.map((it) => it.codename);
                const selected = codes.filter((code) => current.has(code)).length;
                const all = codes.length > 0 && selected === codes.length;
                return (
                  <Accordion.Item key={section} value={section}>
                    <div className={css.sectionControl}>
                      <Accordion.Control>
                        <Group gap="xs">
                          <SectionBadge section={section} />
                          <Text size="xs" c="dimmed">
                            {selected}/{codes.length}
                          </Text>
                        </Group>
                      </Accordion.Control>
                      <div className={css.sectionCheck}>
                        <Checkbox
                          aria-label={`${sectionLabel(section)} bölümünün tümü`}
                          checked={all}
                          indeterminate={selected > 0 && !all}
                          onChange={(event) => setCodes(codes, event.currentTarget.checked)}
                        />
                      </div>
                    </div>
                    <Accordion.Panel>
                      {items.map((it) => (
                        <div key={it.codename} className={css.permRow}>
                          <div>
                            <div>{it.name || '-'}</div>
                            <div className={css.code}>{it.codename}</div>
                          </div>
                          <Checkbox
                            aria-label={it.name || it.codename}
                            checked={current.has(it.codename)}
                            onChange={(event) => setCodes([it.codename], event.currentTarget.checked)}
                          />
                        </div>
                      ))}
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          )}
        </div>
      </Stack>
    </Panel>
  );
}
