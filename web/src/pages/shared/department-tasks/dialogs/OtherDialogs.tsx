import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Checkbox,
  CopyButton,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { markPlanningRequestItemDelivered } from '@/api/planning/planningItems';
import {
  completeDepartmentTask,
  createDepartmentTask,
  departmentChoicesQueryOptions,
  departmentTaskQueryOptions,
  type DepartmentTask,
} from '@/api/projects/departmentTasks';
import {
  priceTiersQueryOptions,
  updateAssignmentWithEndpoint,
  type SubcontractingAssignment,
} from '@/api/subcontracting/assignments';
import { subcontractorsQueryOptions } from '@/api/subcontracting/subcontractors';
import {
  updateInternalTeamAssignmentWithEndpoint,
  type InternalTeamAssignment,
} from '@/api/welding/internalTeamAssignments';
import { weldingTeamsQueryOptions } from '@/api/welding/teams';
import {
  downloadFilesAsZip,
  FaIcon,
  FileDropInput,
  FileAttachments,
  FormModal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalSection,
  modalClassNames,
  notify,
  SelectRemote,
  type RemoteOption,
} from '@/ui';
import { apiFetch } from '@/api/client';
import { extractResults } from '@/api/types';
import { useDepartmentTasks } from '../context';
import classes from '../DepartmentTasks.module.css';
import {
  fmtQty,
  legacyErrorText,
  parseCsv,
  qcReviewsFromSheet,
  toNumericId,
  type QcReviewDraft,
} from '../logic';
import { teamAssignmentStatus, tierLabel } from '../tabs/AssignmentTabs';
import { siblingStatusColor, toAttachment } from '../tabs/ConsultationTab';

interface Props {
  onClose: () => void;
}

/** A dialog whose data failed to load: say so and close (legacy never opened it). */
function useCloseOnError(failed: boolean, message: string, onClose: () => void) {
  useEffect(() => {
    if (failed) {
      notify.error(message);
      onClose();
    }
  }, [failed, message, onClose]);
}

async function searchJobOrders(term: string, signal: AbortSignal): Promise<RemoteOption[]> {
  const data = await apiFetch<unknown>('/projects/job-orders/', {
    params: {
      search: term.trim(),
      page_size: 30,
      ordering: '-created_at',
      status__in: 'active,draft,on_hold',
    },
    signal,
  });
  return extractResults<{ job_no: string; title?: string }>(data).map((job) => ({
    value: job.job_no,
    label: [job.job_no, job.title].filter(Boolean).join(' - '),
  }));
}

// ---- Yeni Görev (design) ----

