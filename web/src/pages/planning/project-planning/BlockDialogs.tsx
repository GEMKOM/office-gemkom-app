// The sheet's dialogs: İş Ekle, Ata (from Tümü), Atamayı değiştir, Ağırlık,
// Fiyat Kademesi and Özel Aşama. They only collect input; the store applies it
// to the working copy and Kaydet sends it.

import { NumberInput, Select, Stack, TextInput, Textarea, type ComboboxItem } from '@mantine/core';
import { useState } from 'react';
import { FormModal, notify } from '@/ui';
import { fmtKg, round2 } from './model/format';
import type { Holder, PlanningStore, WeldingTaskOption } from './model/store';
import { resourceKeyOf } from './model/store';
import type { ResourceVM } from './model/types';
import s from './ProjectPlanningPage.module.css';

export interface TierOption {
  value: string;
  label: string;
  fits?: boolean;
}

export type Dialog =
  | { kind: 'add'; resourceKey: string }
  | { kind: 'assign'; weldingTaskId: number }
  | { kind: 'move'; blockRef: string }
  | { kind: 'weight'; blockRef: string }
  | { kind: 'stage'; blockRef: string }
  | {
      kind: 'tier';
      title: string;
      help: string;
      tiers: TierOption[];
      onPick: (tierId: number) => void;
    };

const resourceOption = (r: ResourceVM) => ({
  value: resourceKeyOf(r),
  label: `${r.resource_type === 'team' ? 'Ekip' : 'Taşeron'} — ${r.display_name || r.name}`,
});

// Searching a resource reads its full name, as the legacy picker did.
const byLabel = (items: ComboboxItem[], search: string) => {
  const q = search.trim().toLocaleLowerCase('tr');
  return q ? items.filter((i) => i.label.toLocaleLowerCase('tr').includes(q)) : items;
};

function HolderChips({ holders }: { holders: Holder[] }) {
  return (
    <div className={s.allocHolders}>
      {holders.length ? (
        holders.map((h, i) => (
          <span key={`${h.name}-${i}`} className={s.allocHolder}>
            <i className={`fas ${h.type === 'team' ? 'fa-users' : 'fa-industry'}`} />
            {h.name} <strong>{fmtKg(h.kg)} kg</strong>
          </span>
        ))
      ) : (
        <span className={s.muted} style={{ fontSize: '0.8rem' }}>
          Bu işe henüz atama yapılmamış.
        </span>
      )}
    </div>
  );
}

/** Live "who holds what" panel under the job picker. */
function JobAllocInfo({ option }: { option: WeldingTaskOption | undefined }) {
  if (!option) return null;
  const remaining = option.total - option.assigned;
  return (
    <div className={s.allocInfo}>
      <div className={s.allocSummary}>
        <span>
          <span className={s.allocLabel}>Toplam</span>
          <strong>{fmtKg(option.total)} kg</strong>
        </span>
        <span>
          <span className={s.allocLabel}>Atanmış</span>
          <strong>{fmtKg(option.assigned)} kg</strong>
        </span>
        <span className={remaining <= 0 ? s.allocEmpty : s.allocFree}>
          <span className={s.allocLabel}>Kalan</span>
          <strong>{fmtKg(remaining)} kg</strong>
        </span>
      </div>
      <HolderChips holders={option.holders} />
    </div>
  );
}

function JobOption({ option }: { option: WeldingTaskOption }) {
  const shown = option.holders.slice(0, 3);
  const rest = option.holders.length - shown.length;
  return (
    <span className={s.jpOpt}>
      <span className={s.jpTop}>
        <b className={s.jpNo}>{option.task.job_no}</b>
        <span className={s.jpTitle}>{option.task.job_order_title || ''}</span>
        <span className={s.jpRem}>kalan {fmtKg(option.remaining)} kg</span>
      </span>
      <span className={s.jpMeta}>
        <span className={s.jpKg}>toplam {fmtKg(option.total)}</span>
        <span className={s.jpKg}>atanmış {fmtKg(option.assigned)}</span>
        {option.holders.length ? (
          <>
            {shown.map((h, i) => (
              <span key={`${h.name}-${i}`} className={s.jpHolder}>
                <i
                  className={`fas ${h.type === 'subcontractor' ? 'fa-truck-field' : 'fa-users'}`}
                />
                {h.name} · {fmtKg(h.kg)}
              </span>
            ))}
            {rest > 0 ? <span className={`${s.jpHolder} ${s.jpMore}`}>+{rest}</span> : null}
          </>
        ) : (
          <span className={`${s.jpHolder} ${s.jpNone}`}>henüz atanmadı</span>
        )}
      </span>
    </span>
  );
}

