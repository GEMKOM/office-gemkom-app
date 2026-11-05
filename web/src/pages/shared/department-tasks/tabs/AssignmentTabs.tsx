import {
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { departmentTaskKeys, type DepartmentTask } from '@/api/projects/departmentTasks';
import {
  assignmentKeys,
  assignmentsQueryOptions,
  createAssignmentWithSubtask,
  deleteAssignment,
  priceTiersQueryOptions,
  type PriceTier,
  type SubcontractingAssignment,
} from '@/api/subcontracting/assignments';
import { subcontractorsQueryOptions } from '@/api/subcontracting/subcontractors';
import {
  createInternalTeamAssignmentWithSubtask,
  deleteInternalTeamAssignmentWithSubtask,
  internalTeamAssignmentsQueryOptions,
  internalTeamKeys,
  weightSummaryQueryOptions,
  type InternalTeamAssignment,
} from '@/api/welding/internalTeamAssignments';
import { weldingTeamsQueryOptions } from '@/api/welding/teams';
import { confirm, FaIcon, notify } from '@/ui';
import { useDepartmentTasks } from '../context';
import {
  isInternalTeamAssignmentForTask,
  isSubcontractingAssignmentForTask,
  toNumericId,
  trNumber,
} from '../logic';
import { TabTitle } from './SimpleTabs';

export const PAINT_SUBCONTRACTOR_ID = 9;

function money(amount: unknown, currency = 'TRY'): string {
  const n = Number(amount);
  if (!n) return '0';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n);
  }
}

export function tierLabel(t: PriceTier): string {
  return `${t.name} (${t.price_per_kg} ${t.currency}/kg, Kalan: ${t.remaining_weight_kg || 0} kg)`;
}

function Loading() {
  return (
    <Center py="lg">
      <Loader size="sm" />
    </Center>
  );
}

function SectionTitle({
  icon,
  color,
  children,
}: {
  icon: string;
  color: string;
  children: string;
}) {
  return (
    <Title order={6} c={color} mt="md" mb="xs">
      <FaIcon icon={icon} style={{ marginRight: 8 }} />
      {children}
    </Title>
  );
}

/** "Yeni Atama" / "Atamaları Gör" toggle of the two assignment tabs. */
function ModeToggle({ creating, onToggle }: { creating: boolean; onToggle: () => void }) {
  return (
    <Group justify="flex-end" mb="md">
      <Button
        size="xs"
        variant="outline"
        leftSection={<FaIcon icon={creating ? 'fas fa-list' : 'fas fa-plus-circle'} />}
        onClick={onToggle}
      >
        {creating ? 'Atamaları Gör' : 'Yeni Atama'}
      </Button>
    </Group>
  );
}

// ---- create forms ----

