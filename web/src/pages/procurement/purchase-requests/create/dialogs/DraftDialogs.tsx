import { Alert, Button, Group, Modal, Stack, Table, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getPurchaseRequestDrafts, purchaseRequestKeys } from '@/api/procurement/purchaseRequests';
import { formatDateTime } from '@/lib/format';
import {
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
  StatusBadge,
} from '@/ui';
import type { SavedDraftRef } from '../model';

// "Taslakları Görüntüle" (showDraftRequestsModal) and "Taslağı Kaydet" (save-draft modal).

export function DraftsModal({
  openDraftId,
  onClose,
  onLoad,
  onDelete,
}: {
  openDraftId: number | null;
  onClose: () => void;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const drafts = useQuery({
    queryKey: purchaseRequestKeys.drafts,
    queryFn: ({ signal }) => getPurchaseRequestDrafts(signal),
    staleTime: 0,
  });
  useEffect(() => {
    if (drafts.isError) {
      notify.error(`Taslak talepler yüklenirken hata oluştu: ${(drafts.error as Error).message}`);
    }
  }, [drafts.isError, drafts.error]);
  const rows = [...(drafts.data ?? [])].sort(
    (a, b) => Number(!!b.is_autosave) - Number(!!a.is_autosave),
  );

  return (
    <Modal
      opened
      onClose={onClose}
      size="min(1100px, 95vw)"
      withCloseButton={false}
      classNames={modalClassNames}
      padding={0}
    >
      <ModalHeader title="Taslak Talepler" icon="fas fa-edit" />
      <ModalBody>
        <Alert color="blue" p="xs" mb="sm">
          <strong>Bilgi:</strong> Düzenlemek istediğiniz taslak talebi seçin. Seçilen talep mevcut
          sayfaya yüklenecektir. <strong>Oto</strong> etiketli satır, sayfadaki her değişiklikte
          otomatik olarak güncellenen tek kayıttır.
        </Alert>
        {drafts.isSuccess && rows.length === 0 ? (
          <Stack align="center" c="dimmed" p="lg">
            <i className="fas fa-inbox fa-3x" />
            <Text fw={600}>Taslak talep bulunamadı</Text>
            <Text size="sm">Henüz kaydedilmiş taslak talebiniz bulunmamaktadır.</Text>
          </Stack>
        ) : (
          // The table scrolls inside the modal on narrow screens instead of
          // pushing the modal past the window.
          <Table.ScrollContainer minWidth={760}>
            <Table fz="sm" data-testid="drafts-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Talep No</Table.Th>
                  <Table.Th>Başlık</Table.Th>
                  <Table.Th>Son Kayıt</Table.Th>
                  <Table.Th>Malzeme Sayısı</Table.Th>
                  <Table.Th>Tedarikçi Sayısı</Table.Th>
                  <Table.Th>İşlemler</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((d) => (
                  <Table.Tr key={d.id} data-draft-id={d.id}>
                    <Table.Td>
                      <Text fw={700} c="blue" size="sm">
                        {d.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        <span>{d.title || 'Başlıksız'}</span>
                        {d.is_autosave ? (
                          <span title="Her değişiklikte otomatik olarak güncellenir">
                            <StatusBadge color="purple">Oto</StatusBadge>
                          </span>
                        ) : null}
                        {d.id === openDraftId ? (
                          <span title="Taslak Kaydet bu taslağın üzerine yazar">
                            <StatusBadge color="blue">Açık</StatusBadge>
                          </span>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(d.updated_at || d.created_at, { second: '2-digit' })}
                    </Table.Td>
                    <Table.Td>{d.item_count ?? 0}</Table.Td>
                    <Table.Td>{d.supplier_count ?? 0}</Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-xs"
                          leftSection={<FaIcon icon="fas fa-edit" />}
                          onClick={() => onLoad(d.id)}
                        >
                          Düzenle
                        </Button>
                        <Button
                          size="compact-xs"
                          color="red"
                          leftSection={<FaIcon icon="fas fa-trash" />}
                          onClick={() => onDelete(d.id)}
                        >
                          Sil
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          Kapat
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function SaveDraftModal({
  existing,
  initialName,
  onClose,
  onSave,
}: {
  existing: SavedDraftRef;
  initialName: string;
  onClose: () => void;
  /** Resolves true when saved (the modal closes). */
  onSave: (mode: 'new' | 'overwrite', name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const changed = trimmed !== (existing.title || '').trim();
  const hint = !trimmed
    ? 'Taslak adı boş olamaz.'
    : changed
      ? `"Yeni Taslak Olarak Kaydet" ayrı bir satır oluşturur, #${existing.id} olduğu gibi kalır. "Üzerine Yaz" ise #${existing.id} taslağını bu adla günceller.`
      : 'Ayrı bir taslak olarak saklamak için adını değiştirin.';

  const run = async (mode: 'new' | 'overwrite') => {
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = await onSave(mode, trimmed);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      opened
      onClose={onClose}
      withCloseButton={false}
      classNames={modalClassNames}
      padding={0}
    >
      <ModalHeader title="Taslağı Kaydet" icon="fas fa-save" />
      <ModalBody>
        <Stack gap="sm">
          <Alert color="yellow" p="xs">
            Bu talep daha önce <strong>{existing.title || 'Başlıksız'}</strong> (#{existing.id})
            adıyla taslak olarak kaydedildi. Kaydederseniz bu taslağın üzerine yazılacak.
          </Alert>
          <TextInput
            label="Taslak Adı"
            maxLength={200}
            autoComplete="off"
            data-autofocus
            onFocus={(e) => e.currentTarget.select()}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void run(changed ? 'new' : 'overwrite');
              }
            }}
            description={hint}
          />
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        <Button
          variant="outline"
          leftSection={<FaIcon icon="fas fa-plus" />}
          disabled={!trimmed || !changed || busy}
          onClick={() => void run('new')}
        >
          Yeni Taslak Olarak Kaydet
        </Button>
        <Button
          color="red"
          leftSection={<FaIcon icon="fas fa-save" />}
          disabled={!trimmed || busy}
          onClick={() => void run('overwrite')}
        >
          Üzerine Yaz
        </Button>
      </ModalFooter>
    </Modal>
  );
}