interface Common {
  store: PlanningStore;
  onClose: () => void;
}

export interface NewBlockDraft {
  resource: ResourceVM;
  weldingTaskId: number;
  allocated_weight_kg: number;
  notes: string;
}

export function AddJobDialog({
  onClose,
  resource,
  options,
  onSubmit,
}: {
  onClose: () => void;
  resource: ResourceVM;
  options: WeldingTaskOption[];
  onSubmit: (draft: NewBlockDraft) => void;
}) {
  const isSub = resource.resource_type === 'subcontractor';
  const [taskId, setTaskId] = useState<string | null>(options[0]?.value ?? null);
  const [weight, setWeight] = useState<string | number>(() => {
    const first = options[0];
    return first && first.remaining > 0 ? first.remaining : '';
  });
  const [notes, setNotes] = useState('');
  const byValue = new Map(options.map((o) => [o.value, o]));
  // The search reads the job, its title, its customer and who holds it.
  const hay = new Map(
    options.map((o) => [
      o.value,
      [o.task.job_no, o.task.job_order_title, o.task.customer_name, ...o.holders.map((h) => h.name)]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr'),
    ]),
  );
  return (
    <FormModal
      opened
      onClose={onClose}
      title={`İş Ekle — ${resource.display_name || resource.name}`}
      icon="fas fa-plus-circle"
      size="xl"
      submitLabel={isSub ? 'Devam (Fiyat Kademesi)' : 'Ekle'}
      submitIcon={isSub ? 'fas fa-arrow-right' : 'fas fa-plus'}
      onSubmit={(e) => {
        e.preventDefault();
        const kg = Number(weight);
        if (!taskId || !Number.isFinite(kg) || kg <= 0) {
          notify.error('Görev ve geçerli bir ağırlık zorunludur.');
          return;
        }
        onSubmit({ resource, weldingTaskId: Number(taskId), allocated_weight_kg: kg, notes });
      }}
    >
      <Stack gap="sm">
        <div>
          <Select
            label="Kaynak Görevi (İş No)"
            required
            searchable
            allowDeselect={false}
            maxDropdownHeight={460}
            data={options.map((o) => ({
              value: o.value,
              // What the field shows once collapsed.
              label: `${o.task.job_no} — ${o.task.job_order_title || ''} (kalan ${fmtKg(o.remaining)} kg)`,
            }))}
            filter={({ options: items, search }) => {
              const q = search.trim().toLocaleLowerCase('tr');
              return q
                ? (items as ComboboxItem[]).filter((i) => hay.get(i.value)?.includes(q))
                : items;
            }}
            renderOption={({ option }) => {
              const o = byValue.get(option.value);
              return o ? <JobOption option={o} /> : option.label;
            }}
            value={taskId}
            onChange={(v) => {
              setTaskId(v);
              const o = v ? byValue.get(v) : undefined;
              if (o && o.remaining > 0) setWeight(o.remaining);
            }}
          />
          <JobAllocInfo option={taskId ? byValue.get(taskId) : undefined} />
        </div>
        <NumberInput
          label="Ağırlık (kg)"
          required
          min={0.01}
          step={0.01}
          decimalScale={2}
          decimalSeparator=","
          value={weight}
          onChange={setWeight}
          description="Bu ekibin/taşeronun yapacağı ekipman ağırlığı."
        />
        <Textarea
          label="Not"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
      </Stack>
    </FormModal>
  );
}

