import { Alert, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { craneErrorText, useRejectCraneRequest } from '@/api/general/craneRequests';
import { FaIcon, FormModal, notify } from '@/ui';

const MAX = 500;

function counterColor(length: number): string {
  if (length > 450) return 'red.7';
  if (length > 400) return 'orange.7';
  return 'dimmed';
}

export interface RejectCraneRequestModalProps {
  requestId: number;
  onClose: () => void;
  /** After a successful reject (legacy also closed the details modal). */
  onRejected: () => void;
}

/** The "Vinç Talebini Reddet" modal of pending/index.html. */
export function RejectCraneRequestModal({
  requestId,
  onClose,
  onRejected,
}: RejectCraneRequestModalProps) {
  const [comment, setComment] = useState('');
  const reject = useRejectCraneRequest();

  const submit = async () => {
    try {
      await reject.mutateAsync({ id: requestId, comment: comment.trim() });
      notify.success('Vinç talebi reddedildi');
      onRejected();
      onClose();
    } catch (error) {
      notify.error(`Talep reddedilirken hata oluştu: ${craneErrorText(error)}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Vinç Talebini Reddet"
      icon="fas fa-times-circle"
      size="md"
      submitLabel={reject.isPending ? 'Reddediliyor...' : 'Reddet'}
      submitIcon="fas fa-times-circle"
      cancelLabel="İptal"
      submitting={reject.isPending}
      onSubmit={() => void submit()}
    >
      <Alert
        color="yellow"
        variant="light"
        mb="md"
        icon={<FaIcon icon="fas fa-exclamation-triangle" />}
      >
        <strong>Dikkat!</strong> Bu işlem geri alınamaz. Vinç talebini reddetmek için bir gerekçe
        belirtmeniz önerilir.
      </Alert>
      <Textarea
        label={
          <>
            <FaIcon icon="fas fa-comment-alt" style={{ marginRight: 4 }} />
            Reddetme Gerekçesi{' '}
            <Text span c="dimmed" fz="sm">
              (İsteğe bağlı)
            </Text>
          </>
        }
        rows={4}
        maxLength={MAX}
        placeholder="Vinç talebini neden reddettiğinizi açıklayın..."
        value={comment}
        onChange={(event) => setComment(event.currentTarget.value)}
      />
      <Text size="xs" mt={4} c={counterColor(comment.length)}>
        {comment.length}/{MAX} karakter
      </Text>
    </FormModal>
  );
}
