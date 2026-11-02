import { Button, Center, Grid, Group, Loader, Modal, Table, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import {
  deleteStatementAdjustment,
  markStatementPaid,
  patchStatement,
  refreshStatement,
  statementAdjustmentsQueryOptions,
  statementKeys,
  statementQueryOptions,
  submitStatement,
  type Statement,
} from '@/api/subcontracting/statements';
import { useAuth } from '@/auth/AuthProvider';
import {
  confirm,
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
} from '@/ui';
import { AdjustmentFormModal, DecideStatementModal } from './StatementFormModals';
import {
  adjustmentsTotal,
  adjustmentTypeLabel,
  money,
  periodText,
  StatementStatusBadge,
  statementErrorMessage,
} from './statementShared';

const VAT_RATE = 0.2;
const KG_3 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** May the user approve / reject: an approver of the workflow's current stage. */
export function canDecideStatement(
  statement: Statement,
  userId: number | null | undefined,
): boolean {
  const wf = statement.approval_workflow;
  const stages = Array.isArray(wf?.stage_instances) ? wf.stage_instances : [];
  const current = stages.find((s) => s?.order === wf?.current_stage_order);
  const approverIds = Array.isArray(current?.approver_user_ids) ? current.approver_user_ids : [];
  return Boolean(userId && approverIds.includes(userId));
}

function InfoField({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={600}>
        <FaIcon icon={icon} /> {label}
      </Text>
      <Text size="sm" component="div" mt={2}>
        {children}
      </Text>
    </div>
  );
}

/** Legacy showConfirmation defaults: "Onay", Evet / İptal, red confirm. */
const ask = (message: string) =>
  confirm({ title: 'Onay', message, confirmLabel: 'Evet', cancelLabel: 'İptal', danger: true });

/**
 * Port of viewStatementDetail + setupStatementDetailActions: the statement,
 * its line items, adjustments and totals, and the status actions.
 */
export function StatementDetailModal({
  statementId,
  onClose,
}: {
  statementId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const detail = useQuery(statementQueryOptions(statementId));
  const adjustmentsQuery = useQuery(statementAdjustmentsQueryOptions(statementId));
  const statement = detail.data;
  const adjustments = adjustmentsQuery.data ?? [];

  const [busy, setBusy] = useState(false);
  const [addingAdjustment, setAddingAdjustment] = useState(false);
  const [deciding, setDeciding] = useState<boolean | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!detail.isError && !adjustmentsQuery.isError) return;
    notify.error('Hakediş detayları yüklenirken hata oluştu');
    onClose();
  }, [detail.isError, adjustmentsQuery.isError, onClose]);

  const reloadDetail = () =>
    queryClient.invalidateQueries({ queryKey: statementKeys.detail(statementId) });
  const reloadList = () => queryClient.invalidateQueries({ queryKey: statementKeys.lists() });

  /** Runs an action; the detail and the list reload after it. */
  const run = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setBusy(true);
    try {
      await action();
      notify.success(success);
      await Promise.all([reloadDetail(), reloadList()]);
    } catch (error) {
      notify.error(statementErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  const saveEmployeeCount = async () => {
    if (!statement) return;
    const raw = `${employeeDraft ?? statement.employee_count ?? ''}`.trim();
    if (raw === '') {
      notify.error('Çalışan sayısı boş olamaz');
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      notify.error('Çalışan sayısı 0 veya daha büyük tam sayı olmalıdır');
      return;
    }
    await run(
      () => patchStatement(statement.id, { employee_count: n }),
      'Çalışan sayısı güncellendi',
      'Çalışan sayısı güncellenirken hata oluştu',
    );
    setEmployeeDraft(null);
  };

  const deleteAdjustment = async (adjustmentId: number) => {
    if (!(await ask('Düzeltmeyi silmek istediğinizden emin misiniz?'))) return;
    await run(
      () => deleteStatementAdjustment(statementId, adjustmentId),
      'Düzeltme silindi',
      'Düzeltme silinirken hata oluştu',
    );
  };

  const refresh = async () => {
    const ok = await ask(
      'Mevcut kalemler silinip güncel verilerden yeniden oluşturulacak. Düzeltmeler korunacaktır. Devam edilsin mi?',
    );
    if (!ok) return;
    await run(
      () => refreshStatement(statementId),
      'Hakediş yenilendi',
      'Hakediş yenilenirken hata oluştu',
    );
  };

  const submit = () =>
    run(
      () => submitStatement(statementId),
      'Hakediş onaya gönderildi',
      'Hakediş onaya gönderilirken hata oluştu',
    );

  const markPaid = async () => {
    if (!(await ask('Hakedişi ödendi olarak işaretlemek istediğinizden emin misiniz?'))) return;
    await run(
      () => markStatementPaid(statementId),
      'Hakediş ödendi olarak işaretlendi',
      'Hakediş işaretlenirken hata oluştu',
    );
  };

  let body: ReactNode;
  let footer: ReactNode = null;
  if (!statement || adjustmentsQuery.isPending) {
    body = (
      <Center py="xl">
        <Loader />
      </Center>
    );
  } else {
    const currency = statement.currency;
    const status = String(statement.status);
    const editable = status === 'draft' || status === 'rejected';
    const adjTotal = adjustmentsTotal(adjustments);
    const paint = statement.paint_input ?? null;
    const paintKgRaw = Number.parseFloat(String(paint?.total_kg));
    const paintCostRaw = Number.parseFloat(String(paint?.total_cost));
    const paintKg = Number.isFinite(paintKgRaw) ? paintKgRaw : 0;
    const paintCost = Number.isFinite(paintCostRaw) ? paintCostRaw : 0;
    const hasPaint = Boolean(paint && (paintKg !== 0 || paintCost !== 0));
    const lineItems = Array.isArray(statement.line_items) ? statement.line_items : [];
    const workTotal = Number.parseFloat(String(statement.work_total)) || 0;
    const subtotal = workTotal + adjTotal + (hasPaint ? paintCost : 0);
    const vat = subtotal * VAT_RATE;

    body = (
      <>
        <ModalSection title="Hakediş Bilgileri" icon="fas fa-info-circle">
          <Grid gap="md">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <InfoField icon="fas fa-building" label="Taşeron">
                {statement.subcontractor_name || '-'}
              </InfoField>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <InfoField icon="fas fa-calendar" label="Dönem">
                {statement.year && statement.month
                  ? periodText(statement.year, statement.month)
                  : '-'}
              </InfoField>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <InfoField icon="fas fa-info-circle" label="Durum">
                <StatementStatusBadge status={status} />
              </InfoField>
            </Grid.Col>
          </Grid>
          <Group gap="sm" align="flex-end" mt="md">
            <TextInput
              w={220}
              type="number"
              min={0}
              step={1}
              label={
                <>
                  <FaIcon icon="fas fa-users" /> Çalışan Sayısı
                </>
              }
              value={
                employeeDraft ??
                (statement.employee_count === null || statement.employee_count === undefined
                  ? ''
                  : String(statement.employee_count))
              }
              onChange={(event) => setEmployeeDraft(event.currentTarget.value)}
            />
            <Button
              leftSection={<FaIcon icon="fas fa-save" />}
              onClick={() => void saveEmployeeCount()}
              disabled={busy}
            >
              Kaydet
            </Button>
          </Group>
        </ModalSection>

        <ModalSection title="İş Kalemleri" icon="fas fa-list">
          <Table.ScrollContainer minWidth={900}>
            <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>İş Emri</Table.Th>
                  <Table.Th>Kademe</Table.Th>
                  <Table.Th>Ayrılan</Table.Th>
                  <Table.Th>Önceki %</Table.Th>
                  <Table.Th>Mevcut %</Table.Th>
                  <Table.Th>Delta %</Table.Th>
                  <Table.Th>Eff. Ağırlık</Table.Th>
                  <Table.Th>Fiyat/kg</Table.Th>
                  <Table.Th>Tutar</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lineItems.map((item, index) => (
                  <Table.Tr key={item.id ?? index}>
                    <Table.Td>
                      <strong>{item.job_no || '-'}</strong>
                      {item.job_title ? (
                        <Text size="xs" c="dimmed">
                          {item.job_title}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>{item.price_tier_name || '-'}</Table.Td>
                    <Table.Td>{String(item.allocated_weight_kg || 0)} kg</Table.Td>
                    <Table.Td>{String(item.previous_progress || 0)}%</Table.Td>
                    <Table.Td>{String(item.current_progress || 0)}%</Table.Td>
                    <Table.Td>{String(item.delta_progress || 0)}%</Table.Td>
                    <Table.Td>{String(item.effective_weight_kg || 0)} kg</Table.Td>
                    <Table.Td>{money(item.price_per_kg, currency)}</Table.Td>
                    <Table.Td>
                      <strong>{money(item.cost_amount, currency)}</strong>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {lineItems.length === 0 && !hasPaint ? (
                  <Table.Tr>
                    <Table.Td colSpan={9} ta="center" c="dimmed">
                      Kalem bulunmamaktadır
                    </Table.Td>
                  </Table.Tr>
                ) : null}
                {hasPaint ? (
                  <Table.Tr>
                    <Table.Td>
                      <strong>Boya</strong>
                    </Table.Td>
                    <Table.Td>-</Table.Td>
                    <Table.Td>-</Table.Td>
                    <Table.Td>-</Table.Td>
                    <Table.Td>-</Table.Td>
                    <Table.Td>-</Table.Td>
                    <Table.Td>{KG_3.format(paintKg)} kg</Table.Td>
                    <Table.Td>{paintKg > 0 ? money(paintCost / paintKg, currency) : '-'}</Table.Td>
                    <Table.Td>
                      <strong>{money(paintCost, currency)}</strong>
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td colSpan={8} ta="right">
                    <strong>İş Toplamı:</strong>
                  </Table.Td>
                  <Table.Td>
                    <strong>{money(statement.work_total, currency)}</strong>
                  </Table.Td>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        </ModalSection>

        <ModalSection title="Düzeltmeler" icon="fas fa-edit">
          {editable ? (
            <Group justify="flex-end" mb="xs">
              <Button
                size="xs"
                leftSection={<FaIcon icon="fas fa-plus" />}
                onClick={() => setAddingAdjustment(true)}
              >
                Düzeltme Ekle
              </Button>
            </Group>
          ) : null}
          <Table.ScrollContainer minWidth={700}>
            <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>İş Emri</Table.Th>
                  <Table.Th>Tür</Table.Th>
                  <Table.Th>Neden</Table.Th>
                  <Table.Th>Ağırlık</Table.Th>
                  <Table.Th ta="right">Fiyat/kg</Table.Th>
                  <Table.Th ta="right">Tutar</Table.Th>
                  {editable ? <Table.Th>İşlem</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {adjustments.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={editable ? 7 : 6} ta="center" c="dimmed">
                      Düzeltme bulunmamaktadır
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  adjustments.map((adj) => {
                    const w = Number.parseFloat(String(adj.weight_kg));
                    const a = Number.parseFloat(String(adj.amount));
                    return (
                      <Table.Tr key={adj.id}>
                        <Table.Td>
                          <strong>{adj.job_order || '-'}</strong>
                        </Table.Td>
                        <Table.Td>{adjustmentTypeLabel(adj.adjustment_type)}</Table.Td>
                        <Table.Td>{adj.reason || '-'}</Table.Td>
                        <Table.Td>{String(adj.weight_kg ?? 0)} kg</Table.Td>
                        <Table.Td ta="right">
                          {Number.isFinite(w) && w > 0 && Number.isFinite(a)
                            ? money(a / w, currency)
                            : '-'}
                        </Table.Td>
                        <Table.Td ta="right">
                          <strong>{money(adj.amount, currency)}</strong>
                        </Table.Td>
                        {editable ? (
                          <Table.Td>
                            <Button
                              size="compact-xs"
                              variant="outline"
                              color="red"
                              aria-label="Düzeltmeyi sil"
                              disabled={busy}
                              onClick={() => void deleteAdjustment(adj.id)}
                            >
                              <FaIcon icon="fas fa-trash" />
                            </Button>
                          </Table.Td>
                        ) : null}
                      </Table.Tr>
                    );
                  })
                )}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td colSpan={editable ? 6 : 5} ta="right">
                    <strong>Düzeltmeler Toplamı:</strong>
                  </Table.Td>
                  <Table.Td>
                    <strong>{money(adjTotal, currency)}</strong>
                  </Table.Td>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        </ModalSection>

        <ModalSection>
          <Group justify="flex-end">
            <Table
              w={{ base: '100%', md: '50%' }}
              verticalSpacing={4}
              fz="sm"
              data-testid="statement-totals"
            >
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>
                    <strong>İş Toplamı:</strong>
                  </Table.Td>
                  <Table.Td ta="right">{money(workTotal, currency)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <strong>Düzeltmeler:</strong>
                  </Table.Td>
                  <Table.Td ta="right">{money(adjTotal, currency)}</Table.Td>
                </Table.Tr>
                {hasPaint ? (
                  <Table.Tr>
                    <Table.Td>
                      <strong>Boya Maliyeti:</strong>
                    </Table.Td>
                    <Table.Td ta="right">{money(paintCost, currency)}</Table.Td>
                  </Table.Tr>
                ) : null}
                <Table.Tr>
                  <Table.Td>
                    <strong>Ara Toplam:</strong>
                  </Table.Td>
                  <Table.Td ta="right">{money(subtotal, currency)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <strong>KDV (%20):</strong>
                  </Table.Td>
                  <Table.Td ta="right">{money(vat, currency)}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td>
                    <strong>Genel Toplam (KDV Dahil):</strong>
                  </Table.Td>
                  <Table.Td ta="right">
                    <strong>{money(subtotal + vat, currency)}</strong>
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Group>
        </ModalSection>
      </>
    );

    if (editable) {
      footer = (
        <>
          <Button
            size="sm"
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync" />}
            onClick={() => void refresh()}
            disabled={busy}
          >
            Yenile
          </Button>
          <Button
            size="sm"
            color="green"
            leftSection={<FaIcon icon="fas fa-paper-plane" />}
            onClick={() => void submit()}
            loading={busy}
          >
            Onaya Gönder
          </Button>
        </>
      );
    } else if (status === 'submitted') {
      footer = canDecideStatement(statement, user?.id) ? (
        <>
          <Button
            color="red"
            leftSection={<FaIcon icon="fas fa-times" />}
            onClick={() => setDeciding(false)}
          >
            Reddet
          </Button>
          <Button
            color="green"
            leftSection={<FaIcon icon="fas fa-check" />}
            onClick={() => setDeciding(true)}
          >
            Onayla
          </Button>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Bu hakedişi onaylamak/reddetmek için yetkiniz yok.
        </Text>
      );
    } else if (status === 'approved') {
      footer = (
        <Button
          color="cyan"
          leftSection={<FaIcon icon="fas fa-money-check-alt" />}
          onClick={() => void markPaid()}
          loading={busy}
        >
          Ödendi olarak işaretle
        </Button>
      );
    }
  }

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        fullScreen
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader
          title={`Hakediş Detayı - ${statement?.subcontractor_name || ''}`}
          icon="fas fa-file-invoice-dollar"
        />
        <ModalBody>{body}</ModalBody>
        {footer ? <ModalFooter>{footer}</ModalFooter> : null}
      </Modal>

      {addingAdjustment ? (
        <AdjustmentFormModal
          statementId={statementId}
          onClose={() => setAddingAdjustment(false)}
          onSaved={() => void Promise.all([reloadDetail(), reloadList()])}
        />
      ) : null}

      {deciding !== null ? (
        <DecideStatementModal
          statementId={statementId}
          approve={deciding}
          onClose={() => setDeciding(null)}
          onDecided={() => {
            // Legacy hides every modal after a decision and reloads the list.
            setDeciding(null);
            void reloadList();
            void queryClient.invalidateQueries({ queryKey: statementKeys.detail(statementId) });
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