export function AssignDialog({
  store,
  onClose,
  weldingTaskId,
  onSubmit,
}: Common & { weldingTaskId: number; onSubmit: (draft: NewBlockDraft) => void }) {
  const task = store.weldingTasks.find((t) => t.welding_task_id === weldingTaskId);
  const resources = store.resources.map(resourceOption);
  const [resourceKey, setResourceKey] = useState<string | null>(resources[0]?.value ?? null);
  const remaining = task
    ? store.remainingForTask(task.welding_task_id, task.total_weight_kg)
    : null;
  const [weight, setWeight] = useState<string | number>(
    remaining != null && remaining > 0 ? remaining : '',
  );
  const [notes, setNotes] = useState('');
  if (!task) return null;
  // What the decision needs, next to where the kg is typed.
  const assignedKg = round2(store.allocatedForTask(task.welding_task_id));
  const holders = store.holdersForTask(task.welding_task_id);
  const holderText = holders.length
    ? ` (${holders.map((h) => `${h.name}: ${fmtKg(h.kg)} kg`).join(', ')})`
    : '';
  const summary =
    task.total_weight_kg != null
      ? `Toplam ${fmtKg(task.total_weight_kg)} kg · Atanan ${fmtKg(assignedKg)} kg${holderText} · Kalan ${fmtKg(remaining)} kg. `
      : assignedKg > 0
        ? `Atanan ${fmtKg(assignedKg)} kg${holderText}. `
        : '';
  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Ata — ${task.job_no}${task.job_order_title ? ` · ${task.job_order_title}` : ''}`}
      icon="fas fa-user-plus"
      size="xl"
      submitLabel="Ata"
      submitIcon="fas fa-user-plus"
      onSubmit={(e) => {
        e.preventDefault();
        const res = store.resources.find((r) => resourceKeyOf(r) === resourceKey);
        const kg = Number(weight);
        if (!res) {
          notify.error('Ekip veya taşeron seçin.');
          return;
        }
        if (!Number.isFinite(kg) || kg <= 0) {
          notify.error('Geçerli bir ağırlık girin.');
          return;
        }
        onSubmit({
          resource: res,
          weldingTaskId: task.welding_task_id,
          allocated_weight_kg: kg,
          notes,
        });
      }}
    >
      <Stack gap="sm">
        <Select
          label="Ekip / Taşeron"
          required
          searchable
          allowDeselect={false}
          maxDropdownHeight={460}
          data={resources}
          filter={({ options: items, search }) => byLabel(items as ComboboxItem[], search)}
          value={resourceKey}
          onChange={setResourceKey}
        />
        <NumberInput
          label="Ağırlık (kg)"
          required
          min={0.01}
          step={0.01}
          decimalScale={2}
          decimalSeparator=","
          value={weight}
          onChange={setWeight}
          description={
            `${summary}Bu ekibin/taşeronun yapacağı ekipman ağırlığı. ` +
            '(Taşeron seçilirse bir sonraki adımda fiyat kademesi sorulur.)'
          }
        />
        <Textarea
          label="Not"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
      </Stack>
    </FormModal>
  );
}

export function MoveDialog({
  store,
  onClose,
  blockRef,
  onSubmit,
}: Common & { blockRef: string; onSubmit: (res: ResourceVM) => void }) {
  const block = store.findBlock(blockRef);
  const currentKey = block ? `${block.resource_type}-${block.resource_id}` : '';
  const options = store.resources
    .filter((r) => resourceKeyOf(r) !== currentKey)
    .map(resourceOption);
  const [resourceKey, setResourceKey] = useState<string | null>(options[0]?.value ?? null);
  if (!block) return null;
  const current = store.resources.find((r) => resourceKeyOf(r) === currentKey);
  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Atamayı değiştir — ${block.job_no}`}
      icon="fas fa-people-arrows"
      size="xl"
      submitLabel="Taşı"
      submitIcon="fas fa-people-arrows"
      onSubmit={(e) => {
        e.preventDefault();
        const res = store.resources.find((r) => resourceKeyOf(r) === resourceKey);
        if (!res) {
          onClose();
          return;
        }
        onSubmit(res);
      }}
    >
      <Select
        label="Ekip / Taşeron"
        required
        searchable
        allowDeselect={false}
        maxDropdownHeight={460}
        data={options}
        filter={({ options: items, search }) => byLabel(items as ComboboxItem[], search)}
        value={resourceKey}
        onChange={setResourceKey}
        description={
          `Şu an: ${current ? current.display_name || current.name : '—'} · ${fmtKg(block.allocated_weight_kg)} kg. ` +
          'Aşamalar ve ilerleme atamayla birlikte taşınır. (Taşeron seçilirse bir sonraki adımda fiyat kademesi sorulur.)'
        }
      />
    </FormModal>
  );
}