/** Legacy renderAssignSubcontractorActionForm + handleAssignSubcontractorActionSubmit (welding). */
function SubcontractorCreateForm({ task, onDone }: { task: DepartmentTask; onDone: () => void }) {
  const subs = useQuery(subcontractorsQueryOptions({ is_active: true }));
  const tiers = useQuery(priceTiersQueryOptions({ job_order: task.job_order }));
  const [v, setV] = useState({
    subcontractor: '',
    price_tier: '',
    weight: '' as number | string,
    title: '',
  });
  const [busy, setBusy] = useState(false);
  if (task.task_type !== 'welding' && task.task_type !== 'subcontracting') {
    return (
      <Text c="orange">
        Bu işlem sadece Kaynaklı İmalat ve Taşeronluk görevleri için kullanılabilir
      </Text>
    );
  }
  if (subs.isPending || tiers.isPending) return <Loading />;
  if (subs.isError || tiers.isError) return <Text c="red">Form yüklenirken hata oluştu</Text>;

  const submit = async () => {
    if (!v.subcontractor) return void notify.error('Lütfen bir taşeron seçin');
    if (!v.price_tier) return void notify.error('Lütfen bir fiyat kademesi seçin');
    if (v.weight === '') return void notify.error('Lütfen ayrılan ağırlığı girin');
    const body: Record<string, unknown> = {
      kaynak_task_id: task.id,
      subcontractor: Number.parseInt(v.subcontractor, 10),
      price_tier: Number.parseInt(v.price_tier, 10),
      allocated_weight_kg: Number(v.weight),
    };
    if (v.title.trim()) body.title = v.title.trim();
    setBusy(true);
    try {
      await createAssignmentWithSubtask(body);
      notify.success('Taşeron ataması ve alt görev oluşturuldu');
    } catch (error) {
      notify.error(error, { fallback: 'Taşeron ataması oluşturulurken hata oluştu' });
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <form onSubmit={(e) => (e.preventDefault(), void submit())}>
      <TabTitle icon="fas fa-handshake">Taşeron Ata ve Alt Görev Oluştur</TabTitle>
      <SectionTitle icon="fas fa-info-circle" color="blue">
        Atama Bilgileri
      </SectionTitle>
      <Stack gap="sm">
        <Select
          label="Taşeron"
          withAsterisk
          placeholder="Taşeron seçin..."
          data={subs.data.results.map((s) => ({
            value: String(s.id),
            label: String(s.name || s.short_name || s.id),
          }))}
          value={v.subcontractor || null}
          onChange={(x) => setV((p) => ({ ...p, subcontractor: x ?? '' }))}
        />
        <Select
          label="Fiyat Kademesi"
          withAsterisk
          placeholder="Kademe seçin..."
          data={tiers.data.map((t) => ({ value: String(t.id), label: tierLabel(t) }))}
          value={v.price_tier || null}
          onChange={(x) => setV((p) => ({ ...p, price_tier: x ?? '' }))}
        />
        <NumberInput
          label="Ayrılan Ağırlık (kg)"
          withAsterisk
          min={0}
          step={0.01}
          decimalSeparator=","
          description="Maksimum ağırlık seçilen kademenin kalan ağırlığına göre belirlenecektir"
          value={v.weight}
          onChange={(x) => setV((p) => ({ ...p, weight: x }))}
        />
      </Stack>
      <SectionTitle icon="fas fa-tasks" color="cyan">
        Alt Görev Bilgileri (Opsiyonel)
      </SectionTitle>
      <TextInput
        label="Alt Görev Başlığı"
        placeholder="Boş bırakılırsa taşeron adı kullanılacaktır"
        value={v.title}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setV((p) => ({ ...p, title: value }));
        }}
      />
      <Button mt="md" type="submit" loading={busy} leftSection={<FaIcon icon="fas fa-save" />}>
        Taşeron Ata ve Alt Görev Oluştur
      </Button>
    </form>
  );
}

/** Legacy renderAssignPaintSubcontractorActionForm: subcontractor 9, price per kg by hand. */
function PaintCreateForm({ task, onDone }: { task: DepartmentTask; onDone: () => void }) {
  const subs = useQuery(subcontractorsQueryOptions({ is_active: true }));
  const [v, setV] = useState({
    price: '' as number | string,
    weight: '' as number | string,
    title: '',
  });
  const [busy, setBusy] = useState(false);
  if (task.task_type !== 'painting')
    return <Text c="orange">Bu işlem sadece Boya görevleri için kullanılabilir</Text>;
  if (subs.isPending) return <Loading />;
  if (subs.isError) return <Text c="red">Form yüklenirken hata oluştu</Text>;
  const paint = subs.data.results.find((s) => s.id === PAINT_SUBCONTRACTOR_ID);
  const label = paint ? String(paint.name || paint.short_name || `#${paint.id}`) : '#9';

  const submit = async () => {
    if (v.price === '') return void notify.error('Lütfen fiyat/kg girin');
    if (v.weight === '') return void notify.error('Lütfen ayrılan ağırlığı girin');
    const body: Record<string, unknown> = {
      kaynak_task_id: task.id,
      subcontractor: PAINT_SUBCONTRACTOR_ID,
      price_per_kg: Number(v.price).toFixed(2),
      allocated_weight_kg: Number(v.weight).toFixed(2),
    };
    if (v.title.trim()) body.title = v.title.trim();
    setBusy(true);
    try {
      await createAssignmentWithSubtask(body);
      notify.success('Taşeron ataması ve alt görev oluşturuldu');
    } catch (error) {
      notify.error(error, { fallback: 'Taşeron ataması oluşturulurken hata oluştu' });
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <form onSubmit={(e) => (e.preventDefault(), void submit())}>
      <TabTitle icon="fas fa-handshake">Taşeron Ata ve Alt Görev Oluştur</TabTitle>
      <SectionTitle icon="fas fa-info-circle" color="blue">
        Atama Bilgileri
      </SectionTitle>
      <Stack gap="sm">
        <TextInput
          label={
            <>
              Taşeron{' '}
              <Text span c="dimmed">
                (Sabit)
              </Text>
            </>
          }
          readOnly
          value={label}
          description="Boya görevleri için taşeron otomatik seçilir (ID: 9)."
        />
        <NumberInput
          label="Fiyat/kg"
          withAsterisk
          min={0}
          step={0.01}
          decimalSeparator=","
          value={v.price}
          onChange={(x) => setV((p) => ({ ...p, price: x }))}
        />
        <NumberInput
          label="Ayrılan Ağırlık (kg)"
          withAsterisk
          min={0}
          step={0.01}
          decimalSeparator=","
          value={v.weight}
          onChange={(x) => setV((p) => ({ ...p, weight: x }))}
        />
      </Stack>
      <SectionTitle icon="fas fa-tasks" color="cyan">
        Alt Görev Bilgileri (Opsiyonel)
      </SectionTitle>
      <TextInput
        label="Alt Görev Başlığı"
        placeholder="Örn: Boya Grubu 1"
        value={v.title}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setV((p) => ({ ...p, title: value }));
        }}
      />
      <Button mt="md" type="submit" loading={busy} leftSection={<FaIcon icon="fas fa-save" />}>
        Taşeron Ata ve Alt Görev Oluştur
      </Button>
    </form>
  );
}

