import { formatDateTime } from '@legacy/components/estimate-report/report-view.js';
import { Button, Loader, Text, TextInput } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import {
  estimatorParametersQueryOptions,
  referenceKeys,
  updateEstimatorParameters,
  type EstimatorParameters,
} from '@/api/projects/references';
import { FaIcon, notify } from '@/ui';
import css from './ReferencesPage.module.css';
import { inputText, parseInput } from './weldDraft';

function trimNum(value: unknown): string {
  return value == null ? '—' : Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
}

/** The "Birim süreler" panel: unit times and cost parameters, grouped as the server sends them. */
export function UnitsPanel({ onSaved }: { onSaved: () => void }) {
  const query = useQuery(estimatorParametersQueryOptions());
  if (query.isPending) {
    return (
      <div className={css.units}>
        <Text size="sm" c="dimmed">
          <Loader size={12} mr={6} />
          Parametreler yükleniyor…
        </Text>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className={css.units}>
        <Text size="sm" c="red">
          {query.error instanceof Error ? query.error.message : 'Parametreler yüklenemedi'}
        </Text>
      </div>
    );
  }
  // Remount on new server values so the inputs start from them.
  return <UnitsForm key={query.dataUpdatedAt} units={query.data} onSaved={onSaved} />;
}

function UnitsForm({ units, onSaved }: { units: EstimatorParameters; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const initial = () => Object.fromEntries(units.parameters.map((p) => [p.key, inputText(p.value)]));
  const [typed, setTyped] = useState<Record<string, string>>(initial);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const changed: Record<string, number> = {};
  const invalid: Record<string, string> = {};
  units.parameters.forEach((p) => {
    const v = parseInput(typed[p.key]);
    if (Number.isNaN(v)) invalid[p.key] = 'Sayı olmalı.';
    else if (Math.abs(v - Number(p.value)) > 1e-9) changed[p.key] = v;
  });
  const nChanged = Object.keys(changed).length;
  const nInvalid = Object.keys(invalid).length;

  // Groups and their labels in the server's order; a parameter of an unnamed group goes last under its key.
  const groups: Record<string, string> = { ...(units.groups ?? {}) };
  const byGroup: Record<string, typeof units.parameters> = {};
  units.parameters.forEach((p) => {
    const g = p.group || 'other';
    (byGroup[g] ??= []).push(p);
    if (!(g in groups)) groups[g] = g;
  });

  const save = async () => {
    if (nInvalid) {
      setErrors(invalid);
      return;
    }
    if (!nChanged) {
      notify.info('Değişiklik yok');
      return;
    }
    setBusy(true);
    try {
      const result = await updateEstimatorParameters(changed, note);
      notify.success(`${(result.changed ?? []).length} parametre kaydedildi; faktörler yeniden hesaplandı.`);
      queryClient.setQueryData(referenceKeys.parameters, result);
      onSaved();
      await queryClient.invalidateQueries({ queryKey: referenceKeys.all });
    } catch (error) {
      const fieldErrors = isApiError(error) ? (error.data as { errors?: Record<string, string> } | undefined)?.errors : undefined;
      if (fieldErrors) setErrors(fieldErrors);
      notify.error(error, { fallback: 'Parametreler kaydedilemedi' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={css.units} data-testid="units-panel">
      <div className={css.unitsHead}>
        <h6>
          <FaIcon icon="fas fa-sliders" style={{ marginRight: 4 }} />
          Birim süreler ve maliyet parametreleri <span className={css.pill}>{units.parameters.length}</span>
        </h6>
        <Text size="sm" c="dimmed">
          Bir adedin plan saati (kaynak atölyesi, talaşlı, CNC, büküm, kalite kontrol) bu parametrelerle bulunur;
          değişiklik bütün faktörleri ve yeni tahminleri hemen etkiler. Bir merkezin parametreleri aynı oranda
          değişirse o merkezin tahmini değişmez.
        </Text>
      </div>
      <div className={css.unitsGroups}>
        {Object.keys(groups)
          .filter((g) => byGroup[g])
          .map((g) => (
            <div key={g} className={css.unitsGroup}>
              <h6>
                {groups[g]} <span className={css.pill}>{byGroup[g]!.length}</span>
              </h6>
              <table className={css.unitsTable}>
                <tbody>
                  {byGroup[g]!.map((p) => (
                    <tr
                      key={p.key}
                      data-custom={p.is_default ? undefined : true}
                      title={[
                        p.description,
                        p.changed_by_name && `Son değişiklik: ${p.changed_by_name} · ${formatDateTime(p.changed_at)}`,
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      <td className={css.unitsLabel}>{p.label}</td>
                      <td className={css.unitsUnit}>{p.unit}</td>
                      <td className={css.unitsDefault}>varsayılan {trimNum(p.default)}</td>
                      <td className={css.unitsInput}>
                        <TextInput
                          size="xs"
                          inputMode="decimal"
                          aria-label={p.label}
                          value={typed[p.key] ?? ''}
                          data-changed={p.key in changed || undefined}
                          error={errors[p.key]}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            setTyped((prev) => ({ ...prev, [p.key]: value }));
                          }}
                        />
                      </td>
                      <td>
                        {p.is_default ? null : (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            title="Varsayılana dön"
                            onClick={() => setTyped((prev) => ({ ...prev, [p.key]: inputText(p.default) }))}
                          >
                            varsayılan
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
      <div className={css.unitsFoot}>
        <TextInput
          size="xs"
          aria-label="Değişiklik notu"
          placeholder="Değişiklik notu (isteğe bağlı)"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          style={{ maxWidth: '26rem', flex: 1 }}
        />
        <Button size="xs" leftSection={<FaIcon icon="fas fa-save" />} loading={busy} onClick={() => void save()}>
          Kaydet
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            setTyped(initial());
            setErrors({});
          }}
        >
          Değişiklikleri geri al
        </Button>
        <Text size="xs" c="dimmed" data-testid="units-dirty">
          {nInvalid ? `${nInvalid} geçersiz değer` : nChanged ? `${nChanged} değişiklik kaydedilmedi` : ''}
        </Text>
      </div>
      {(units.changes ?? []).length ? (
        <details className={css.unitsLog}>
          <summary>Değişiklik geçmişi ({units.changes!.length})</summary>
          <table>
            <tbody>
              {units.changes!.map((c, i) => (
                <tr key={i}>
                  <td>{formatDateTime(c.changed_at)}</td>
                  <td>{c.changed_by_name}</td>
                  <td>{c.label}</td>
                  <td>
                    {inputText(c.old_value) || 'varsayılan'} → <strong>{inputText(c.new_value)}</strong>
                  </td>
                  <td style={{ color: 'var(--gk-muted)' }}>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