/** Legacy showCreateTaskModal + createTaskModal save. */
export function CreateTaskDialog({ onClose }: Props) {
  const { config, users, reloadList } = useDepartmentTasks();
  const [v, setV] = useState({
    job_order: '',
    assigned_to: '',
    title: '',
    description: '',
    target_start_date: '',
    target_completion_date: '',
    estimated_duration_wd: '' as number | string,
    weight: 10 as number | string,
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof v, value: unknown) => setV((p) => ({ ...p, [key]: value }));

  const save = async () => {
    const title = v.title.trim();
    if (!title) return void notify.error('Başlık zorunludur');
    // A department may raise standalone work: the job order is optional.
    const data: Record<string, unknown> = { department: config.department, title };
    if (v.job_order) data.job_order = v.job_order;
    if (v.description.trim()) data.description = v.description.trim();
    if (v.assigned_to) data.assigned_to = Number.parseInt(v.assigned_to, 10);
    if (v.target_start_date) data.target_start_date = v.target_start_date;
    if (v.target_completion_date) data.target_completion_date = v.target_completion_date;
    if (v.estimated_duration_wd !== '' && Number.isFinite(Number(v.estimated_duration_wd))) {
      data.estimated_duration_wd = Number(v.estimated_duration_wd);
    }
    if (v.weight !== '' && Number.isFinite(Number.parseInt(String(v.weight), 10))) {
      data.weight = Number.parseInt(String(v.weight), 10);
    }
    setBusy(true);
    try {
      await createDepartmentTask(data);
      notify.success('Görev oluşturuldu');
      onClose();
      await reloadList();
    } catch (error) {
      notify.error(legacyErrorText(error, 'Görev oluşturulurken hata oluştu'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yeni Görev Oluştur"
      icon="fas fa-plus"
      submitLabel="Oluştur"
      onSubmit={() => void save()}
      submitting={busy}
    >
      <ModalSection title="Görev Bilgileri" icon="fas fa-info-circle">
        <Stack gap="sm">
          <SimpleGrid cols={2}>
            <SelectRemote
              label="İş Emri"
              placeholder="İş emri ara (en az 2 karakter)"
              description="İsteğe bağlı — boş bırakılırsa görev bir iş emrine bağlanmaz"
              minSearchLength={2}
              queryKey={['departmentTasks', 'jobOrderSearch']}
              search={searchJobOrders}
              value={v.job_order || null}
              onChange={(value) => set('job_order', value ?? '')}
            />
            <Select
              label="Atanan Kişi"
              placeholder="Kişi seçin..."
              description="İsteğe bağlı"
              searchable
              data={[
                { value: '', label: 'Atanmamış' },
                ...users.map((u) => ({ value: String(u.id), label: u.name || u.username })),
              ]}
              value={v.assigned_to}
              onChange={(x) => set('assigned_to', x ?? '')}
            />
          </SimpleGrid>
          <TextInput
            label="Başlık"
            withAsterisk
            placeholder="Görev başlığını girin"
            description="Görev başlığı"
            value={v.title}
            onChange={(e) => set('title', e.currentTarget.value)}
          />
          <Textarea
            label="Açıklama"
            placeholder="Görev açıklaması"
            description="İsteğe bağlı açıklama"
            value={v.description}
            onChange={(e) => set('description', e.currentTarget.value)}
          />
        </Stack>
      </ModalSection>
      <ModalSection title="Planlama" icon="fas fa-calendar">
        <SimpleGrid cols={2}>
          <TextInput
            type="date"
            label="Hedef Başlangıç Tarihi"
            description="İsteğe bağlı"
            value={v.target_start_date}
            onChange={(e) => set('target_start_date', e.currentTarget.value)}
          />
          <TextInput
            type="date"
            label="Hedef Bitiş Tarihi"
            description="İsteğe bağlı"
            value={v.target_completion_date}
            onChange={(e) => set('target_completion_date', e.currentTarget.value)}
          />
          <NumberInput
            label="Tahmini Süre (iş günü)"
            min={0.5}
            step={0.5}
            decimalSeparator=","
            description="Kaç iş günü sürecek — üretim planı öngörüsünü besler"
            value={v.estimated_duration_wd}
            onChange={(x) => set('estimated_duration_wd', x)}
          />
          <NumberInput
            label="Ağırlık"
            min={1}
            step={1}
            allowDecimal={false}
            description="İş emri ilerleme hesabındaki ağırlığı"
            value={v.weight}
            onChange={(x) => set('weight', x)}
          />
        </SimpleGrid>
      </ModalSection>
    </FormModal>
  );
}

// ---- confirms that stay open on a bad answer ----

function ConfirmShell({
  title = 'Onay',
  icon = 'fas fa-question-circle',
  confirmLabel,
  busy,
  onConfirm,
  onClose,
  children,
}: Props & {
  title?: string;
  icon?: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      centered
      size={520}
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader tone="neutral" icon={icon} title={title} />
      <ModalBody>{children}</ModalBody>
      <ModalFooter>
        <Button variant="default" disabled={busy} onClick={onClose}>
          İptal
        </Button>
        <Button loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** Legacy showErpEntryCompletionModal: the manufacturing main task's ERP gate. */
export function ErpDialog({ taskId, codes, onClose }: Props & { taskId: number; codes: string }) {
  const { applyTask } = useDepartmentTasks();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmIt = async () => {
    if (!ack) return void notify.warning('Devam etmek için ürün girişini onaylamanız gerekir.');
    setBusy(true);
    try {
      const response = await completeDepartmentTask(taskId, { erp_acknowledged: true });
      notify.success('Görev tamamlandı');
      applyTask(response?.task);
      onClose();
    } catch (error) {
      // Stays open so the user can retry.
      notify.error(legacyErrorText(error, 'Görev tamamlanırken hata oluştu'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmShell
      title="Ürün Girişi Onayı"
      confirmLabel="Onayla ve Tamamla"
      busy={busy}
      onConfirm={() => void confirmIt()}
      onClose={onClose}
    >
      <p style={{ marginTop: 0 }}>İmalat görevini tamamlamadan önce ürün girişini onaylayın.</p>
      <Group justify="space-between" mb={4}>
        <strong>
          <FaIcon icon="fas fa-barcode" style={{ marginRight: 8 }} />
          ERP Ürün Kodları
        </strong>
        {codes ? (
          <CopyButton value={codes} timeout={2000}>
            {({ copied, copy }) => (
              <Button
                size="compact-xs"
                variant="outline"
                leftSection={<FaIcon icon={copied ? 'fas fa-check' : 'fas fa-copy'} />}
                onClick={() => {
                  try {
                    copy();
                    notify.success('Ürün kodları kopyalandı');
                  } catch {
                    notify.error('Kopyalama başarısız oldu');
                  }
                }}
              >
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </Button>
            )}
          </CopyButton>
        ) : null}
      </Group>
      {codes ? (
        <pre className={classes.codes}>{codes}</pre>
      ) : (
        <Text c="dimmed" fs="italic" mb="xs">
          Planlama henüz ürün kodu girmemiş.
        </Text>
      )}
      <Alert color="yellow" my="xs">
        Ürün kodlarını ERP&apos;ye girdikten sonra bu görevi tamamlayın.
      </Alert>
      <Checkbox
        label="Ürün kodlarını ERP'ye girdiğimi onaylıyorum."
        checked={ack}
        onChange={(e) => setAck(e.currentTarget.checked)}
      />
    </ConfirmShell>
  );
}

/** Legacy procurement_item completion: a receipt for (part of) what is outstanding. */
export function DeliveryDialog({ task, onClose }: Props & { task: DepartmentTask }) {
  const { reloadList } = useDepartmentTasks();
  const unit = task.item_unit || '';
  const planned = Number(task.quantity || 0);
  const onHand = Number(task.delivered_quantity || 0);
  const remaining = Math.max(Math.round((planned - onHand) * 100) / 100, 0);
  const [qty, setQty] = useState<number | string>(remaining);
  const [busy, setBusy] = useState(false);

  const confirmIt = async () => {
    // One receipt at a time: a double click must not post twice (legacy createExclusiveRun).
    if (busy) return;
    if (!task.planning_request_item_id)
      return void notify.error('Planlama talebi kalemi bulunamadı');
    const receipt: { quantity?: number } = {};
    if (planned > 0) {
      const value = Number(qty);
      if (!(value > 0) || value > remaining + 1e-9) {
        notify.error(`Miktar 0'dan büyük ve en fazla ${fmtQty(remaining)} ${unit} olmalıdır`);
        return;
      }
      receipt.quantity = value;
    }
    setBusy(true);
    try {
      const result = await markPlanningRequestItemDelivered(task.planning_request_item_id, receipt);
      notify.success(
        result && result.is_delivered === false
          ? `Kısmi teslimat kaydedildi (${fmtQty(result.delivered_quantity)} / ${fmtQty(result.quantity)} ${unit})`
          : 'Planlama talebi kalemi teslim alındı olarak işaretlendi',
      );
      onClose();
      // The parent's percentage and the item rows changed.
      await reloadList();
    } catch (error) {
      notify.error(legacyErrorText(error, 'Planlama talebi kalemi işaretlenirken hata oluştu'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmShell
      confirmLabel="Evet, Teslim Alındı"
      busy={busy}
      onConfirm={() => void confirmIt()}
      onClose={onClose}
    >
      <p style={{ marginTop: 0 }}>
        Bu planlama talebi kalemini teslim alındı olarak işaretlemek istediğinize emin misiniz?
      </p>
      {planned > 0 ? (
        <Paper withBorder p="sm">
          <Text size="sm" mb="xs">
            Planlanan{' '}
            <strong>
              {fmtQty(planned)} {unit}
            </strong>{' '}
            · Daha önce alınan{' '}
            <strong>
              {fmtQty(onHand)} {unit}
            </strong>{' '}
            · Kalan{' '}
            <strong>
              {fmtQty(remaining)} {unit}
            </strong>
          </Text>
          <NumberInput
            size="xs"
            label={`Teslim alınan miktar${unit ? ` (${unit})` : ''}`}
            min={0.01}
            max={remaining}
            step={0.01}
            decimalSeparator=","
            description="Tamamı gelmediyse miktarı düşürün; kalan kısım beklemede kalır."
            value={qty}
            onChange={setQty}
          />
        </Paper>
      ) : null}
    </ConfirmShell>
  );
}

// ---- assignment edits ----

/** Legacy showEditSubcontractingAssignmentModal. */
export function EditSubcontractingDialog({
  task,
  assignment,
  onClose,
}: Props & { task: DepartmentTask; assignment: SubcontractingAssignment }) {
  const { refreshRow } = useDepartmentTasks();
  const subs = useQuery(subcontractorsQueryOptions({ is_active: true }));
  const tiers = useQuery(priceTiersQueryOptions({ job_order: task.job_order }));
  const subtask =
    typeof assignment.subtask === 'object' && assignment.subtask ? assignment.subtask : null;
  const [v, setV] = useState({
    subcontractor: assignment.subcontractor ? String(assignment.subcontractor) : '',
    price_tier: assignment.price_tier ? String(assignment.price_tier) : '',
    allocated_weight_kg: (assignment.allocated_weight_kg ?? '') as number | string,
    title: assignment.subtask_title || subtask?.title || '',
    weight: (assignment.subtask_weight || subtask?.weight || '') as number | string,
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof v, value: unknown) => setV((p) => ({ ...p, [key]: value }));
  useCloseOnError(subs.isError || tiers.isError, 'Atama formu yüklenirken hata oluştu', onClose);
  if (subs.isError || tiers.isError) return null;

  const save = async () => {
    const data: Record<string, unknown> = {};
    if (v.subcontractor) data.subcontractor = Number.parseInt(v.subcontractor, 10);
    if (v.price_tier) data.price_tier = Number.parseInt(v.price_tier, 10);
    if (v.allocated_weight_kg !== '' && v.allocated_weight_kg !== null)
      data.allocated_weight_kg = String(v.allocated_weight_kg);
    if (v.title.trim()) data.title = v.title.trim();
    if (v.weight !== '' && v.weight !== null) data.weight = Number.parseFloat(String(v.weight));
    if (Object.keys(data).length === 0) return void notify.warning('Değişiklik yapılmadı');
    setBusy(true);
    try {
      await updateAssignmentWithEndpoint(assignment.id, data);
      notify.success('Taşeron ataması güncellendi');
      onClose();
      await refreshRow(task.id);
    } catch (error) {
      notify.error(error, { fallback: 'Taşeron ataması güncellenirken hata oluştu' });
    } finally {
      setBusy(false);
    }
  };

  const help = 'Boş bırakılırsa değiştirilmez';
  return (
    <FormModal
      opened
      size="md"
      onClose={onClose}
      title="Taşeron Ataması Düzenle"
      icon="fas fa-edit"
      onSubmit={() => void save()}
      submitting={busy}
    >
      {subs.isPending || tiers.isPending ? (
        <Center py="lg">
          <Loader size="sm" />
        </Center>
      ) : (
        <>
          <ModalSection title="Atama Bilgileri" icon="fas fa-info-circle">
            <Stack gap="sm">
              <Select
                label="Taşeron"
                description={help}
                data={[
                  { value: '', label: 'Değiştirmek için seçin...' },
                  ...subs.data.results.map((s) => ({
                    value: String(s.id),
                    label: String(s.name || s.short_name),
                  })),
                ]}
                value={v.subcontractor}
                onChange={(x) => set('subcontractor', x ?? '')}
              />
              <Select
                label="Fiyat Kademesi"
                description={help}
                data={[
                  { value: '', label: 'Değiştirmek için seçin...' },
                  ...tiers.data.map((t) => ({ value: String(t.id), label: tierLabel(t) })),
                ]}
                value={v.price_tier}
                onChange={(x) => set('price_tier', x ?? '')}
              />
              <NumberInput
                label="Ayrılan Ağırlık (kg)"
                description={help}
                min={0}
                step={0.01}
                decimalSeparator=","
                value={v.allocated_weight_kg}
                onChange={(x) => set('allocated_weight_kg', x)}
              />
            </Stack>
          </ModalSection>
          <ModalSection title="Alt Görev Bilgileri" icon="fas fa-tasks">
            <Stack gap="sm">
              <TextInput
                label="Alt Görev Başlığı"
                description={help}
                value={v.title}
                onChange={(e) => set('title', e.currentTarget.value)}
              />
              <NumberInput
                label="Alt Görev Ağırlığı"
                description={help}
                min={0}
                step={0.01}
                decimalSeparator=","
                value={v.weight}
                onChange={(x) => set('weight', x)}
              />
            </Stack>
          </ModalSection>
        </>
      )}
    </FormModal>
  );
}

const TEAM_STATUS_OPTIONS = [
  { value: '', label: 'Değiştirmemek için boş bırakın' },
  { value: 'pending', label: 'Beklemede' },
  { value: 'in_progress', label: 'Devam Ediyor' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'skipped', label: 'Atlandı' },
];

/** Legacy showEditInternalTeamAssignmentModal. */
export function EditInternalTeamDialog({
  task,
  assignment,
  onClose,
}: Props & { task: DepartmentTask; assignment: InternalTeamAssignment }) {
  const { refreshRow } = useDepartmentTasks();
  const teams = useQuery(
    weldingTeamsQueryOptions({ is_active: true, ordering: 'name', page_size: 1000 }),
  );
  const teamId = toNumericId(assignment.team);
  const [v, setV] = useState({
    team: teamId ? String(teamId) : '',
    allocated_weight_kg: (assignment.allocated_weight_kg || '') as number | string,
    progress: (assignment.progress ??
      assignment.current_progress ??
      assignment.manual_progress ??
      '') as number | string,
    status: teamAssignmentStatus(assignment).raw || '',
    notes: assignment.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof v, value: unknown) => setV((p) => ({ ...p, [key]: value }));
  useCloseOnError(teams.isError, 'Takım atama formu yüklenirken hata oluştu', onClose);
  if (teams.isError) return null;

  const save = async () => {
    const data: Record<string, unknown> = {};
    if (v.team) data.team = Number.parseInt(v.team, 10);
    if (v.allocated_weight_kg !== '' && v.allocated_weight_kg !== null)
      data.allocated_weight_kg = String(v.allocated_weight_kg);
    data.notes = v.notes ? v.notes.trim() : '';
    // The welding update-assignment endpoint reads manual_progress / task_status.
    if (v.progress !== '' && v.progress !== null)
      data.manual_progress = Number.parseFloat(String(v.progress));
    if (v.status) data.task_status = v.status;
    setBusy(true);
    try {
      await updateInternalTeamAssignmentWithEndpoint(assignment.id, data);
      notify.success('Takım ataması güncellendi');
      onClose();
      await refreshRow(task.id);
    } catch (error) {
      notify.error(error, { fallback: 'Takım ataması güncellenirken hata oluştu' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      opened
      size="md"
      onClose={onClose}
      title="Takım Atamasını Düzenle"
      icon="fas fa-users"
      onSubmit={() => void save()}
      submitting={busy}
    >
      <ModalSection title="Atama Bilgileri" icon="fas fa-info-circle">
        {teams.isPending ? (
          <Center py="lg">
            <Loader size="sm" />
          </Center>
        ) : (
          <Stack gap="sm">
            <Select
              label="Takım"
              data={[
                { value: '', label: 'Değiştirmemek için boş bırakın' },
                ...teams.data.results.map((t) => ({ value: String(t.id), label: String(t.name) })),
              ]}
              value={v.team}
              onChange={(x) => set('team', x ?? '')}
            />
            <NumberInput
              label="Ayrılan Ağırlık (kg)"
              min={0.01}
              step={0.01}
              decimalSeparator=","
              value={v.allocated_weight_kg}
              onChange={(x) => set('allocated_weight_kg', x)}
            />
            <NumberInput
              label="İlerleme (%)"
              min={0}
              max={100}
              step={0.01}
              decimalSeparator=","
              value={v.progress}
              onChange={(x) => set('progress', x)}
            />
            <Select
              label="Durum"
              data={TEAM_STATUS_OPTIONS}
              value={v.status}
              onChange={(x) => set('status', x ?? '')}
            />
            <Textarea
              label="Notlar"
              value={v.notes}
              onChange={(e) => set('notes', e.currentTarget.value)}
            />
          </Stack>
        )}
      </ModalSection>
    </FormModal>
  );
}

// ---- Danışma Detayı ----

/** Legacy showSiblingConsultationDetail: another department's answer to the same offer. */
export function SiblingDialog({ taskId, onClose }: Props & { taskId: number }) {
  const { statuses } = useDepartmentTasks();
  const query = useQuery(departmentTaskQueryOptions(taskId));
  const departments = useQuery(departmentChoicesQueryOptions());
  const [zipping, setZipping] = useState(false);
  useCloseOnError(query.isError, 'Danışma görevi yüklenemedi', onClose);
  if (query.isError) return null;
  const sibling = query.data;
  const departmentLabel =
    sibling?.department_display ||
    departments.data?.find((d) => d.value === sibling?.department)?.label ||
    sibling?.department ||
    '-';
  const statusLabel =
    sibling?.status_display ||
    statuses.find((s) => s.value === sibling?.status)?.label ||
    sibling?.status ||
    '-';
  const files = sibling?.completion_files ?? [];

  return (
    <Modal opened onClose={onClose} size={800} withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader
        icon="fas fa-handshake"
        title={
          sibling ? (
            <>
              {departmentLabel}{' '}
              <Badge ml="xs" color={siblingStatusColor(sibling.status)}>
                {statusLabel}
              </Badge>
            </>
          ) : (
            'Danışma Detayı'
          )
        }
      />
      <ModalBody>
        {!sibling ? (
          <Center py="lg">
            <Loader />
          </Center>
        ) : (
          <>
            {sibling.notes ? (
              <Paper withBorder p="md" mb="md">
                <Text fw={600} size="sm" mb="xs">
                  <FaIcon icon="fas fa-reply" style={{ marginRight: 8 }} />
                  Yanıt Notu
                </Text>
                <pre className={classes.pre}>{sibling.notes}</pre>
              </Paper>
            ) : null}
            {sibling.completed_by_name || sibling.completed_at ? (
              <Text c="dimmed" size="sm" mb="md">
                <FaIcon
                  icon="fas fa-check-circle"
                  color="var(--mantine-color-green-6)"
                  style={{ marginRight: 4 }}
                />
                {sibling.completed_by_name ? (
                  <>
                    <strong>{sibling.completed_by_name}</strong> tarafından tamamlandı
                  </>
                ) : null}
                {sibling.completed_at
                  ? ` — ${new Date(sibling.completed_at).toLocaleString('tr-TR')}`
                  : null}
              </Text>
            ) : null}
            <FileAttachments
              title="Yanıt Dosyaları"
              files={files.map(toAttachment)}
              readOnly
              emptyText="Yanıt dosyası yüklenmemiş."
              actions={
                files.length > 0 ? (
                  <Button
                    size="compact-xs"
                    variant="outline"
                    color="green"
                    loading={zipping}
                    leftSection={<FaIcon icon="fas fa-download" />}
                    onClick={async () => {
                      setZipping(true);
                      try {
                        await downloadFilesAsZip(
                          files.map(toAttachment),
                          `${sibling.offer_summary?.offer_no || 'Teklif'} - ${departmentLabel} Yanıt Dosyaları`,
                        );
                      } finally {
                        setZipping(false);
                      }
                    }}
                  >
                    Tümünü İndir (ZIP)
                  </Button>
                ) : null
              }
            />
          </>
        )}
      </ModalBody>
    </Modal>
  );
}

// ---- Excel'den İnceleme İçe Aktarma (manufacturing) ----

async function readSheet(file: File): Promise<unknown[][]> {
  if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
}

/** The manufacturing page's QC Excel import modal (legacy index.html + previewQCExcelImport). */
export function QcExcelDialog({
  onImport,
  onClose,
}: Props & { onImport: (reviews: QcReviewDraft[]) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<QcReviewDraft[] | null>(null);

  const previewIt = async () => {
    if (!file) return void notify.warning('Lütfen bir dosya seçin');
    let data: unknown[][];
    try {
      data = await readSheet(file);
    } catch {
      return void notify.error('Dosya okunamadı. Lütfen geçerli bir Excel veya CSV dosyası seçin');
    }
    if (data.length < 2) return void notify.error('Dosya boş veya geçersiz format');
    const reviews = qcReviewsFromSheet(data);
    if (reviews.length === 0) return void notify.error('İşlenecek veri bulunamadı');
    setPreview(reviews);
  };

  const clear = () => {
    setFile(null);
    setPreview(null);
  };

  const importIt = () => {
    if (!preview) return;
    onImport(preview);
    notify.success(`${preview.length} inceleme başarıyla içe aktarıldı`);
    onClose();
  };

  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader title="Excel'den İnceleme İçe Aktarma" icon="fas fa-file-excel" />
      <ModalBody>
        <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />} mb="md">
          <strong>Kullanım:</strong> Excel dosyanızı yükleyin. Sistem otomatik olarak sütunları
          algılamaya çalışacaktır.
        </Alert>
        <Text size="sm" fw={500}>
          Sütunlar (Tümü Opsiyonel):
        </Text>
        <Paper bg="var(--gk-surface-subtle)" p="xs" mb="md">
          <code style={{ fontSize: 12 }}>
            Konum → Konum
            <br />
            Miktar / İncelenen Miktar → İncelenen Miktar
            <br />
            Çizim / Çizim No → Çizim No
            <br />
            Pozisyon / Pozisyon No → Pozisyon No
            <br />
            Notlar / Not → Notlar
          </code>
        </Paper>
        <FileDropInput
          label="Excel Dosyası Seçin:"
          description="Desteklenen formatlar: .xlsx, .xls, .csv"
          placeholder="Excel veya CSV dosyasını sürükleyin ya da seçin..."
          accept=".xlsx,.xls,.csv"
          value={file}
          onChange={setFile}
          mb="sm"
        />
        <Group gap="xs" mb="md">
          <Button
            size="xs"
            variant="outline"
            leftSection={<FaIcon icon="fas fa-eye" />}
            onClick={() => void previewIt()}
          >
            Önizleme
          </Button>
          <Button
            size="xs"
            variant="outline"
            color="gray"
            leftSection={<FaIcon icon="fas fa-trash" />}
            onClick={clear}
          >
            Temizle
          </Button>
        </Group>
        {preview ? (
          <>
            <Text fw={600} size="sm">
              Önizleme:
            </Text>
            <Table withTableBorder fz="sm">
              <Table.Thead>
                <Table.Tr>
                  {['Konum', 'İncelenen Miktar', 'Çizim No', 'Pozisyon No', 'Notlar', 'İşlem'].map(
                    (h) => (
                      <Table.Th key={h}>{h}</Table.Th>
                    ),
                  )}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {preview.map((r, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>{r.location || '-'}</Table.Td>
                    <Table.Td>{r.quantity_inspected || '-'}</Table.Td>
                    <Table.Td>{r.drawing_no || '-'}</Table.Td>
                    <Table.Td>{r.position_no || '-'}</Table.Td>
                    <Table.Td>{r.notes || '-'}</Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="outline"
                        color="red"
                        aria-label="Satırı kaldır"
                        onClick={() => {
                          const next = preview.filter((_, j) => j !== i);
                          setPreview(next.length ? next : null);
                        }}
                      >
                        <FaIcon icon="fas fa-trash" />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          İptal
        </Button>
        {preview ? (
          <Button leftSection={<FaIcon icon="fas fa-download" />} onClick={importIt}>
            İçe Aktar
          </Button>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}