/** Legacy renderAssignInternalTeamActionForm + handleAssignInternalTeamActionSubmit. */
function InternalTeamCreateForm({ task, onDone }: { task: DepartmentTask; onDone: () => void }) {
  const teams = useQuery(
    weldingTeamsQueryOptions({ is_active: true, ordering: 'name', page_size: 1000 }),
  );
  // Non-fatal, like legacy: the form works without the summary.
  const summary = useQuery({ ...weightSummaryQueryOptions(task.id), retry: false });
  const [v, setV] = useState({ team: '', weight: '' as number | string, notes: '', title: '' });
  const [busy, setBusy] = useState(false);
  if (task.task_type !== 'welding')
    return <Text c="orange">Bu işlem sadece Kaynaklı İmalat görevleri için kullanılabilir</Text>;
  if (teams.isPending || summary.isPending) return <Loading />;
  if (teams.isError) return <Text c="red">Form yüklenirken hata oluştu</Text>;

  const total =
    summary.data?.total_weight_kg != null
      ? Number.parseFloat(String(summary.data.total_weight_kg))
      : null;
  const remaining =
    summary.data?.remaining_weight_kg != null
      ? Number.parseFloat(String(summary.data.remaining_weight_kg))
      : null;

  const submit = async () => {
    if (!v.team) return void notify.error('Lütfen bir takım seçin');
    if (v.weight === '') return void notify.error('Lütfen ayrılan ağırlığı girin');
    const body: Record<string, unknown> = {
      welding_task_id: task.id,
      team: Number.parseInt(v.team, 10),
      allocated_weight_kg: Number(v.weight),
    };
    if (v.notes.trim()) body.notes = v.notes.trim();
    if (v.title.trim()) body.title = v.title.trim();
    setBusy(true);
    try {
      await createInternalTeamAssignmentWithSubtask(body);
      notify.success('Takım ataması ve alt görev oluşturuldu');
    } catch (error) {
      notify.error(error, { fallback: 'Takım ataması oluşturulurken hata oluştu' });
    } finally {
      setBusy(false);
      onDone();
    }
  };

  return (
    <form onSubmit={(e) => (e.preventDefault(), void submit())}>
      <TabTitle icon="fas fa-users">Takım Ata ve Alt Görev Oluştur</TabTitle>
      {total !== null ? (
        <Alert color="gray" mb="md">
          <Group justify="space-between">
            <span>
              <FaIcon icon="fas fa-weight-hanging" style={{ marginRight: 4 }} />
              İş Emri Ağırlığı:
            </span>
            <strong>{trNumber(total, 2)} kg</strong>
          </Group>
          <Group justify="space-between">
            <span>Kalan (Takım + Taşeron):</span>
            <Text fw={700} c={remaining !== null && remaining <= 0 ? 'red' : 'green'}>
              {remaining !== null ? trNumber(remaining, 2) : '-'} kg
            </Text>
          </Group>
        </Alert>
      ) : null}
      <SectionTitle icon="fas fa-info-circle" color="blue">
        Atama Bilgileri
      </SectionTitle>
      <Stack gap="sm">
        <Select
          label="Takım"
          withAsterisk
          placeholder="Takım seçin..."
          data={teams.data.results.map((t) => {
            const team = t as typeof t & { foreman_name?: string; foreman_full_name?: string };
            const foreman = team.foreman_name || team.foreman_full_name || '';
            return {
              value: String(t.id),
              label: foreman ? `${t.name} (Ustabaşı: ${foreman})` : String(t.name),
            };
          })}
          value={v.team || null}
          onChange={(x) => setV((p) => ({ ...p, team: x ?? '' }))}
        />
        <NumberInput
          label="Ayrılan Ağırlık (kg)"
          withAsterisk
          min={0.01}
          max={remaining !== null && remaining > 0 ? remaining : undefined}
          step={0.01}
          decimalSeparator=","
          description={
            remaining !== null
              ? `Kalan ayrılabilir ağırlık: ${trNumber(Math.max(remaining, 0), 2)} kg`
              : undefined
          }
          value={v.weight}
          onChange={(x) => setV((p) => ({ ...p, weight: x }))}
        />
        <Textarea
          label="Notlar"
          rows={2}
          placeholder="Opsiyonel not"
          value={v.notes}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setV((p) => ({ ...p, notes: value }));
          }}
        />
      </Stack>
      <SectionTitle icon="fas fa-tasks" color="cyan">
        Alt Görev Bilgileri (Opsiyonel)
      </SectionTitle>
      <TextInput
        label="Alt Görev Başlığı"
        placeholder="Boş bırakılırsa takım adı kullanılır"
        value={v.title}
        onChange={(e) => {
          const value = e.currentTarget.value;
          setV((p) => ({ ...p, title: value }));
        }}
      />
      <Button mt="md" type="submit" loading={busy} leftSection={<FaIcon icon="fas fa-save" />}>
        Takım Ata ve Alt Görev Oluştur
      </Button>
    </form>
  );
}

