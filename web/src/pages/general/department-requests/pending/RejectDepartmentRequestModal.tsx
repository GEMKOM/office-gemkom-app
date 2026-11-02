import { Alert, Button, Modal, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames } from '@/ui';

const MAX = 500;

function counterColor(length: number): string {
  if (length > 450) return 'red.7';
  if (length > 400) return 'orange.7';
  return 'dimmed';
}

export interface RejectDepartmentRequestModalProps {
  onClose: () => void;
  /** Resolves when done; the modal stays open while it runs. */
  onReject: (comment: string) => Promise<void>;
  submitting: boolean;
}

/** The rejection-comment modal from pending/index.html. Mount it when it should open. */
export function RejectDepartmentRequestModal({
  onClose,
  onReject,
  submitting,
}: RejectDepartmentRequestModalProps) {
  const [comment, setComment] = useState('');
  return (
    <Modal
      opened
      onClose={() => {
        if (!submitting) onClose();
      }}
      withCloseButton={false}
      classNames={modalClassNames}
      size="md"
    >
      <ModalHeader tone="danger" icon="fas fa-times-circle" title="Departman Talebini Reddet" />
      <ModalBody>
        <Alert
          color="yellow"
          variant="light"
          icon={<FaIcon icon="fas fa-exclamation-triangle" />}
          mb="md"
        >
          <strong>Dikkat!</strong> Bu işlem geri alınamaz. Departman talebini reddetmek için bir
          gerekçe belirtmeniz önerilir.
        </Alert>
        <Textarea
          label={
            <>
              Reddetme Gerekçesi{' '}
              <Text span c="dimmed" size="sm">
                (İsteğe bağlı)
              </Text>
            </>
          }
          placeholder="Departman talebini neden reddettiğinizi açıklayın..."
          rows={4}
          maxLength={MAX}
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
        />
        <Text size="xs" mt={4} c={counterColor(comment.length)}>
          {comment.length}/{MAX} karakter
        </Text>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="default"
          onClick={onClose}
          disabled={submitting}
          leftSection={<FaIcon icon="fas fa-times" />}
        >
          İptal
        </Button>
        <Button
          color="red.9"
          loading={submitting}
          leftSection={<FaIcon icon="fas fa-times-circle" />}
          onClick={() => void onReject(comment.trim())}
        >
          Reddet
        </Button>
      </ModalFooter>
    </Modal>
  );
}
