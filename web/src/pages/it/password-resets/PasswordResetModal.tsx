import { Alert, Button, CopyButton, Grid, Modal, Stack, Text, Tooltip } from '@mantine/core';
import { useState } from 'react';
import { isApiError } from '@/api';
import { useAdminResetPassword, type PasswordResetRequest } from '@/api/it/passwordResets';
import { FaIcon, ModalBody, ModalFooter, ModalHeader, ModalSection, modalClassNames } from '@/ui';

type Stage = { kind: 'confirm' } | { kind: 'done'; tempPassword: string } | { kind: 'error'; message: string };

function Field({ label, value, span = 6 }: { label: string; value: string; span?: number }) {
  return (
    <Grid.Col span={{ base: 12, sm: span }}>
      <Text size="xs" c="dimmed" fw={500} mb={2}>
        {label}
      </Text>
      <Text size="sm">{value || '-'}</Text>
    </Grid.Col>
  );
}

/** Legacy performPasswordReset: the backend's `detail`, else a fixed message. */
function resetErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const detail = (error.data as { detail?: unknown } | undefined)?.detail;
    return typeof detail === 'string' && detail ? detail : 'Şifre sıfırlanamadı';
  }
  return 'Şifre sıfırlanırken hata oluştu';
}

export interface PasswordResetModalProps {
  user: PasswordResetRequest;
  onClose: () => void;
}

/**
 * Port of the DisplayModal flow in password-resets.js: confirm, then the
 * one-time temporary password, or the error with a way back to the list.
 */
export function PasswordResetModal({ user, onClose }: PasswordResetModalProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'confirm' });
  const reset = useAdminResetPassword();

  const run = async () => {
    try {
      const data = await reset.mutateAsync(user.id);
      setStage({ kind: 'done', tempPassword: data?.temp_password ?? '' });
    } catch (error) {
      console.error('Password reset error:', error);
      setStage({ kind: 'error', message: resetErrorMessage(error) });
    }
  };

  const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  const groups = user.user_groups ?? [];

  const header =
    stage.kind === 'confirm' ? (
      <ModalHeader title="Şifre Sıfırlama Onayı" icon="fas fa-exclamation-triangle" />
    ) : stage.kind === 'done' ? (
      <ModalHeader title="Şifre Başarıyla Sıfırlandı" icon="fas fa-check-circle" />
    ) : (
      <ModalHeader title="Şifre Sıfırlama Hatası" icon="fas fa-exclamation-circle" tone="danger" />
    );

  return (
    <Modal
      opened
      onClose={() => {
        if (!reset.isPending) onClose();
      }}
      size="md"
      withCloseButton={false}
      classNames={modalClassNames}
    >
      {header}
      <ModalBody>
        {stage.kind === 'confirm' ? (
          <>
            <ModalSection title="Onay Gerekli" icon="fas fa-exclamation-triangle">
              <Alert color="yellow" variant="light" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
                <strong>{user.username}</strong> kullanıcısının şifresini sıfırlamak istediğinizden emin misiniz?
              </Alert>
            </ModalSection>
            <ModalSection title="Kullanıcı Bilgileri" icon="fas fa-user">
              <Grid gap="sm">
                <Field label="Kullanıcı Adı" value={user.username} />
                <Field label="Ad Soyad" value={fullName} />
                <Field label="E-posta" value={user.email ?? ''} span={12} />
                {groups.length > 0 ? <Field label="Gruplar" value={groups.join(', ')} span={12} /> : null}
              </Grid>
            </ModalSection>
          </>
        ) : stage.kind === 'done' ? (
          <Stack gap="md">
            <ModalSection title="İşlem Başarılı" icon="fas fa-check-circle">
              <Alert color="green" variant="light" icon={<FaIcon icon="fas fa-check-circle" />}>
                <strong>{user.username}</strong> kullanıcısının şifresi başarıyla sıfırlandı.
              </Alert>
            </ModalSection>
            <ModalSection title="Yeni Geçici Şifre" icon="fas fa-key">
              <Text size="xs" c="dimmed" fw={500} mb={2}>
                Geçici Şifre
              </Text>
              <CopyButton value={stage.tempPassword}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Kopyalandı' : 'Kopyalamak için tıklayın'} withArrow>
                    <Text
                      ff="monospace"
                      fw={600}
                      size="lg"
                      onClick={copy}
                      style={{ cursor: 'copy' }}
                      data-testid="temp-password"
                    >
                      {stage.tempPassword}
                    </Text>
                  </Tooltip>
                )}
              </CopyButton>
            </ModalSection>
            <Alert color="blue" variant="light" icon={<FaIcon icon="fas fa-info-circle" />}>
              Bu şifreyi kullanıcıya güvenli bir şekilde iletin. Kullanıcı ilk girişinde yeni şifre belirleyecektir.
            </Alert>
            <Alert color="yellow" variant="light" icon={<FaIcon icon="fas fa-exclamation-triangle" />}>
              <strong>Önemli:</strong> Bu şifre sadece bir kez gösterilir. Kullanıcıya mutlaka iletin.
            </Alert>
          </Stack>
        ) : (
          <ModalSection title="Hata Oluştu" icon="fas fa-exclamation-circle">
            <Stack gap="sm">
              <Alert color="red" variant="light" icon={<FaIcon icon="fas fa-exclamation-circle" />}>
                <strong>Hata:</strong> {stage.message}
              </Alert>
              <Alert color="blue" variant="light" icon={<FaIcon icon="fas fa-info-circle" />}>
                Lütfen tekrar deneyin veya sistem yöneticisi ile iletişime geçin.
              </Alert>
            </Stack>
          </ModalSection>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="default"
          onClick={onClose}
          disabled={reset.isPending}
          leftSection={<FaIcon icon="fas fa-times" />}
        >
          Kapat
        </Button>
        {stage.kind === 'confirm' ? (
          <Button
            color="yellow"
            loading={reset.isPending}
            onClick={() => void run()}
            leftSection={<FaIcon icon="fas fa-key" />}
          >
            Şifreyi Sıfırla
          </Button>
        ) : (
          // Legacy "Tamam" / "Tekrar Dene" both close; the reset starts again from the table.
          <Button onClick={onClose}>{stage.kind === 'done' ? 'Tamam' : 'Tekrar Dene'}</Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
