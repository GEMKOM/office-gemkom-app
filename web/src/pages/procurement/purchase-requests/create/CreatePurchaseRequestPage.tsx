import { Alert, Badge, Button, Card, Grid, Group, NativeSelect, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  availablePlanningItemsCountQueryOptions,
  createPurchaseRequest,
  currencyRatesQueryOptions,
  deletePurchaseRequestDraft,
  getPurchaseRequestDraft,
  invalidatePurchaseRequests,
  purchaseRequestKeys,
  savePurchaseRequestDraft,
  submitPurchaseRequest,
  updatePurchaseRequestDraft,
  type PurchaseRequestDraft,
} from '@/api/procurement/purchaseRequests';
import { confirm, DataTable, FaIcon, notify, PageHeader, Panel, type CellEdit, type RowAction } from '@/ui';
import { ComparisonTable } from '../shared/ComparisonTable';
import { truncate } from '../shared/columns';
import classes from './CreatePurchaseRequest.module.css';
import { BulkImportModal } from './dialogs/BulkImportModal';
import { DraftsModal, SaveDraftModal } from './dialogs/DraftDialogs';
import { ItemModal } from './dialogs/ItemModal';
import { MergeModal } from './dialogs/MergeModal';
import { OfferModal } from './dialogs/OfferModal';
import { PlanningItemsModal } from './dialogs/PlanningItemsModal';
import { SupplierModal } from './dialogs/SupplierModal';
import { itemColumns } from './itemColumns';
import {
  applyMerges,
  buildDraftPayload,
  buildSubmitPayload,
  clearItems,
  clearStorage,
  clearSuppliers,
  comparisonData,
  duplicateItemsMessage,
  editItem,
  emptyState,
  fromStorage,
  mergeGroups,
  PRIORITY_OPTIONS,
  removeItems,
  removeSupplier,
  rowMarks,
  STORAGE_KEY,
  stateFromDraft,
  toStorage,
  validateAll,
  validateHeader,
  withItems,
  type DraftPayload,
  type EditableField,
  type PrItem,
  type PrState,
  type PrSupplier,
  type RowMark,
} from './model';
import { notifyLines } from './notifyLines';
import { SupplierCards } from './SupplierCards';
import { useAutosave } from './useAutosave';

// Port of procurement/purchase-requests/create/ (create.js and its managers).

type Dialog =
  | { kind: 'item' }
  | { kind: 'bulk' }
  | { kind: 'merge' }
  | { kind: 'supplier'; editing: PrSupplier | null }
  | { kind: 'offer'; supplier: PrSupplier }
  | { kind: 'drafts' }
  | { kind: 'save-draft'; payload: DraftPayload }
  | { kind: 'planning' };

