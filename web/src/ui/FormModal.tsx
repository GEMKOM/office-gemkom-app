import { Alert, Box, Button, Group, Modal, Text, type MantineSize } from '@mantine/core';
import type { FormEvent, ReactNode } from 'react';
import { FaIcon } from './FaIcon';
import { errorMessage } from './notify';

export interface FormModalProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: string;
  /** Default 'lg'. */
  size?: MantineSize | number | string;
  /**
   * The form's submit handler; pass `form.onSubmit(save)` from @mantine/form
   * so validation runs first. Enter in a field submits too.
   */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Disables the buttons and keeps the modal open (e.g. mutation.isPending). */
  submitting?: boolean;
  /** A message, or the caught error (its `.message` is shown). */
  error?: unknown;
  submitLabel?: ReactNode;
  /** Font Awesome classes. Default 'fas fa-save'. */
  submitIcon?: string;
  cancelLabel?: ReactNode;
  submitDisabled?: boolean;
  /** Extra buttons, left of İptal. */
  footerActions?: ReactNode;
  children: ReactNode;
}

/**
 * Replaces components/edit-modal. The page owns the form:
 *
 *   const form = useForm({ initialValues, validate: zod4Resolver(schema) });
 *   const save = useMutation({ mutationFn: api.update, onSuccess: close });
 *   <FormModal opened={opened} onClose={close} title="Düzenle"
 *     onSubmit={form.onSubmit((values) => save.mutate(values))}
 *     submitting={save.isPending} error={save.error}>
 *     <TextInput label="Ad" {...form.getInputProps('name')} />
 *   </FormModal>
 */
export function FormModal({
  opened,
  onClose,
  title,
  icon,
  size = 'lg',
  onSubmit,
  submitting = false,
  error,
  submitLabel = 'Kaydet',
  submitIcon = 'fas fa-save',
  cancelLabel = 'İptal',
  submitDisabled = false,
  footerActions,
  children,
}: FormModalProps) {
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!submitting) onClose();
      }}
      size={size}
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      title={
        <Text fw={600}>
          {icon ? <FaIcon icon={icon} style={{ marginRight: 8 }} /> : null}
          {title}
        </Text>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitting) onSubmit(event);
        }}
      >
        <Box>{children}</Box>
        {hasError ? (
          <Alert
            color="red"
            variant="light"
            mt="md"
            icon={<FaIcon icon="fas fa-exclamation-circle" />}
          >
            {typeof error === 'string' ? error : errorMessage(error, 'Kaydedilemedi')}
          </Alert>
        ) : null}
        <Group justify="flex-end" mt="md" gap="xs">
          {footerActions}
          <Button
            variant="default"
            onClick={onClose}
            disabled={submitting}
            leftSection={<FaIcon icon="fas fa-times" />}
          >
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={submitDisabled}
            leftSection={<FaIcon icon={submitIcon} />}
          >
            {submitLabel}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
