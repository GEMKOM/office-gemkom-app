import { Button, Center, Group, Loader, NativeSelect, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { positionsQueryOptions, useAssignUserToPosition } from '@/api/human_resources/organization';
import {
  deleteUserPermissionOverride,
  saveUserPermissionOverride,
  userPermissionsQueryOptions,
  type EffectivePermission,
} from '@/api/human_resources/users';
import {
  permissionsListQueryOptions,
  refreshUserPermissions,
  type MatrixUser,
  type PermissionsMatrix,
} from '@/api/it/permissions';
import { formatDateTime } from '@/lib/format';
import { FaIcon, notify, Panel, StatusBadge } from '@/ui';
import { OverrideModal } from './OverrideModal';
import { BoolIcon, buildCatalog, PositionDisplay, SourceBadge, userPositionId } from './permissionsMeta';
import css from './PermissionsPage.module.css';

const NO_PERMISSION: EffectivePermission = { value: false, source: 'none', source_detail: '' };

interface Override {
  codename: string;
  granted: boolean;
  reason?: string;
  created_at?: string | null;
}

/** The selected user's card (legacy renderUserDetailPanel). */
export function UserPermissionsPanel({ userId, matrix }: { userId: number; matrix: PermissionsMatrix | undefined }) {
  const queryClient = useQueryClient();
  const detail = useQuery(userPermissionsQueryOptions(userId));
  const permissionsList = useQuery(permissionsListQueryOptions());
  const positions = useQuery(positionsQueryOptions());
  const assignPosition = useAssignUserToPosition();
  const [positionChoice, setPositionChoice] = useState<string | null>(null);
  const [overrideCode, setOverrideCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (detail.isError) notify.error(detail.error, { fallback: 'Kullanıcı detayları yüklenirken hata oluştu' });
  }, [detail.isError, detail.error]);

  const catalog = useMemo(() => buildCatalog(permissionsList.data, matrix), [permissionsList.data, matrix]);

  if (detail.isPending) {
    return (
      <Panel className={css.detail}>
        <Center py="lg">
          <Loader size="sm" />
        </Center>
      </Panel>
    );
  }
  if (!detail.data) {
    return (
      <Panel className={css.detail}>
        <Text c="red" ta="center" py="md" size="sm">
          Kullanıcı detayları yüklenemedi.
        </Text>
      </Panel>
    );
  }

  const data = detail.data;
  const user = (data.user ?? data) as MatrixUser;
  const superuser = Boolean(user.is_superuser);
  const effective = data.effective_permissions ?? {};
  const overrides = (Array.isArray(data.overrides) ? data.overrides : []) as Override[];
  const overrideCodes = new Set(overrides.map((o) => o.codename));
  const names = new Map(catalog.map((p) => [p.codename, p.name]));
  const allCodes = [...new Set([...catalog.map((p) => p.codename), ...Object.keys(effective)])].sort((a, b) =>
    a.localeCompare(b, 'tr'),
  );
  const codenames = allCodes.length ? allCodes : (matrix?.codenames ?? []);

  const officeOn = effective.office_access?.value === true;
  const workshopOn = effective.workshop_access?.value === true;

  const currentPositionId = userPositionId(user);
  const selectedPosition = positionChoice ?? (currentPositionId != null ? String(currentPositionId) : '');
  const positionOptions = [
    { value: '', label: 'Pozisyonu Kaldır' },
    ...(positions.data ?? []).map((p) => ({
      value: String(p.id),
      label: `${p.title} (L${p.level ?? ''})${p.department_name ? ` — ${String(p.department_name)}` : ''}`,
    })),
  ];

  // Every change reloads this user's detail and patches their row in the list.
  const run = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    setBusy(true);
    try {
      await action();
      notify.success(success);
      await refreshUserPermissions(queryClient, userId);
    } catch (error) {
      notify.error(error, { fallback });
    } finally {
      setBusy(false);
    }
  };

  const applyPosition = () => {
    const positionId = selectedPosition ? Number(selectedPosition) : null;
    void run(
      () => assignPosition.mutateAsync({ userId, positionId }),
      positionId ? 'Kullanıcının pozisyonu güncellendi.' : 'Kullanıcının pozisyonu kaldırıldı.',
      'Pozisyon güncellenirken hata oluştu',
    );
  };

  const togglePortal = (codename: 'office_access' | 'workshop_access', current: boolean) => {
    const label = codename === 'office_access' ? 'Ofis erişimi' : 'Atölye erişimi';
    void run(
      () => saveUserPermissionOverride(userId, { codename, granted: !current, reason: '' }),
      `${label} ${!current ? 'açıldı' : 'kapatıldı'}`,
      'Portal erişimi güncellenirken hata oluştu',
    );
  };

  const quick = (codename: string, grant: boolean) =>
    void run(
      () => saveUserPermissionOverride(userId, { codename, granted: grant, reason: '' }),
      grant ? `${codename} izni kullanıcıya verildi` : `${codename} izni kullanıcı için engellendi`,
      'Yetki güncellenirken hata oluştu',
    );

  const clearOverride = (codename: string, success: string, fallback: string) =>
    void run(() => deleteUserPermissionOverride(userId, codename), success, fallback);

  return (
    <Panel className={css.detail}>
      <Stack gap="md" data-testid="user-permissions">
        <div>
          <Text fw={700} size="lg">
            <FaIcon icon="fas fa-user-shield" style={{ marginRight: 8 }} />
            {String(user.full_name || user.username || '')}
          </Text>
          <Text c="dimmed" size="sm">
            @{String(user.username ?? '')}
          </Text>
        </div>

        <div>
          <div className={css.sectionTitle}>Pozisyon</div>
          <div style={{ marginBottom: 8 }}>
            <PositionDisplay user={user} />
          </div>
          <Group gap="xs" wrap="nowrap">
            <NativeSelect
              aria-label="Pozisyon seç"
              size="xs"
              style={{ flex: 1 }}
              data={positionOptions}
              value={selectedPosition}
              onChange={(event) => setPositionChoice(event.currentTarget.value)}
            />
            <Button size="xs" variant="outline" onClick={applyPosition} disabled={busy}>
              Uygula
            </Button>
          </Group>
        </div>

        <div>
          <div className={css.sectionTitle}>Portal Erişimi</div>
          <Group gap="xs">
            <Button
              size="xs"
              color={officeOn ? 'green' : 'gray'}
              variant={officeOn ? 'filled' : 'outline'}
              leftSection={<FaIcon icon="fas fa-building" />}
              disabled={busy}
              onClick={() => togglePortal('office_access', officeOn)}
            >
              Ofis: {officeOn ? 'Açık' : 'Kapalı'}
            </Button>
            <Button
              size="xs"
              color={workshopOn ? 'green' : 'gray'}
              variant={workshopOn ? 'filled' : 'outline'}
              leftSection={<FaIcon icon="fas fa-industry" />}
              disabled={busy}
              onClick={() => togglePortal('workshop_access', workshopOn)}
            >
              Atölye: {workshopOn ? 'Açık' : 'Kapalı'}
            </Button>
          </Group>
        </div>

        <div>
          <div className={css.sectionTitle}>Etkin Yetkiler</div>
          <div className={css.scroll}>
            <table className={css.miniTable}>
              <thead>
                <tr>
                  <th>Yetki</th>
                  <th>Durum</th>
                  <th>Kaynak</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {codenames.map((code) => {
                  const perm = effective[code] ?? NO_PERMISSION;
                  return (
                    <tr key={code} data-codename={code}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{names.get(code) ?? code}</div>
                        <div className={css.code}>{code}</div>
                      </td>
                      <td>
                        <BoolIcon value={perm.value === true} />
                      </td>
                      <td>
                        {superuser ? (
                          <SourceBadge source="superuser" />
                        ) : (
                          <SourceBadge source={perm.source} detail={perm.source_detail} />
                        )}
                      </td>
                      <td>
                        {superuser ? null : (
                          <Group gap={4} justify="flex-end">
                            <Button.Group>
                              <Button
                                size="compact-xs"
                                variant="outline"
                                color="green"
                                title="Bu kullanıcı için izin ver"
                                disabled={busy}
                                onClick={() => quick(code, true)}
                              >
                                Ver
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="outline"
                                color="yellow"
                                title="Bu kullanıcı için engelle"
                                disabled={busy}
                                onClick={() => quick(code, false)}
                              >
                                Engelle
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="outline"
                                color="red"
                                title="Bireysel ayarı kaldır"
                                disabled={busy || !overrideCodes.has(code)}
                                onClick={() =>
                                  clearOverride(
                                    code,
                                    `${code} için bireysel ayar kaldırıldı`,
                                    'Bireysel ayar kaldırılırken hata oluştu',
                                  )
                                }
                              >
                                Sıfırla
                              </Button>
                            </Button.Group>
                            <Button size="compact-xs" variant="subtle" onClick={() => setOverrideCode(code)}>
                              Detay
                            </Button>
                          </Group>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className={css.sectionTitle}>Bireysel Geçersiz Kılmalar</div>
          <div className={`${css.scroll} ${css.small}`}>
            <table className={css.miniTable}>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Durum</th>
                  <th>Neden</th>
                  <th>Tarih</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {overrides.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <Text c="dimmed" size="sm">
                        Bu kullanıcı için bireysel geçersiz kılma yok.
                      </Text>
                    </td>
                  </tr>
                ) : (
                  overrides.map((o) => (
                    <tr key={o.codename}>
                      <td className={css.code}>{o.codename}</td>
                      <td>
                        {o.granted ? (
                          <StatusBadge color="green">İzin</StatusBadge>
                        ) : (
                          <StatusBadge color="red">Yasak</StatusBadge>
                        )}
                      </td>
                      <td>{o.reason || '-'}</td>
                      <td>{o.created_at ? formatDateTime(o.created_at) : '-'}</td>
                      <td>
                        <Button
                          size="compact-xs"
                          variant="outline"
                          color="red"
                          disabled={busy}
                          aria-label={`${o.codename} geçersiz kılmasını sil`}
                          onClick={() =>
                            clearOverride(o.codename, 'Geçersiz kılma kaldırıldı', 'Geçersiz kılma silinirken hata oluştu')
                          }
                        >
                          Sil
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Stack>

      {overrideCode ? (
        <OverrideModal
          codename={overrideCode}
          onClose={() => setOverrideCode(null)}
          onSave={async (values) => {
            await saveUserPermissionOverride(userId, { codename: overrideCode, ...values });
            setOverrideCode(null);
            notify.success('Geçersiz kılma kaydedildi');
            await refreshUserPermissions(queryClient, userId);
          }}
        />
      ) : null}
    </Panel>
  );
}