function readStorage(): PrState | null {
  try {
    return fromStorage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function storeNow(state: PrState) {
  try {
    localStorage.setItem(STORAGE_KEY, toStorage(state));
  } catch {
    // Blocked storage: nothing to restore on reload.
  }
}

function wipeStorage() {
  try {
    clearStorage(localStorage);
  } catch {
    // Blocked storage.
  }
}

type Touched = Partial<Record<'title' | 'description' | 'needed_date', boolean>>;

export function CreatePurchaseRequestPage() {
  const queryClient = useQueryClient();
  const rates = useQuery(currencyRatesQueryOptions()).data ?? null;
  const planningCount = useQuery(availablePlanningItemsCountQueryOptions());
  const [state, setState] = useState<PrState>(() => readStorage() ?? emptyState());
  const autosave = useAutosave(state, rates);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [touched, setTouched] = useState<Touched>({});
  /** Submit-time row marks, valid until the next change (legacy renderAll cleared them). */
  const [marksFor, setMarksFor] = useState<{ state: PrState; marks: Record<string, RowMark> } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** A request created whose submit failed: Gönder again only submits it (if nothing changed). */
  const created = useRef<{ id: number; snapshot: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  const update = useCallback((fn: (s: PrState) => PrState) => setState(fn), []);

  const headerErrors = validateHeader(state);
  const fieldError = (key: keyof Touched) => (touched[key] ? headerErrors[key] : undefined);

  const clearPage = useCallback(() => {
    autosave.markExternal();
    wipeStorage();
    setState(emptyState());
    setTouched({});
    setMarksFor(null);
  }, [autosave]);

  // ---------------------------------------------------------------- items

  const onCellEdit = useCallback(
    ({ row, columnKey, value }: CellEdit<PrItem>) => {
      update((s) => editItem(s, row.id, columnKey as EditableField, value));
      notify.success('Malzeme başarıyla güncellendi');
    },
    [update],
  );

  const deleteItem = useCallback(
    async (item: PrItem) => {
      const ok = await confirm({
        title: 'Malzeme Silme Onayı',
        danger: true,
        message: 'Aşağıdaki malzemeyi silmek istediğinizden emin misiniz?',
        subtitle: 'Dikkat: Bu işlem geri alınamaz!',
        details: (
          <Stack gap={2}>
            <Text size="sm"><strong>Kod:</strong> {item.code}</Text>
            <Text size="sm"><strong>Ad:</strong> {item.name}</Text>
            <Text size="sm"><strong>İş No:</strong> {item.job_no || '-'}</Text>
            <Text size="sm"><strong>Miktar:</strong> {`${item.quantity} ${item.unit}`}</Text>
            {item.specs ? (
              <Text size="sm"><strong>Özellikler:</strong> {truncate(item.specs, 100)}</Text>
            ) : null}
          </Stack>
        ),
        description: 'Bu malzeme ile ilişkili tüm tedarikçi teklifleri de silinecektir.',
        confirmLabel: 'Evet, Sil',
        cancelLabel: 'İptal',
      });
      if (!ok) return;
      update((s) => removeItems(s, new Set([item.id])));
      notify.success('Malzeme başarıyla silindi');
    },
    [update],
  );

  const clearAllItems = async () => {
    if (!state.items.length) return;
    const ok = await confirm({
      title: 'Tüm Malzemeleri Silme Onayı',
      danger: true,
      subtitle: 'Dikkat: Bu işlem geri alınamaz!',
      message: (
        <>
          <strong>{`${state.items.length} adet malzeme`}</strong> silinecektir. Bu işlem:
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            <li>Tüm malzemeleri kalıcı olarak silecek</li>
            <li>Tüm tedarikçi tekliflerini silecek</li>
            <li>Karşılaştırma tablosunu temizleyecek</li>
          </ul>
        </>
      ),
      description: 'Öneri: Eğer emin değilseniz, önce verilerinizi dışa aktarabilirsiniz.',
      confirmLabel: 'Evet, Tümünü Sil',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    update(clearItems);
    notify.success('Tüm malzemeler başarıyla silindi');
  };

  const openMerge = () => {
    if (!state.items.length) return;
    if (mergeGroups(state.items).length === 0) {
      notify.info('Birleştirilecek aynı kodlu malzeme bulunamadı.');
      return;
    }
    setDialog({ kind: 'merge' });
  };

  const columns = useMemo(() => itemColumns(), []);
  const rowActions = useCallback(
    (): RowAction<PrItem>[] => [
      { key: 'delete', label: 'Sil', icon: 'fas fa-trash', color: 'danger', onClick: (r) => void deleteItem(r) },
    ],
    [deleteItem],
  );

  // ---------------------------------------------------------------- suppliers

  const deleteSupplier = async (supplier: PrSupplier) => {
    const ok = await confirm({
      message: 'Bu tedarikçiyi silmek istediğinizden emin misiniz? Tüm teklif verileri de silinecektir.',
      danger: true,
    });
    if (ok) update((s) => removeSupplier(s, supplier.id));
  };

  const clearAllSuppliers = async () => {
    if (!state.suppliers.length) return;
    const ok = await confirm({
      message: 'Tüm tedarikçileri ve ilişkili teklif verilerini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      danger: true,
    });
    if (ok) update(clearSuppliers);
  };

  // ---------------------------------------------------------------- drafts

  const persistDraft = async (payload: DraftPayload, title: string, overwriteId?: number): Promise<boolean> => {
    const body = { ...payload, title, data: { ...payload.data, title } };
    try {
      let saved: PurchaseRequestDraft;
      let message = 'Taslak başarıyla kaydedildi!';
      if (overwriteId) {
        try {
          saved = await updatePurchaseRequestDraft(overwriteId, body);
          message = 'Taslağın üzerine yazıldı!';
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
          saved = await savePurchaseRequestDraft(body);
          message = 'Önceki taslak bulunamadı, yeni taslak olarak kaydedildi.';
        }
      } else {
        saved = await savePurchaseRequestDraft(body);
      }
      notify.success(message);
      // The "Oto" row now points at this named draft (data.source_draft).
      await autosave.flush({ ...state, title, savedDraft: { id: saved.id, title: saved.title } });
      void queryClient.invalidateQueries({ queryKey: purchaseRequestKeys.drafts });
      clearPage();
      return true;
    } catch (error) {
      notify.error(`Taslak kaydedilirken hata oluştu: ${(error as Error).message}`);
      return false;
    }
  };

  const saveDraft = async () => {
    const built = buildDraftPayload(state, rates, { strict: true });
    if ('error' in built) {
      notifyLines.error(built.error);
      return;
    }
    if (state.savedDraft?.id) {
      setDialog({ kind: 'save-draft', payload: built.payload });
      return;
    }
    await persistDraft(built.payload, built.payload.title);
  };

  const loadDraft = async (id: number) => {
    setDialog(null);
    try {
      const draft = await getPurchaseRequestDraft(id);
      if (!draft) {
        notify.error('Taslak bulunamadı');
        return;
      }
      const next = stateFromDraft(draft);
      autosave.markExternal();
      wipeStorage();
      storeNow(next);
      setState(next);
      setTouched({});
      setMarksFor(null);
      notify.success('Taslak yüklendi');
    } catch (error) {
      notify.error(`Taslak yüklenirken hata oluştu: ${(error as Error).message}`);
    }
  };

  const deleteDraft = async (id: number) => {
    const ok = await confirm({ message: 'Bu taslağı silmek istediğinizden emin misiniz?', danger: true });
    if (!ok) return;
    try {
      await deletePurchaseRequestDraft(id);
      notify.success('Taslak başarıyla silindi!');
      if (state.savedDraft?.id === id) update((s) => ({ ...s, savedDraft: null }));
      autosave.forgetSnapshot();
      void queryClient.invalidateQueries({ queryKey: purchaseRequestKeys.drafts });
    } catch (error) {
      notify.error(`Taslak silinirken hata oluştu: ${(error as Error).message}`);
    }
  };

  // ---------------------------------------------------------------- submit

  const submit = async () => {
    setSubmitting(true);
    try {
      const errors = validateAll(state);
      if (errors.length) {
        for (const message of errors) notify.error(message);
        setTouched({ title: true, description: true, needed_date: true });
        setMarksFor({ state, marks: rowMarks(state) });
        if (Object.keys(validateHeader(state)).length) {
          titleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      const duplicate = duplicateItemsMessage(state.items);
      if (duplicate) {
        notifyLines.error(duplicate);
        return;
      }
      const payload = buildSubmitPayload(state, rates);
      // What the user entered (the EUR total also moves when the rates arrive).
      const snapshot = JSON.stringify({ ...payload, total_amount_eur: null });
      let id: number;
      if (created.current && created.current.snapshot === snapshot) {
        id = created.current.id;
      } else {
        id = (await createPurchaseRequest(payload)).id;
        created.current = { id, snapshot };
      }
      await submitPurchaseRequest(id);
      created.current = null;
      notify.success('Talep başarıyla gönderildi!');
      void invalidatePurchaseRequests(queryClient);
      clearPage();
    } catch (error) {
      notify.error(`Talep gönderilirken hata oluştu: ${(error as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------- render

  const comparison = useMemo(() => comparisonData(state), [state]);
  const marks = marksFor?.state === state ? marksFor.marks : undefined;
  const count = planningCount.data ?? 0;

  return (
    <>
      <PageHeader
        title="Satın Alma Talebi Oluştur"
        subtitle="Malzeme ve tedarikçi bilgilerini girin"
        icon="file-invoice"
        backTo="/procurement/purchase-requests/"
        actions={
          <>
            <Button variant="default" leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => void saveDraft()}>
              Taslak Kaydet
            </Button>
            <Button variant="default" leftSection={<FaIcon icon="fas fa-layer-group" />} onClick={() => setDialog({ kind: 'drafts' })}>
              Taslakları Görüntüle
            </Button>
            <Button
              leftSection={<FaIcon icon="fas fa-paper-plane" />}
              loading={submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Gönderiliyor...' : 'Gönder'}
            </Button>
          </>
        }
      />
      {autosave.showIndicator ? (
        <div className={classes.autosave} role="status">
          <Alert color="green" p="xs" withCloseButton={false}>
            Otomatik kaydedildi
          </Alert>
        </div>
      ) : null}
      <Stack gap="lg">
        <Panel title="Talep Detayları" icon="fas fa-edit">
          <Grid>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <TextInput
                ref={titleRef}
                label="Talep Başlığı"
                withAsterisk
                placeholder="Talep başlığını girin"
                value={state.title}
                error={fieldError('title')}
                onChange={(e) => {
                  const title = e.currentTarget.value;
                  update((s) => ({ ...s, title }));
                  setTouched((t) => ({ ...t, title: true }));
                }}
                onBlur={() => setTouched((t) => ({ ...t, title: true }))}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <NativeSelect
                label="Öncelik"
                data={PRIORITY_OPTIONS}
                value={state.priority}
                onChange={(e) => {
                  const priority = e.currentTarget.value;
                  update((s) => ({ ...s, priority }));
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <TextInput
                type="date"
                label="İhtiyaç Tarihi"
                withAsterisk
                value={state.needed_date}
                error={fieldError('needed_date')}
                onChange={(e) => {
                  const needed_date = e.currentTarget.value;
                  update((s) => ({ ...s, needed_date }));
                  setTouched((t) => ({ ...t, needed_date: true }));
                }}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea
                label="Talep Açıklaması"
                rows={3}
                placeholder="Talep açıklamasını girin"
                value={state.description}
                error={fieldError('description')}
                onChange={(e) => {
                  const description = e.currentTarget.value;
                  update((s) => ({ ...s, description }));
                  setTouched((t) => ({ ...t, description: true }));
                }}
              />
            </Grid.Col>
          </Grid>
        </Panel>

        <DataTable
          title="Malzeme Listesi"
          icon="fas fa-boxes"
          toolbar={
            <Group gap="xs">
              <Button
                size="xs"
                variant="outline"
                color="green"
                leftSection={<FaIcon icon="fas fa-clipboard-list" />}
                rightSection={count > 0 ? <Badge color="green" size="sm">{count}</Badge> : null}
                onClick={() => setDialog({ kind: 'planning' })}
              >
                Planlama Talebi Malzemeleri
              </Button>
              <Button size="xs" variant="outline" leftSection={<FaIcon icon="fas fa-upload" />} onClick={() => setDialog({ kind: 'bulk' })}>
                Toplu İçe Aktar
              </Button>
              <Button size="xs" leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setDialog({ kind: 'item' })}>
                Malzeme Ekle
              </Button>
              <Button size="xs" variant="outline" color="green" leftSection={<FaIcon icon="fas fa-object-group" />} onClick={openMerge}>
                Birleştir
              </Button>
              <Button size="xs" variant="outline" color="red" leftSection={<FaIcon icon="fas fa-trash" />} onClick={() => void clearAllItems()}>
                Tüm Malzemeleri Sil
              </Button>
            </Group>
          }
          filters={
            <Text size="sm" c="dimmed">
              <i className="fas fa-info-circle" style={{ marginRight: 4 }} />
              <strong>İpucu:</strong> Malzeme bilgilerini düzenlemek için hücrelere tıklayabilirsiniz.
            </Text>
          }
          data={state.items}
          columns={columns}
          getRowId={(row) => row.id}
          onCellEdit={onCellEdit}
          rowActions={rowActions}
          emptyMessage="Henüz malzeme eklenmemiş."
        />

        <Panel
          title="Tedarikçi Teklifleri"
          icon="fas fa-handshake"
          actions={
            <Group gap="xs">
              <Button size="xs" leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setDialog({ kind: 'supplier', editing: null })}>
                Tedarikçi Ekle
              </Button>
              <Button size="xs" variant="outline" color="red" leftSection={<FaIcon icon="fas fa-trash" />} onClick={() => void clearAllSuppliers()}>
                Tüm Tedarikçileri Sil
              </Button>
            </Group>
          }
        >
          <SupplierCards
            suppliers={state.suppliers}
            offers={state.offers}
            onOffer={(supplier) => setDialog({ kind: 'offer', supplier })}
            onEdit={(supplier) => setDialog({ kind: 'supplier', editing: supplier })}
            onDelete={(supplier) => void deleteSupplier(supplier)}
          />
        </Panel>

        <div ref={comparisonRef}>
          <Card padding="md" radius="md" withBorder>
            <ComparisonTable
              data={comparison}
              columns={['unitPrice', 'deliveryDays', 'originalTotal', 'recommendations']}
              rates={rates}
              showSummary
              rowMarks={marks}
              onRecommendationsChange={(recommendations) => update((s) => ({ ...s, recommendations }))}
            />
          </Card>
        </div>
      </Stack>

      {dialog?.kind === 'item' ? (
        <ItemModal onClose={() => setDialog(null)} onAdd={(item) => update((s) => withItems(s, [...s.items, item]))} />
      ) : null}
      {dialog?.kind === 'bulk' ? (
        <BulkImportModal
          onClose={() => setDialog(null)}
          onImport={(items) => update((s) => withItems(s, [...s.items, ...items]))}
        />
      ) : null}
      {dialog?.kind === 'merge' ? (
        <MergeModal
          items={state.items}
          onClose={() => setDialog(null)}
          onMerge={(merges, summary) => {
            update((s) => applyMerges(s, merges));
            setDialog(null);
            notifyLines.success(summary);
          }}
        />
      ) : null}
      {dialog?.kind === 'supplier' ? (
        <SupplierModal
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSave={(supplier) =>
            update((s) => ({
              ...s,
              suppliers: s.suppliers.some((x) => x.id === supplier.id)
                ? s.suppliers.map((x) => (x.id === supplier.id ? supplier : x))
                : [...s.suppliers, supplier],
            }))
          }
        />
      ) : null}
      {dialog?.kind === 'offer' ? (
        <OfferModal
          supplier={dialog.supplier}
          items={state.items}
          existing={state.offers[dialog.supplier.id]}
          onClose={() => setDialog(null)}
          onSave={(offers) => update((s) => ({ ...s, offers: { ...s.offers, [dialog.supplier.id]: offers } }))}
        />
      ) : null}
      {dialog?.kind === 'drafts' ? (
        <DraftsModal
          openDraftId={state.savedDraft?.id ?? null}
          onClose={() => setDialog(null)}
          onLoad={(id) => void loadDraft(id)}
          onDelete={(id) => void deleteDraft(id)}
        />
      ) : null}
      {dialog?.kind === 'save-draft' && state.savedDraft ? (
        <SaveDraftModal
          existing={state.savedDraft}
          initialName={dialog.payload.title}
          onClose={() => setDialog(null)}
          onSave={(mode, name) => persistDraft(dialog.payload, name, mode === 'overwrite' ? state.savedDraft!.id : undefined)}
        />
      ) : null}
      {dialog?.kind === 'planning' ? (
        <PlanningItemsModal
          pageItems={state.items}
          onClose={() => {
            setDialog(null);
            void planningCount.refetch();
          }}
          onAdd={(items) => update((s) => withItems(s, [...s.items, ...items]))}
          onAttached={() => void planningCount.refetch()}
        />
      ) : null}
    </>
  );
}
