import {
  machiningExclusionLabel,
  REFERENCE_FAMILY,
  REFERENCE_ROUTE,
  SCHEMA_LABELS,
  STRUCTURE_CLASS_LABELS,
} from '@/api/projects/estimator';
import { exclusionLabel, fmt } from '../estimate-report/reportModel';
import { MATERIAL_LABELS } from '../estimate-report/reportParts';
import { Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type { ReferenceProfile } from '@/api/projects/references';
import { LegacyBadge } from '../estimate-report/LegacyBadge';
import css from './ReferencesPage.module.css';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span>{label}</span> <strong>{children}</strong>
    </div>
  );
}

/** The profile's facts above the weld list and the review form (legacy factsHtml). */
export function ProfileFacts({ row }: { row: ReferenceProfile }) {
  const mats = Object.entries(row.weld_m_by_material ?? {})
    .map(([m, v]) => `${MATERIAL_LABELS[m] || m} ${fmt(v, 1)} m`)
    .join(', ');
  return (
    <div className={css.facts} data-testid="profile-facts">
      <Fact label="Aile">{REFERENCE_FAMILY[row.family ?? ''] || row.family || '—'}</Fact>
      <Fact label="Güzergâh">{REFERENCE_ROUTE[row.route ?? '']?.label || row.route || '—'}</Fact>
      {(row.subcontracted_kg_share ?? 0) > 0 ? (
        <Fact label="Taşeronda kaynaklanan">kilonun %{fmt((row.subcontracted_kg_share ?? 0) * 100, 0)}'i</Fact>
      ) : null}
      <Fact label="Adet">{fmt(row.quantity, 0)}</Fact>
      <Fact label="Birim kütle">{fmt(row.unit_mass_kg, 0)} kg</Fact>
      <Fact label="Kaynak">
        {fmt(row.weld_m_total, 1)} m{mats ? ` (${mats})` : ''}
      </Fact>
      <Fact label="Birleşim">{fmt(row.joints_total, 0)}</Fact>
      <Fact label="Kayıtlı">
        {fmt(row.recorded_welding_h_per_unit, 1)} h/adet (toplam {fmt(row.recorded_welding_h_total, 0)} h)
      </Fact>
      <Fact label="Plan atölye">
        {fmt(row.shop_h_per_unit ?? row.bottom_up_h_per_unit, 1)} h/adet
        {row.total_h_per_unit != null ? (
          <Text span c="dimmed" size="sm">
            {' '}
            (toplam {fmt(row.total_h_per_unit, 1)})
          </Text>
        ) : null}
      </Fact>
      <Fact label="Faktör">{row.factor == null ? '—' : fmt(row.factor, 2)}</Fact>
      {row.in_house_exclusion ? <Fact label="Kalibrasyon">{exclusionLabel(row.in_house_exclusion)}</Fact> : null}
      {row.mach_h_per_unit != null ? (
        <Fact label="Plan talaşlı">
          {fmt(row.mach_h_per_unit, 1)} h/adet
          {row.recorded_machining_h_per_unit != null ? (
            <Text span c="dimmed" size="sm">
              {' '}
              (kayıtlı {fmt(row.recorded_machining_h_per_unit, 1)})
            </Text>
          ) : null}
        </Fact>
      ) : null}
      <Fact label="Talaşlı faktörü">
        {row.factor_mach != null && !row.machining_exclusion ? (
          fmt(row.factor_mach, 2)
        ) : (
          <Text span c="dimmed" size="sm">
            — {machiningExclusionLabel(row.machining_exclusion) || 'kullanılmaz'}
          </Text>
        )}
      </Fact>
      {row.structure_class ? (
        <Fact label="Sınıf">
          {row.structure_class_label || STRUCTURE_CLASS_LABELS[row.structure_class] || row.structure_class}{' '}
          {row.schema_version != null ? <LegacyBadge entry={SCHEMA_LABELS[Number(row.schema_version) >= 2 ? 2 : 1]} /> : null}
        </Fact>
      ) : null}
      {row.plan_confidence != null ? <Fact label="Plan güveni">%{fmt(Number(row.plan_confidence) * 100, 0)}</Fact> : null}
    </div>
  );
}
