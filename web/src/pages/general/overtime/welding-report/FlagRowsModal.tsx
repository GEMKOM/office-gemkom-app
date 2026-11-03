import { Alert, Badge, Button, Group, Table, Text } from '@mantine/core';
import { formatDate } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { DetailModal, FaIcon } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import {
  FLAG_FIX,
  flagMeta,
  fmtHours,
  fmtSignedHours,
  registryDayLink,
  requestLink,
  rowsWithFlag,
  timeEntriesLink,
  type DecoratedRow,
} from './weldingReport';

function Jobs({ jobs }: { jobs: string[] }) {
  if (!jobs.length)
    return (
      <Text span c="dimmed">
        -
      </Text>
    );
  return (
    <>
      {jobs.map((job, index) => (
        <span key={`${job}-${index}`}>
          {index > 0 ? ', ' : null}
          <span className={uiClasses.code}>{job}</span>
        </span>
      ))}
    </>
  );
}

export interface FlagRowsModalProps {
  flag: string;
  rows: DecoratedRow[];
  onClose: () => void;
  /** Opens the day's comparison (the same "Detay" as the main table). */
  onOpenDay: (row: DecoratedRow) => void;
}

/** The records behind one "Sapma Dağılımı" count, each with a way to the page that fixes it. */
export function FlagRowsModal({ flag, rows, onClose, onOpenDay }: FlagRowsModalProps) {
  const meta = flagMeta(flag);
  const list = rowsWithFlag(rows, flag);
  const fix = FLAG_FIX[flag];

  return (
    <DetailModal
      opened
      onClose={onClose}
      size="xl"
      title={`${meta.label} — ${list.length} kayıt`}
      icon={meta.icon}
      sections={[
        {
          content: (
            <Alert color="blue" variant="light" icon={<FaIcon icon="fas fa-screwdriver-wrench" />}>
              <Text size="sm">
                {meta.hint}
                {fix ? (
                  <>
                    {' '}
                    <b>{fix}</b>
                  </>
                ) : null}
              </Text>
            </Alert>
          ),
        },
        {
          title: 'Kayıtlar',
          icon: 'fas fa-list',
          content: (
            <Table.ScrollContainer minWidth={760}>
              <Table striped verticalSpacing="xs" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Kaynakçı</Table.Th>
                    <Table.Th>Tarih</Table.Th>
                    <Table.Th>Talep</Table.Th>
                    <Table.Th>Talep Edilen İş</Table.Th>
                    <Table.Th>Çalışılan İş</Table.Th>
                    <Table.Th ta="right">Onaylı</Table.Th>
                    <Table.Th ta="right">İşlenen</Table.Th>
                    <Table.Th ta="right">Fark</Table.Th>
                    <Table.Th>İşlem</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td>{row.user_full_name || '-'}</Table.Td>
                      <Table.Td>{formatDate(row.date)}</Table.Td>
                      <Table.Td>
                        {row.request_ids.length ? (
                          <Group gap={4}>
                            {row.request_ids.map((id) => (
                              <Badge
                                key={id}
                                size="sm"
                                component={AppLink}
                                to={requestLink(id)}
                                style={{ cursor: 'pointer' }}
                                title="Mesai talebini aç"
                              >
                                #{id}
                              </Badge>
                            ))}
                          </Group>
                        ) : (
                          <Text span c="dimmed">
                            -
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Jobs jobs={row.planned_jobs} />
                      </Table.Td>
                      <Table.Td>
                        <Jobs jobs={row.worked_jobs} />
                      </Table.Td>
                      <Table.Td ta="right">{fmtHours(row.planned_hours)}</Table.Td>
                      <Table.Td ta="right">{fmtHours(row.logged_overtime_hours)}</Table.Td>
                      <Table.Td ta="right" fw={600} c={row.variance_hours < 0 ? 'red.8' : 'blue.7'}>
                        {fmtSignedHours(row.variance_hours)}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Button
                            size="compact-xs"
                            variant="light"
                            component={AppLink}
                            to={timeEntriesLink(row)}
                            leftSection={<FaIcon icon="fas fa-clock" />}
                          >
                            Zaman kayıtları
                          </Button>
                          {flag === 'unapproved' ? (
                            <Button
                              size="compact-xs"
                              variant="light"
                              component={AppLink}
                              to={registryDayLink(row.date)}
                              leftSection={<FaIcon icon="fas fa-calendar-plus" />}
                            >
                              Mesai talepleri
                            </Button>
                          ) : null}
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => onOpenDay(row)}
                            leftSection={<FaIcon icon="fas fa-eye" />}
                          >
                            Detay
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ),
        },
      ]}
    />
  );
}
