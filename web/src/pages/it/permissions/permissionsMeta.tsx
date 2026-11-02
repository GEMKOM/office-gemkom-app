import { Badge, Text, VisuallyHidden } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { departmentLabel } from '@/api/human_resources/organization';
import {
  permissionsListQueryOptions,
  permissionsMatrixQueryOptions,
  type MatrixUser,
  type PermissionEntry,
  type PermissionsMatrix,
} from '@/api/it/permissions';
import { FaIcon, StatusBadge } from '@/ui';
import css from './PermissionsPage.module.css';

/** A permission as the editors show it (legacy permissionsCatalog). */
export interface CatalogItem {
  codename: string;
  name: string;
  section: string;
}

/** The catalog, falling back to the matrix only when the list request fails. */
export function useCatalog(): { catalog: CatalogItem[]; pending: boolean } {
  const list = useQuery(permissionsListQueryOptions());
  const matrix = useQuery({ ...permissionsMatrixQueryOptions(), enabled: list.isError });
  const catalog = useMemo(() => buildCatalog(list.data, matrix.data), [list.data, matrix.data]);
  return { catalog, pending: list.isPending || (list.isError && matrix.isPending) };
}

/**
 * The catalog from GET /users/permissions/; when that fails, the matrix's
 * codenames under 'other', as legacy ensurePermissionsCatalogLoaded did.
 */
export function buildCatalog(list: PermissionEntry[] | undefined, matrix: PermissionsMatrix | undefined): CatalogItem[] {
  if (list?.length) {
    return list.map((p) => ({
      codename: p.codename,
      name: p.name || p.codename,
      section: p.section || p.portal || 'other',
    }));
  }
  return (matrix?.codenames ?? []).map((code) => ({ codename: code, name: code, section: 'other' }));
}

const SECTION_LABELS: Record<string, string> = {
  office: 'Ofis',
  workshop: 'Atölye',
  manufacturing: 'Üretim',
  sales: 'Satış',
  hr: 'İK',
  human_resources: 'İK',
  it: 'BT',
  isg: 'İSG',
  finance: 'Finans',
  other: 'Diğer',
};

export function sectionLabel(section: string | null | undefined): string {
  if (!section) return '-';
  return SECTION_LABELS[section] ?? section;
}

// Legacy Bootstrap badge colours: primary, dark, success, info, warning, secondary.
const SECTION_COLORS: Record<string, string> = {
  office: 'blue',
  workshop: 'dark',
  manufacturing: 'green',
  sales: 'cyan',
  hr: 'yellow',
  human_resources: 'yellow',
};

export function SectionBadge({ section }: { section: string }) {
  return (
    <Badge color={SECTION_COLORS[section] ?? 'gray'} variant="filled" radius="sm" tt="none">
      {sectionLabel(section)}
    </Badge>
  );
}

export function LevelPill({ level }: { level: unknown }) {
  return <span className={css.levelPill}>L{level == null || level === '' ? '-' : String(level)}</span>;
}

type PositionUser = Pick<
  MatrixUser,
  'position' | 'position_id' | 'position_title' | 'position_level' | 'position_department_code'
>;

function positionObject(user: PositionUser) {
  return user.position && typeof user.position === 'object' ? user.position : null;
}

/** "Başlık L2 · Departman", or a dash (legacy userPositionDisplay). */
export function PositionDisplay({ user }: { user: PositionUser | null | undefined }) {
  const pos = user ? positionObject(user) : null;
  const title = user?.position_title || pos?.title || null;
  if (!user || !title) {
    return (
      <Text span c="dimmed" size="sm">
        -
      </Text>
    );
  }
  const level = user.position_level || pos?.level || null;
  const dept = user.position_department_code || pos?.department_code || null;
  return (
    <span>
      {title}
      {level ? (
        <>
          {' '}
          <LevelPill level={level} />
        </>
      ) : null}
      {dept ? (
        <Text span c="dimmed" size="xs">
          {' '}
          · {departmentLabel(dept)}
        </Text>
      ) : null}
    </span>
  );
}

export function userPositionId(user: PositionUser | null | undefined): number | null {
  if (!user) return null;
  if (user.position_id != null) return Number(user.position_id);
  const pos = positionObject(user);
  if (pos?.id != null) return Number(pos.id);
  if (typeof user.position === 'number') return user.position;
  return null;
}

export function BoolIcon({ value }: { value: boolean }) {
  return (
    <StatusBadge color={value ? 'green' : 'red'}>
      <FaIcon icon={value ? 'fas fa-check' : 'fas fa-times'} />
      <VisuallyHidden>{value ? 'Var' : 'Yok'}</VisuallyHidden>
    </StatusBadge>
  );
}

/** Where an effective permission comes from (legacy formatPermSourceBadge). */
export function SourceBadge({ source, detail }: { source?: string; detail?: string }) {
  const note = detail ? (
    <Text span c="dimmed" size="xs" ml={4}>
      {detail}
    </Text>
  ) : null;
  switch (source) {
    case 'superuser':
      return (
        <>
          <StatusBadge color="red">Süper kullanıcı</StatusBadge>
          {note}
        </>
      );
    case 'override':
      return (
        <>
          <StatusBadge color="yellow">Bireysel</StatusBadge>
          {note}
        </>
      );
    case 'position':
    case 'group':
      return (
        <>
          <StatusBadge color="blue">Pozisyon</StatusBadge>
          {note}
        </>
      );
    case 'legacy':
      return (
        <>
          <StatusBadge color="grey">Eski sistem</StatusBadge>
          {note}
        </>
      );
    default:
      return <StatusBadge color="grey">Yok</StatusBadge>;
  }
}

/** Codenames with value true, or null for a superuser ("Tümü"). */
export function grantedCount(user: Pick<MatrixUser, 'is_superuser' | 'permissions'>, codenames: string[]): number | null {
  if (user.is_superuser) return null;
  return codenames.filter((code) => user.permissions?.[code]?.value === true).length;
}

export function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