export function WeightDialog({ store, onClose, blockRef }: Common & { blockRef: string }) {
  const block = store.findBlock(blockRef);
  const [weight, setWeight] = useState<string | number>(block?.allocated_weight_kg ?? '');
  const [notes, setNotes] = useState(block?.notes || '');
  if (!block) return null;
  const task = store.weldingTasks.find((t) => t.welding_task_id === block.welding_task_id);
  const total = task?.total_weight_kg != null ? Number(task.total_weight_kg) : null;
  const allocated = store.allocatedForTask(block.welding_task_id);
  const assignable =
    total != null ? total - (allocated - Number(block.allocated_weight_kg || 0)) : null;
  return (
    <FormModal
      opened
      onClose={onClose}
      title={`Ağırlık — ${block.job_no}`}
      icon="fas fa-weight-hanging"
      size="md"
      submitLabel="Uygula"
      submitIcon="fas fa-check"
      onSubmit={(e) => {
        e.preventDefault();
        const kg = Number(weight);
        if (!Number.isFinite(kg) || kg <= 0) {
          notify.error('Geçerli bir ağırlık girin.');
          return;
        }
        store.applyWeight(block.key, kg, notes);
        onClose();
      }}
    >
      <Stack gap="sm">
        <NumberInput
          label="Ağırlık (kg)"
          required
          min={0.01}
          step={0.01}
          decimalScale={2}
          decimalSeparator=","
          value={weight}
          onChange={setWeight}
          description={
            assignable != null ? `Atanabilir üst sınır: ~${fmtKg(assignable)} kg` : undefined
          }
        />
        <Textarea
          label="Not"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          description="Kaynak alt görevinin notuna kaydedilir."
        />
      </Stack>
    </FormModal>
  );
}

export function TierDialog({
  onClose,
  title,
  help,
  tiers,
  onPick,
}: {
  onClose: () => void;
  title: string;
  help: string;
  tiers: TierOption[];
  onPick: (tierId: number) => void;
}) {
  const [tier, setTier] = useState<string | null>(tiers[0]?.value ?? null);
  return (
    <FormModal
      opened
      onClose={onClose}
      title={title}
      icon="fas fa-tags"
      size="md"
      submitLabel="Ekle"
      submitIcon="fas fa-check"
      onSubmit={(e) => {
        e.preventDefault();
        const id = Number(tier);
        if (!id) {
          notify.error('Fiyat kademesi seçin.');
          return;
        }
        onPick(id);
      }}
    >
      <Select
        label="Fiyat Kademesi"
        required
        searchable
        allowDeselect={false}
        data={tiers.map((t) => ({ value: t.value, label: t.label }))}
        value={tier}
        onChange={setTier}
        description={help}
      />
    </FormModal>
  );
}

export function CustomStageDialog({ store, onClose, blockRef }: Common & { blockRef: string }) {
  const [title, setTitle] = useState('');
  const [weight, setWeight] = useState<string | number>(10);
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Özel Aşama Ekle"
      icon="fas fa-pen-ruler"
      size="md"
      submitLabel="Ekle"
      submitIcon="fas fa-plus"
      onSubmit={(e) => {
        e.preventDefault();
        const refusal = store.addCustomStage(blockRef, title, weight);
        if (refusal) {
          notify.error(refusal);
          return;
        }
        onClose();
      }}
    >
      <Stack gap="sm">
        <TextInput
          label="Aşama Adı"
          required
          placeholder="örn. Final Machinery"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          data-autofocus
        />
        <NumberInput
          label="Ağırlık (katkı payı)"
          min={1}
          step={1}
          allowDecimal={false}
          value={weight}
          onChange={setWeight}
          description="Bloğun ilerlemesine katkı ağırlığı (kg değil)."
        />
      </Stack>
    </FormModal>
  );
}