// ---- Taşeron Ataması tab ----

/** Legacy renderSubcontractorTab + setupSubcontractorTabListeners. */
export function SubcontractorTab({ task }: { task: DepartmentTask }) {
  const { openDialog, cachedSubtasks, refreshRow } = useDepartmentTasks();
  const queryClient = useQueryClient();
  const isWelding = task.task_type === 'welding';
  const isPainting = task.task_type === 'painting';
  const canEdit = task.task_type === 'subcontracting';
  const canCreate = isWelding || isPainting;
  const params =
    isWelding && task.job_order
      ? { job_no: task.job_order, page_size: 1000 }
      : { department_task: task.id };
  const query = useQuery(assignmentsQueryOptions(params));
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: assignmentKeys.all }),
      queryClient.invalidateQueries({ queryKey: departmentTaskKeys.detail(task.id) }),
      refreshRow(task.id),
    ]);
  };

  if (query.isPending) return <Loading />;
  if (query.isError) return <Text c="red">Taşeron atamaları yüklenirken hata oluştu</Text>;

  let assignments = query.data;
  if (isWelding && task.job_order) {
    const strict = assignments.filter((a) =>
      isSubcontractingAssignmentForTask(a, task, cachedSubtasks(task.id)),
    );
    // Without enough relation fields, legacy showed the job's assignments rather than nothing.
    assignments = strict.length > 0 ? strict : assignments;
  }

  // The row comes from the list, so the legacy fetchAssignment fallback has nothing to do.
  const edit = (assignment: SubcontractingAssignment) => {
    if (Number(assignment.last_billed_progress) > 0) {
      notify.error('Faturalama yapıldığı için bu atama düzenlenemez');
      return;
    }
    openDialog({ kind: 'edit-subcontracting', task, assignment });
  };

  const remove = async (id: number) => {
    if (
      !(await confirm({
        message: 'Taşeron atamasını silmek istediğinizden emin misiniz?',
        danger: true,
      }))
    )
      return;
    try {
      await deleteAssignment(id);
      notify.success('Taşeron ataması silindi');
      await refresh();
    } catch (error) {
      notify.error(error, { fallback: 'Taşeron ataması silinirken hata oluştu' });
    }
  };

  return (
    <>
      <TabTitle icon="fas fa-handshake">Taşeron Ataması</TabTitle>
      {canCreate ? (
        <ModeToggle creating={creating} onToggle={() => setCreating((c) => !c)} />
      ) : null}
      {creating ? (
        isPainting ? (
          <PaintCreateForm task={task} onDone={() => void refresh()} />
        ) : (
          <SubcontractorCreateForm task={task} onDone={() => void refresh()} />
        )
      ) : assignments.length === 0 ? (
        <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />}>
          Bu görev için henüz taşeron ataması bulunmamaktadır.
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table withTableBorder striped highlightOnHover fz="sm">
            <Table.Thead>
              <Table.Tr>
                {[
                  'Taşeron',
                  'Fiyat Kademesi',
                  'Fiyat/kg',
                  'Ayrılan Ağırlık',
                  'Mevcut İlerleme',
                  'Faturalanmış İlerleme',
                  'Faturalanmamış İlerleme',
                  'Faturalanmamış Ağırlık',
                  'Faturalanmamış Maliyet',
                  'Toplam Maliyet',
                  ...(canEdit ? ['İşlem'] : []),
                ].map((h) => (
                  <Table.Th key={h}>{h}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {assignments.map((a) => {
                const weight = Number(a.allocated_weight_kg) || 0;
                const progress = Number(a.current_progress) || 0;
                const price = Number(a.price_per_kg) || 0;
                const currency = a.cost_currency || 'TRY';
                const billed = Number(a.last_billed_progress) || 0;
                return (
                  <Table.Tr key={a.id}>
                    <Table.Td>{a.subcontractor_name || '-'}</Table.Td>
                    <Table.Td>{a.price_tier_name || '-'}</Table.Td>
                    <Table.Td>{money(price, currency)}/kg</Table.Td>
                    <Table.Td>{a.allocated_weight_kg || 0} kg</Table.Td>
                    <Table.Td>{a.current_progress || 0}%</Table.Td>
                    <Table.Td>{a.last_billed_progress || 0}%</Table.Td>
                    <Table.Td>{a.unbilled_progress || 0}%</Table.Td>
                    <Table.Td>{a.unbilled_weight_kg || 0} kg</Table.Td>
                    <Table.Td>{money(a.unbilled_cost, currency)}</Table.Td>
                    <Table.Td>{money(((weight * progress) / 100) * price || 0, currency)}</Table.Td>
                    {canEdit ? (
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Button
                            size="compact-xs"
                            variant="outline"
                            disabled={billed > 0}
                            title={
                              billed > 0 ? 'Faturalama yapıldığı için düzenlenemez' : undefined
                            }
                            leftSection={<FaIcon icon="fas fa-edit" />}
                            onClick={() => edit(a)}
                          >
                            Düzenle
                          </Button>
                          <Button
                            size="compact-xs"
                            variant="outline"
                            color="red"
                            leftSection={<FaIcon icon="fas fa-trash" />}
                            onClick={() => void remove(a.id)}
                          >
                            Sil
                          </Button>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </>
  );
}

// ---- Takım Ataması tab ----

export function teamName(a: InternalTeamAssignment): string {
  const team = typeof a.team === 'object' && a.team ? a.team : null;
  return a.team_name || team?.name || a.team_display || (a.team ? `#${toNumericId(a.team)}` : '-');
}

function foremanName(a: InternalTeamAssignment): string {
  const team = typeof a.team === 'object' && a.team ? a.team : null;
  return (
    a.team_foreman_name ||
    a.foreman_name ||
    team?.foreman_name ||
    team?.foreman_full_name ||
    team?.foreman?.full_name ||
    team?.foreman?.username ||
    '-'
  );
}

function membersCount(a: InternalTeamAssignment): string | number {
  if (a.team_members_count !== undefined && a.team_members_count !== null)
    return a.team_members_count;
  if (a.members_count !== undefined && a.members_count !== null) return a.members_count;
  const team = typeof a.team === 'object' && a.team ? a.team : null;
  return Array.isArray(team?.members) ? team.members.length : '-';
}

export function teamAssignmentStatus(a: InternalTeamAssignment): { raw: string; label: string } {
  return {
    raw: a.status ?? a.department_task_status ?? '',
    label:
      a.status_display ??
      a.department_task_status_display ??
      a.status ??
      a.department_task_status ??
      '-',
  };
}

function teamProgress(a: InternalTeamAssignment): string {
  const value =
    a.current_progress ?? a.progress ?? a.manual_progress ?? a.department_task_manual_progress;
  if (value === null || value === undefined || value === '') return '-';
  const n = Number.parseFloat(String(value));
  return Number.isNaN(n) ? String(value) : `${n}%`;
}

/** Legacy renderInternalTeamTab + setupInternalTeamTabListeners. */
export function InternalTeamTab({ task }: { task: DepartmentTask }) {
  const { openDialog, cachedSubtasks, closeTask, reloadList, refreshRow } = useDepartmentTasks();
  const queryClient = useQueryClient();
  const query = useQuery(
    internalTeamAssignmentsQueryOptions({ job_no: task.job_order, page_size: 1000 }),
  );
  const [creating, setCreating] = useState(false);
  const canCreate = task.task_type === 'welding';

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: internalTeamKeys.all }),
      queryClient.invalidateQueries({ queryKey: departmentTaskKeys.detail(task.id) }),
      refreshRow(task.id),
    ]);
  };

  if (query.isPending) return <Loading />;
  if (query.isError) return <Text c="red">Takım atamaları yüklenirken hata oluştu</Text>;
  const assignments = query.data.filter((a) =>
    isInternalTeamAssignmentForTask(a, task, cachedSubtasks(task.id)),
  );

  const remove = async (id: number) => {
    if (
      !(await confirm({
        message: 'Takım atamasını ve bağlı alt görevi silmek istediğinizden emin misiniz?',
        danger: true,
      }))
    )
      return;
    try {
      await deleteInternalTeamAssignmentWithSubtask(id);
      notify.success('Takım ataması silindi');
      if (task.task_type === 'internal_team') {
        closeTask();
        await reloadList();
        return;
      }
      await refresh();
    } catch (error) {
      notify.error(error, { fallback: 'Takım ataması silinirken hata oluştu' });
    }
  };

  return (
    <>
      <TabTitle icon="fas fa-users">Takım Ataması</TabTitle>
      {canCreate ? (
        <ModeToggle creating={creating} onToggle={() => setCreating((c) => !c)} />
      ) : null}
      {creating ? (
        <InternalTeamCreateForm task={task} onDone={() => void refresh()} />
      ) : assignments.length === 0 ? (
        <Alert color="blue" icon={<FaIcon icon="fas fa-info-circle" />}>
          Bu görev için henüz takım ataması bulunmamaktadır.
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={800}>
          <Table withTableBorder striped highlightOnHover fz="sm">
            <Table.Thead>
              <Table.Tr>
                {[
                  'Takım',
                  'Ustabaşı',
                  'Üye Sayısı',
                  'Ayrılan Ağırlık',
                  'İlerleme',
                  'Durum',
                  'Not',
                  'İşlem',
                ].map((h) => (
                  <Table.Th key={h}>{h}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {assignments.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>{teamName(a)}</Table.Td>
                  <Table.Td>{foremanName(a)}</Table.Td>
                  <Table.Td>{membersCount(a)}</Table.Td>
                  <Table.Td>{a.allocated_weight_kg ?? '-'} kg</Table.Td>
                  <Table.Td>{teamProgress(a)}</Table.Td>
                  <Table.Td>
                    <Badge color="gray">{teamAssignmentStatus(a).label || '-'}</Badge>
                  </Table.Td>
                  <Table.Td>{a.notes || '-'}</Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Button
                        size="compact-xs"
                        variant="outline"
                        leftSection={<FaIcon icon="fas fa-edit" />}
                        onClick={() =>
                          openDialog({ kind: 'edit-internal-team', task, assignment: a })
                        }
                      >
                        Düzenle
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="outline"
                        color="red"
                        leftSection={<FaIcon icon="fas fa-trash" />}
                        onClick={() => void remove(a.id)}
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
    </>
  );
}
