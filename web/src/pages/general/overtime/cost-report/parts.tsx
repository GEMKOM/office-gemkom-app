import { Anchor, Group, Progress, Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { FaIcon, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { fmtEur, fmtShare, NO_JOB_LABEL, type CostNums } from './costReport';

// Cells and small tables the cost report page and its modals share.

export function JobNo({ jobNo }: { jobNo: string | null | undefined }) {
  const value = (jobNo ?? '').trim();
  if (!value)
    return (
      <Text span c="dimmed" size="sm">
        -
      </Text>
    );
  return <span className={uiClasses.code}>{value}</span>;
}

/** The job-tree link that opens the job detail; the no-job bucket is a link too. */
export function JobLink({ jobNo, onOpen }: { jobNo: string; onOpen: () => void }) {
  return (
    <Anchor
      component="button"
      type="button"
      underline="never"
      onClick={(event) => {
        // The group header toggles on click; the link only opens the detail.
        event.stopPropagation();
        onOpen();
      }}
    >
      {jobNo ? (
        <span className={uiClasses.code}>{jobNo}</span>
      ) : (
        <Text span c="dimmed" size="sm">
          {NO_JOB_LABEL}
        </Text>
      )}
    </Anchor>
  );
}

export function ShareBar({ value, color }: { value: number; color: string }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Progress
        value={Math.min(100, value)}
        color={color}
        size={6}
        miw={60}
        style={{ flexGrow: 1 }}
      />
      <Text size="xs" c="dimmed">
        {fmtShare(value)}
      </Text>
    </Group>
  );
}

export function BucketLabel({
  icon,
  color,
  label,
}: {
  icon: string;
  color: string;
  label: string;
}) {
  return (
    <Group gap={8} wrap="nowrap" component="span">
      <Text span c={color}>
        <FaIcon icon={icon} />
      </Text>
      {label}
    </Group>
  );
}

export const COST_HEADERS = ['Ücret', 'SGK / İşveren', 'Toplam Maliyet'];

/** Ücret | SGK / İşveren | Toplam Maliyet — the total is the bold one. */
export function costCells(r: CostNums): ReactNode[] {
  return [
    fmtEur(r.wage_cost_eur),
    <Text key="employer" span size="sm" c="dimmed">
      {fmtEur(r.employer_cost_eur)}
    </Text>,
    <strong key="total">{fmtEur(r.cost_eur)}</strong>,
  ];
}

/** Ücret | SGK / İşveren Payı | Toplam Maliyet as table columns. */
export function costColumns<T extends CostNums>({
  sortable = true,
  bold = () => true,
}: {
  sortable?: boolean;
  bold?: (row: T) => boolean;
} = {}): DataTableColumn<T>[] {
  return [
    {
      key: 'wage_cost_eur',
      header: 'Ücret',
      sortable,
      align: 'right',
      render: (row) => fmtEur(row.wage_cost_eur),
      exportFormat: '#,##0.00',
    },
    {
      key: 'employer_cost_eur',
      header: 'SGK / İşveren Payı',
      sortable,
      align: 'right',
      render: (row) => (
        <Text span size="sm" c="dimmed">
          {fmtEur(row.employer_cost_eur)}
        </Text>
      ),
      exportFormat: '#,##0.00',
    },
    {
      key: 'cost_eur',
      header: 'Toplam Maliyet',
      sortable,
      align: 'right',
      render: (row) => (bold(row) ? <strong>{fmtEur(row.cost_eur)}</strong> : fmtEur(row.cost_eur)),
      exportFormat: '#,##0.00',
    },
  ];
}

/** The small read-only tables of the detail modals; `alignEnd` marks numeric columns. */
export function SimpleTable({
  headers,
  rows,
  alignEnd = [],
  empty = 'Kayıt yok',
  foot,
  hover = true,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  alignEnd?: boolean[];
  empty?: ReactNode;
  foot?: ReactNode;
  hover?: boolean;
}) {
  return (
    <Table.ScrollContainer minWidth={600}>
      <Table highlightOnHover={hover} verticalSpacing="xs" fz="sm">
        <Table.Thead>
          <Table.Tr>
            {headers.map((h, i) => (
              <Table.Th key={i} ta={alignEnd[i] ? 'right' : undefined}>
                {h}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length ? (
            rows.map((cells, r) => (
              <Table.Tr key={r}>
                {cells.map((c, i) => (
                  <Table.Td key={i} ta={alignEnd[i] ? 'right' : undefined}>
                    {c}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))
          ) : (
            <Table.Tr>
              <Table.Td colSpan={headers.length} ta="center" c="dimmed" py="md">
                {empty}
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
        {foot ? <Table.Tfoot bg="var(--mantine-color-gray-0)">{foot}</Table.Tfoot> : null}
      </Table>
    </Table.ScrollContainer>
  );
}
