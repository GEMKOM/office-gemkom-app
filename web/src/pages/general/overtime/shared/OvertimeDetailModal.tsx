import {
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  Grid,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import {
  formatOvertimeDuration,
  operationLabel,
  overtimeCostImpactQueryOptions,
  overtimeRequestQueryOptions,
  rejectOvertimeEntries,
  type OvertimeCostImpactJob,
  type OvertimeEntry,
  type OvertimeRequest,
} from '@/api/general/overtime';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
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
import { approveOvertimeWithConfirm, RejectOvertimeModal } from './decisions';
import {
  actionError,
  EntryStatusBadge,
  isOvertimeApprover,
  OvertimeStatusBadge,
  useInvalidateOvertime,
} from './shared';

export interface OvertimeDetailModalProps {
  requestId: string;
  onClose: () => void;
  /** Whether Reddet / Onayla show for a submitted request. */
  canDecide: (request: OvertimeRequest, userId: number) => boolean;
}

function InfoRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <Text size="sm" c="dimmed" fw={500} style={{ flexShrink: 0 }}>
        <FaIcon icon={icon} /> {label}:
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </Group>
  );
}

interface RejectionComment {
  approver: string;
  stage: string;
  comment: string;
  date?: string | null;
}

/** Port of getRejectionComments. */
function rejectionComments(request: OvertimeRequest): RejectionComment[] {
  const out: RejectionComment[] = [];
  for (const stage of request.approval?.stage_instances ?? []) {
    for (const decision of stage.decisions ?? []) {
      if (decision.decision === 'cancelled' && decision.comment) {
        out.push({
          approver: decision.approver_name || decision.approver_username || 'Bilinmeyen',
          stage: stage.name ?? '',
          comment: decision.comment,
          date: decision.decision_date,
        });
      }
    }
  }
  return out;
}

const euro = (value: unknown) =>
  value === null || value === undefined ? null : `€${formatNumber(value as number, 2)}`;
const pct = (value: unknown) =>
  value === null || value === undefined
    ? '-'
    : `%${formatNumber(value as number, { maximumFractionDigits: 1 })}`;
const Dash = () => (
  <Text span c="dimmed" size="sm">
    -
  </Text>
);

function Money({ value, tone }: { value: unknown; tone?: 'profit' | 'cost' }) {
  const text = euro(value);
  if (text === null) return <Dash />;
  const color =
    tone === 'cost'
      ? 'orange.8'
      : tone === 'profit'
        ? Number(value) < 0
          ? 'red.8'
          : 'green.8'
        : undefined;
  return (
    <Text span size="sm" c={color}>
      {text}
    </Text>
  );
}

const DERIVED_PRICE: Record<string, { icon: string; label: string }> = {
  allocated_from_parent: { icon: 'fas fa-turn-down', label: 'ağırlığa göre dağıtıldı' },
  rolled_up_from_children: { icon: 'fas fa-turn-up', label: 'alt işlerin toplamı' },
};

/** Port of formatDerivedPrice / describeDerivedPrice (apis/formatters.js). */
function DerivedPrice({ job }: { job: OvertimeCostImpactJob }) {
  const meta = DERIVED_PRICE[job.selling_price_source ?? ''];
  if (!meta) return <Dash />;
  const basis = job.selling_price_derived_basis;
  const kg = (v: unknown) => `${formatNumber((v as number) || 0, { maximumFractionDigits: 2 })} kg`;
  let title = '';
  if (job.selling_price_source === 'allocated_from_parent' && basis) {
    title =
      'Bu iş emrinin kendi satış fiyatı girilmemiş. ' +
      `${basis.from_job_no} iş emrinin ${euro(basis.from_amount_eur || 0)} tutarından ` +
      `ağırlık oranına göre hesaplandı (${kg(basis.weight_kg)} / ${kg(basis.total_weight_kg)}).`;
  } else if (job.selling_price_source === 'rolled_up_from_children') {
    title =
      'Bu iş emrinin kendi satış fiyatı girilmemiş. Alt iş emirlerinde girili satış fiyatlarının toplamı gösteriliyor.';
  }
  const content = (
    <Text span size="sm" fs="italic" c="dimmed">
      <FaIcon icon={meta.icon} /> ≈{euro(job.current_selling_price_eur || 0)}
    </Text>
  );
  return title ? (
    <Tooltip label={title} multiline w={320} withArrow>
      {content}
    </Tooltip>
  ) : (
    content
  );
}

