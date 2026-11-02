import { ActionIcon, Badge, Button, Center, Divider, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { useState } from 'react';
import {
  useApprovalPolicy,
  useDeleteStage,
  type ApprovalPolicy,
  type ApprovalStage,
  type UserGroupOption,
} from '@/api/it/approvalPolicies';
import { confirm, FaIcon, notify, Panel, StatusBadge } from '@/ui';
import css from './ApprovalsPage.module.css';
import { PURCHASE_REQUEST, resolverDesc } from './approvalsMeta';
import { StageFormModal } from './StageFormModal';

export interface PolicyPanelProps {
  policyId: number;
  groups: UserGroupOption[];
  onEditPolicy: (policy: ApprovalPolicy) => void;
  onDeletePolicy: (policy: ApprovalPolicy) => void;
}

/** Legacy "Silme Onayı" dialog, shared by policies and stages. */
export function confirmDelete(message: string) {
  return confirm({
    title: 'Silme Onayı',
    icon: 'fas fa-exclamation-triangle',
    message,
    confirmLabel: 'Sil',
    cancelLabel: 'Vazgeç',
    danger: true,
  });
}

/** Port of renderPolicyPanel + renderStageCard. */
export function PolicyPanel({ policyId, groups, onEditPolicy, onDeletePolicy }: PolicyPanelProps) {
  const detail = useApprovalPolicy(policyId);
  const removeStage = useDeleteStage();
  const [stageModal, setStageModal] = useState<{ stage: ApprovalStage | null } | null>(null);

  if (detail.isPending) {
    return (
      <Panel>
        <Center py="xl" c="dimmed">
          <Loader size="sm" mr="xs" /> Yükleniyor...
        </Center>
      </Panel>
    );
  }
  if (!detail.data) {
    return (
      <Panel>
        <Text c="red" size="sm">
          <FaIcon icon="fas fa-exclamation-circle" /> {detail.error?.message || 'Yüklenemedi.'}
        </Text>
      </Panel>
    );
  }

  const policy = detail.data;
  const stages = [...(policy.stages ?? [])].sort((a, b) => a.order - b.order);
  const purchase = policy.subject_type === PURCHASE_REQUEST;

  const deleteStage = async (stage: ApprovalStage) => {
    if (!(await confirmDelete(`"${stage.name}" aşamasını silmek istediğinize emin misiniz?`))) return;
    try {
      await removeStage.mutateAsync(stage.id);
      notify.success('Aşama silindi.');
    } catch (error) {
      notify.error(error, { fallback: 'Silinemedi.' });
    }
  };

  return (
    <Panel>
      <Stack gap="xs" data-testid="policy-panel">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <Text fw={700} size="lg">
              <FaIcon icon="fas fa-layer-group" color="var(--gk-red-700)" style={{ marginRight: 8 }} />
              {policy.name}
            </Text>
            <Group gap="xs" mt={4}>
              {policy.is_active ? (
                <StatusBadge color="green">Aktif</StatusBadge>
              ) : (
                <StatusBadge color="grey">Pasif</StatusBadge>
              )}
              <Badge color="gray" variant="light">
                Öncelik: {policy.selection_priority ?? '-'}
              </Badge>
            </Group>
            {purchase && policy.min_amount_eur != null ? (
              <Text size="sm" c="dimmed">
                Min: €{policy.min_amount_eur}
              </Text>
            ) : null}
            {purchase && policy.max_amount_eur != null ? (
              <Text size="sm" c="dimmed">
                Maks: €{policy.max_amount_eur}
              </Text>
            ) : null}
            {policy.is_rolling_mill ? (
              <Text size="sm" c="dimmed">
                <FaIcon icon="fas fa-industry" /> Hadde hattı
              </Text>
            ) : null}
          </div>
          <Group gap={4} wrap="nowrap">
            <Tooltip label="Politikayı düzenle" withArrow>
              <ActionIcon variant="subtle" aria-label="Politikayı düzenle" onClick={() => onEditPolicy(policy)}>
                <FaIcon icon="fas fa-edit" />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Politikayı sil" withArrow>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Politikayı sil"
                onClick={() => onDeletePolicy(policy)}
              >
                <FaIcon icon="fas fa-trash" />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        <Divider my={4} />

        <Group justify="space-between">
          <Text fw={600} size="sm">
            <FaIcon icon="fas fa-list-ol" color="var(--gk-muted)" style={{ marginRight: 6 }} />
            Aşamalar
          </Text>
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-plus" />}
            onClick={() => setStageModal({ stage: null })}
          >
            Aşama Ekle
          </Button>
        </Group>

        {stages.length === 0 ? (
          <Text size="sm" c="dimmed" py={4}>
            Henüz aşama yok.
          </Text>
        ) : (
          <div>
            {stages.map((stage) => (
              <div key={stage.id} className={css.stageCard} data-testid={`stage-${stage.id}`}>
                <div className={css.stageHead}>
                  <span className={css.orderPill}>{stage.order}</span>
                  <Text fw={600} size="sm" style={{ flex: 1 }}>
                    {stage.name}
                  </Text>
                  <Badge variant="light">{stage.required_approvals} onay gerekli</Badge>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label={`${stage.name} aşamasını düzenle`}
                    onClick={() => setStageModal({ stage })}
                  >
                    <FaIcon icon="fas fa-edit" />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    aria-label={`${stage.name} aşamasını sil`}
                    onClick={() => void deleteStage(stage)}
                  >
                    <FaIcon icon="fas fa-trash" />
                  </ActionIcon>
                </div>
                <div className={css.stageBody}>{resolverDesc(stage, groups) ?? '—'}</div>
              </div>
            ))}
          </div>
        )}
      </Stack>

      {stageModal ? (
        <StageFormModal
          key={stageModal.stage?.id ?? 'new'}
          policyId={policy.id}
          stage={stageModal.stage}
          groups={groups}
          onClose={() => setStageModal(null)}
        />
      ) : null}
    </Panel>
  );
}
