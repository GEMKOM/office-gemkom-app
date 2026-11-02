import { fetchWeldingTeams, type WeldingTeamsParams } from '@/api/welding/teams';
import { foremanName, memberNames, membersCount, type UsersById } from './teamFields';

const HEADERS = ['Ekip Adı', 'Ustabaşı', 'Üye Sayısı', 'Üyeler', 'Durum'];

function csvCell(value: unknown): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Port of legacy exportTeams: one request for up to 10000 teams with the
 * current filters and sort, written as a UTF-8 CSV (BOM for Excel).
 * Returns the row count.
 */
export async function exportWeldingTeams(
  params: Omit<WeldingTeamsParams, 'page' | 'page_size'>,
  users: UsersById,
): Promise<number> {
  const { results } = await fetchWeldingTeams({ ...params, page: 1, page_size: 10000 });
  const rows = results.map((team) => [
    team.name || '',
    foremanName(team, users),
    membersCount(team, users),
    memberNames(team, users).join(', '),
    team.is_active ? 'Aktif' : 'Pasif',
  ]);
  const csv = [HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `kaynak_ekipleri_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
  return rows.length;
}