/** Termin: past target dates in red, as legacy flagged them for the approver. */
function Termin({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <Dash />;
  const label = formatDate(new Date(iso));
  const today = new Date().toISOString().slice(0, 10);
  if (iso < today) {
    return (
      <Text span size="sm" c="red.8" title="Termin tarihi geçti">
        <FaIcon icon="fas fa-exclamation-circle" /> {label}
      </Text>
    );
  }
  return <>{label}</>;
}

/** Port of appendCostImpactSection; nothing when the user may not see costs (403) or on error. */
function CostImpactSection({ requestId }: { requestId: number }) {
  const impact = useQuery(overtimeCostImpactQueryOptions(requestId));
  const jobs = impact.data?.jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  return (
    <ModalSection title="Maliyet / Kâr Etkisi" icon="fas fa-coins">
      <Alert color="yellow" variant="light" py="xs" mb="sm">
        <Group justify="space-between">
          <span>
            <FaIcon icon="fas fa-hourglass-half" /> Toplam Mesai Maliyeti
          </span>
          <Text fw={700} size="lg">
            {euro(impact.data?.total_overtime_cost_eur) ?? '-'}
          </Text>
        </Group>
      </Alert>
      <Table.ScrollContainer minWidth={760}>
        <Table withTableBorder withColumnBorders verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>İş Emri</Table.Th>
              <Table.Th>Müşteri</Table.Th>
              <Table.Th>Termin</Table.Th>
              <Table.Th ta="right">Mevcut Kâr</Table.Th>
              <Table.Th ta="right">Mesai Sonrası Kâr</Table.Th>
              <Table.Th ta="right">Mesai Maliyeti</Table.Th>
              <Table.Th ta="right">Satış Fiyatı</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {jobs.map((job, index) =>
              job.job_order_found ? (
                <Table.Tr key={`${job.job_no}-${index}`}>
                  <Table.Td>
                    <b>{job.job_no}</b>
                    {job.title ? (
                      <Text size="xs" c="dimmed">
                        {job.title}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    {job.customer_name ? (
                      <>
                        {job.customer_name}
                        {job.customer_code ? (
                          <Text size="xs" c="dimmed">
                            {job.customer_code}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Dash />
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Termin iso={job.target_completion_date} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money value={job.current_profit_eur} tone="profit" />
                    <Text size="xs" c="dimmed">
                      {pct(job.current_margin_pct)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money value={job.projected_profit_eur} tone="profit" />
                    <Text size="xs" c="dimmed">
                      {pct(job.projected_margin_pct)}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Money value={job.overtime_cost_eur} tone="cost" />
                  </Table.Td>
                  <Table.Td ta="right">
                    {job.selling_price_is_derived ? (
                      <DerivedPrice job={job} />
                    ) : (
                      <Money value={job.current_selling_price_eur} />
                    )}
                  </Table.Td>
                </Table.Tr>
              ) : (
                <Table.Tr key={`${job.job_no}-${index}`}>
                  <Table.Td>
                    <b>{job.job_no || '-'}</b>
                    <div>
                      <Badge color="gray" size="sm">
                        İş emri bulunamadı
                      </Badge>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <Dash />
                  </Table.Td>
                  <Table.Td>
                    <Dash />
                  </Table.Td>
                  <Table.Td ta="right">-</Table.Td>
                  <Table.Td ta="right">-</Table.Td>
                  <Table.Td ta="right">
                    <Money value={job.overtime_cost_eur} tone="cost" />
                  </Table.Td>
                  <Table.Td ta="right">-</Table.Td>
                </Table.Tr>
              ),
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </ModalSection>
  );
}

function entryName(entry: OvertimeEntry): string {
  return entry.user_full_name || entry.user_username || entry.username || '-';
}

/**
 * Port of showOvertimeDetailsModal (pending/modals.js): request details,
 * rejection reasons, participants (untick to reject on approve, or tick to
 * retract from an approved request), cost impact, and the decision buttons.
 */
export function OvertimeDetailModal({ requestId, onClose, canDecide }: OvertimeDetailModalProps) {
  const { user } = useAuth();
  const invalidate = useInvalidateOvertime();
  const query = useQuery(overtimeRequestQueryOptions(requestId));
  const request = query.data;

  // Entries un-ticked (to reject) while deciding, and entries ticked to retract.
  const [unticked, setUnticked] = useState<Set<number>>(() => new Set());
  const [retract, setRetract] = useState<Set<number>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!query.isError) return;
    notify.error('Mesai talebi detayları yüklenirken hata oluştu.');
    onClose();
  }, [query.isError, onClose]);

  const isSubmitted = request?.status === 'submitted';
  const decidable = Boolean(request && isSubmitted && canDecide(request, user.id));
  const canRetract = Boolean(
    request && request.status === 'approved' && isOvertimeApprover(request, user.id),
  );

  const entries = request?.entries ?? [];
  const activeEntries = entries.filter((e) => e.status !== 'rejected');
  const rejectedCount = entries.length - activeEntries.length;
  const comments = request ? rejectionComments(request) : [];

  const toggle = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const approve = async () => {
    if (!request) return;
    // Only pending entries get a box; entries rejected at an earlier stage never do.
    const rejectedIds = activeEntries.filter((e) => unticked.has(e.id)).map((e) => e.id);
    if (activeEntries.length > 0 && rejectedIds.length === activeEntries.length) {
      notify.warning('Tüm kalemleri reddediyorsunuz. Bunun yerine "Reddet" kullanın.');
      return;
    }
    setBusy(true);
    const approved = await approveOvertimeWithConfirm(request, rejectedIds, invalidate);
    setBusy(false);
    if (approved) onClose();
  };

  const retractSelected = async () => {
    if (!request) return;
    const ids = activeEntries.filter((e) => retract.has(e.id)).map((e) => e.id);
    if (ids.length === 0) {
      notify.warning('Lütfen reddetmek istediğiniz en az bir kişi seçin.');
      return;
    }
    const ok = await confirm({
      message: `${ids.length} kişiyi onaylı mesaiden çıkarmak istediğinize emin misiniz?`,
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await rejectOvertimeEntries(request.id, ids);
      notify.success(`${res?.rejected_count ?? ids.length} kişi mesaiden çıkarıldı.`);
      await invalidate();
      onClose();
    } catch (error) {
      setBusy(false);
      notify.error(
        `Kişi reddedilirken hata oluştu: ${actionError(error, 'Kişi reddetme işlemi başarısız')}`,
      );
    }
  };

  let checkHeader = 'Durum';
  if (decidable) checkHeader = 'Onay';
  else if (canRetract) checkHeader = 'Reddet';

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        size="xl"
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader
          title="Mesai Talebi Detayları"
          subtitle={request ? `#${request.id}` : undefined}
          icon="fas fa-clock"
        />
        <ModalBody>
          {!request ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : (
            <>
              <ModalSection>
                <Grid gap="lg">
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Text fw={600} mb="xs">
                      <FaIcon icon="fas fa-info-circle" /> Genel Bilgiler
                    </Text>
                    <Stack gap={6}>
                      <InfoRow icon="fas fa-hashtag" label="Talep No">
                        #{request.id}
                      </InfoRow>
                      <InfoRow icon="fas fa-user" label="Talep Eden">
                        {request.requester_username || '-'}
                      </InfoRow>
                      <InfoRow icon="fas fa-building" label="Departman">
                        {request.team_label || request.team || '-'}
                      </InfoRow>
                      <InfoRow icon="fas fa-info" label="Durum">
                        <OvertimeStatusBadge row={request} />
                      </InfoRow>
                      <InfoRow icon="fas fa-calendar-plus" label="Oluşturulma">
                        {formatDateTime(request.created_at)}
                      </InfoRow>
                      <InfoRow icon="fas fa-calendar-check" label="Son Güncelleme">
                        {formatDateTime(request.updated_at)}
                      </InfoRow>
                    </Stack>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Text fw={600} mb="xs">
                      <FaIcon icon="fas fa-clock" /> Mesai Bilgileri
                    </Text>
                    <Stack gap={6}>
                      <InfoRow icon="fas fa-play" label="Başlangıç">
                        {formatDateTime(request.start_at)}
                      </InfoRow>
                      <InfoRow icon="fas fa-stop" label="Bitiş">
                        {formatDateTime(request.end_at)}
                      </InfoRow>
                      <InfoRow icon="fas fa-hourglass-half" label="Süre">
                        <b>{formatOvertimeDuration(request.duration_hours)}</b>
                      </InfoRow>
                      <InfoRow icon="fas fa-users" label="Katılımcı Sayısı">
                        {activeEntries.length} kişi
                        {rejectedCount > 0 ? (
                          <Text span size="xs" c="dimmed">
                            {' '}
                            ({rejectedCount} kişi reddedildi)
                          </Text>
                        ) : null}
                      </InfoRow>
                      <InfoRow icon="fas fa-question-circle" label="Neden">
                        {request.reason || 'Belirtilmemiş'}
                      </InfoRow>
                    </Stack>
                  </Grid.Col>
                </Grid>
              </ModalSection>

              {comments.length > 0 ? (
                <ModalSection title="Reddetme Gerekçeleri" icon="fas fa-times-circle">
                  <Stack gap="sm">
                    {comments.map((comment, index) => (
                      <div key={index}>
                        <Text size="xs" c="dimmed" fw={500}>
                          <FaIcon icon="fas fa-comment-alt" /> {comment.approver} - {comment.stage}
                        </Text>
                        <Text size="sm">{comment.comment}</Text>
                        <Text size="xs" c="dimmed">
                          Tarih: {comment.date ? formatDateTime(comment.date) : '-'}
                        </Text>
                      </div>
                    ))}
                  </Stack>
                </ModalSection>
              ) : null}

              {entries.length > 0 ? (
                <ModalSection title="Katılımcılar" icon="fas fa-users">
                  {decidable ? (
                    <Text size="xs" c="dimmed" mb="xs">
                      <FaIcon icon="fas fa-info-circle" /> İşaretli kalemler onaylanır. İşareti
                      kaldırılan kalemler <b>reddedilir</b> (kısmi onay).
                    </Text>
                  ) : canRetract ? (
                    <Text size="xs" c="dimmed" mb="xs">
                      <FaIcon icon="fas fa-info-circle" /> İşaretlediğiniz kişiler onaylı mesaiden{' '}
                      <b>çıkarılır</b> (reddedilir).
                    </Text>
                  ) : null}
                  <Table.ScrollContainer minWidth={640}>
                    <Table striped verticalSpacing="xs" fz="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>#</Table.Th>
                          <Table.Th>Katılımcı</Table.Th>
                          <Table.Th>İş No</Table.Th>
                          <Table.Th>Operasyonlar</Table.Th>
                          <Table.Th>Neden</Table.Th>
                          <Table.Th w={decidable || canRetract ? 70 : undefined}>
                            {checkHeader}
                          </Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {entries.map((entry, index) => {
                          const isRejected = entry.status === 'rejected';
                          const name = entryName(entry);
                          // Rejected first: a submitted request can already hold entries an
                          // earlier stage rejected, and those never get a box.
                          let lastCell: ReactNode;
                          if (isRejected || (!decidable && !canRetract)) {
                            lastCell = (
                              <EntryStatusBadge status={entry.status} label={entry.status_label} />
                            );
                          } else if (decidable) {
                            lastCell = (
                              <Checkbox
                                aria-label={`${name} onayla`}
                                checked={!unticked.has(entry.id)}
                                onChange={() => setUnticked((s) => toggle(s, entry.id))}
                              />
                            );
                          } else {
                            lastCell = (
                              <Checkbox
                                aria-label={`${name} reddet`}
                                checked={retract.has(entry.id)}
                                onChange={() => setRetract((s) => toggle(s, entry.id))}
                              />
                            );
                          }
                          return (
                            <Table.Tr key={entry.id ?? index} c={isRejected ? 'dimmed' : undefined}>
                              <Table.Td>{index + 1}</Table.Td>
                              <Table.Td>{isRejected ? <s>{name}</s> : <b>{name}</b>}</Table.Td>
                              <Table.Td>{entry.job_no || '-'}</Table.Td>
                              <Table.Td>
                                {entry.operations?.length ? (
                                  <Group gap={4}>
                                    {entry.operations.map((op) => (
                                      <Badge key={op.key} variant="default" size="sm" tt="none">
                                        {operationLabel(op)}
                                      </Badge>
                                    ))}
                                  </Group>
                                ) : (
                                  <Dash />
                                )}
                              </Table.Td>
                              <Table.Td>{entry.description || 'Belirtilmemiş'}</Table.Td>
                              <Table.Td>{lastCell}</Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </ModalSection>
              ) : null}

              <CostImpactSection requestId={request.id} />
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
            Kapat
          </Button>
          {decidable ? (
            <>
              <Button
                color="red.9"
                variant="outline"
                miw={120}
                disabled={busy}
                onClick={() => setRejecting(true)}
                leftSection={<FaIcon icon="fas fa-times" />}
              >
                Reddet
              </Button>
              <Button
                color="green.8"
                miw={120}
                loading={busy}
                onClick={() => void approve()}
                leftSection={<FaIcon icon="fas fa-check" />}
              >
                Onayla
              </Button>
            </>
          ) : canRetract ? (
            <Button
              color="red.9"
              miw={160}
              loading={busy}
              onClick={() => void retractSelected()}
              leftSection={<FaIcon icon="fas fa-user-minus" />}
            >
              Seçili Kişileri Reddet
            </Button>
          ) : null}
        </ModalFooter>
      </Modal>

      {rejecting && request ? (
        <RejectOvertimeModal
          request={request}
          invalidate={invalidate}
          onClose={() => setRejecting(false)}
          onRejected={() => {
            setRejecting(false);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
