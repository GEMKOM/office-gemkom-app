import { Box, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { weldingJobCostDetailQueryOptions } from '@/api/welding/jobCosts';
import { DataTable, DetailModal, FaIcon, notify, type DetailSection } from '@/ui';
import { euro, hours, userCostColumns } from './columns';
import { aggregateUsers, userDetailSummary } from './costAnalysis';

export interface UserDetailsModalProps {
  jobNo: string;
  /** The report's work-date range, so the detail totals reconcile with the row. */
  dateAfter?: string;
  dateBefore?: string;
  onClose: () => void;
}

const saat = (value: number) => `${hours(value)} saat`;

/** Legacy showUserDetails: the job's entries summed per user. */
export function UserDetailsModal({ jobNo, dateAfter, dateBefore, onClose }: UserDetailsModalProps) {
  const detail = useQuery(
    weldingJobCostDetailQueryOptions({
      job_no: jobNo,
      date_after: dateAfter,
      date_before: dateBefore,
    }),
  );

  useEffect(() => {
    if (!detail.isError) return;
    notify.error('Kullanıcı detayları yüklenirken bir hata oluştu.');
    onClose();
  }, [detail.isError, onClose]);

  const users = useMemo(() => aggregateUsers(detail.data?.entries ?? []), [detail.data]);

  let sections: DetailSection[];
  if (!detail.data) {
    // Room for the loading overlay until the entries arrive.
    sections = [{ content: <Box mih={160} /> }];
  } else {
    const summary = userDetailSummary(detail.data, users);
    sections = [
      {
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        fields: [
          { label: 'Toplam Kullanıcı', value: summary.totalUsers, type: 'number', span: 3 },
          { label: 'Toplam Maliyet', render: euro(summary.totalCost), span: 3 },
          { label: 'Mesai Maliyeti', render: euro(summary.overtimeCost), span: 3 },
          { label: 'Saat Başı Maliyet', render: euro(summary.costPerHour), span: 3 },
          { label: 'Hafta İçi Saat', render: saat(summary.weekdayHours), span: 3 },
          { label: 'Mesai Saat', render: saat(summary.afterHours), span: 3 },
          { label: 'Pazar Saat', render: saat(summary.sundayHours), span: 3 },
          { label: 'Toplam Saat', render: saat(summary.totalHours), span: 3 },
        ],
      },
      users.length > 0
        ? {
            content: (
              <DataTable
                title="Kullanıcı Detayları"
                icon="fas fa-users"
                data={users}
                columns={userCostColumns}
                getRowId={(row) => row.key}
                sortable
                pagination
              />
            ),
          }
        : {
            title: 'Kullanıcı Detayları',
            icon: 'fas fa-table',
            content: (
              <Text c="dimmed" ta="center" py="lg" size="sm">
                <FaIcon icon="fas fa-info-circle" /> Bu iş için kullanıcı detayı bulunamadı.
              </Text>
            ),
          },
    ];
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`${jobNo} - Kullanıcı Detayları`}
      icon="fas fa-users"
      size={1140}
      loading={detail.isPending}
      sections={sections}
    />
  );
}
