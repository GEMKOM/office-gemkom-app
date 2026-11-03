import { useMemo } from 'react';
import type { WeldJoint } from '@/api/projects/estimator';
import { DataTable, type DataTableColumn } from '@/ui';
import css from './EstimateReport.module.css';
import { JOINT_TYPE_LABELS, MATERIAL_LABELS, processLabel, SourcePill } from './reportParts';
import { fmt } from './reportModel';

/** çizim / çıkarım / kural: where a joint came from, styled like the Tahmin card wherever it is shown. */
export function SourceBadge({ source }: { source: string | null | undefined }) {
  return (
    <span className={css.scope}>
      <SourcePill source={source || 'drawn'} />
    </span>
  );
}

/**
 * The weld list of one unit (legacy weldColumns + TableComponent). Plan joints
 * (schema 2) add Alt montaj and Kaynak (çizim / çıkarım / kural).
 */
export function WeldTable({ joints }: { joints: WeldJoint[] }) {
  const columns = useMemo<DataTableColumn<WeldJoint>[]>(() => {
    const hasSub = joints.some((j) => j?.sub_id);
    const hasSource = joints.some((j) => j?.source);
    return [
      { key: 'joint_id', header: 'No', width: 60 },
      ...(hasSub ? [{ key: 'sub_id', header: 'Alt montaj', width: 80 } satisfies DataTableColumn<WeldJoint>] : []),
      { key: 'description', header: 'Birleşim', sortable: false },
      ...(hasSource
        ? [
            {
              key: 'source',
              header: 'Kaynak',
              width: 84,
              render: (j) => <SourceBadge source={j.source} />,
            } satisfies DataTableColumn<WeldJoint>,
          ]
        : []),
      { key: 'joint_type', header: 'Tip', accessor: (j) => JOINT_TYPE_LABELS[j.joint_type ?? ''] ?? j.joint_type ?? '' },
      { key: 'material', header: 'Malzeme', accessor: (j) => MATERIAL_LABELS[j.material ?? ''] ?? j.material ?? '' },
      { key: 'size', header: 'Ölçü', sortable: false },
      { key: 'process', header: 'Proses', sortable: false, accessor: (j) => processLabel(j.process) },
      { key: 'count_per_unit', header: 'Adet', align: 'right' },
      {
        key: 'length_m_each',
        header: 'm / birleşim',
        align: 'right',
        render: (j) => fmt(j.length_m_each, 3),
      },
      {
        key: 'total_m_per_unit',
        header: 'm toplam',
        align: 'right',
        render: (j) => fmt(j.total_m_per_unit, 2),
      },
      { key: 'ndt', header: 'NDT' },
    ];
  }, [joints]);

  return (
    <DataTable
      data={joints}
      columns={columns}
      getRowId={(j, i) => `${j.joint_id ?? ''}-${i}`}
      sortable
      emptyMessage="Birleşim yok"
      verticalSpacing="xs"
    />
  );
}
