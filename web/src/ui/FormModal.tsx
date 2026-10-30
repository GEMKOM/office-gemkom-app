import { Alert, Button, Modal, type MantineSize } from '@mantine/core';
import type { FormEvent, ReactNode } from 'react';
import { FaIcon } from './FaIcon';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames } from './ModalParts';
import { errorMessage } from './notify';

export interface FormModalProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One line under the title, e.g. the record being edited. */
  subtitle?: ReactNode;
  /** Font Awesome classes, shown in the header's tile. */
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
  subtitle,
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
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader title={title} subtitle={subtitle} icon={icon} />
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitting) onSubmit(event);
        }}
      >
        <ModalBody>
          {children}
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
        </ModalBody>
        <ModalFooter>
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
        </ModalFooter>
      </form>
    </Modal>
  );
}
