import { Alert, Button, Modal, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import {
  approveOvertimeRequest,
  rejectOvertimeRequest,
  type OvertimeRequest,
} from '@/api/general/overtime';
import {
  confirm,
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
} from '@/ui';
import { actionError, RequestSummary } from './shared';

const COMMENT_MAX = 500;

/**
 * Port of showApproveOvertimeModal + confirmApproveOvertime: asks, approves
 * (unticked entries go as rejected_entry_ids, a partial approval), refreshes.
 * Resolves true when the request was approved.
 */
export async function approveOvertimeWithConfirm(
  request: OvertimeRequest,
  rejectedEntryIds: number[],
  invalidate: () => Promise<void>,
): Promise<boolean> {
  const ok = await confirm({
    title: 'Mesai Talebi Onayı',
    icon: 'fas fa-check-circle',
    message: 'Bu mesai talebini onaylamak istediğinizden emin misiniz?',
    details: <RequestSummary request={request} />,
    confirmLabel: 'Evet, Onayla',
    cancelLabel: 'İptal',
  });
  if (!ok) return false;
  try {
    await approveOvertimeRequest(request.id, { rejected_entry_ids: rejectedEntryIds });
    notify.success(
      rejectedEntryIds.length > 0
        ? `Mesai talebi kısmi olarak onaylandı (${rejectedEntryIds.length} kalem reddedildi)`
        : 'Mesai talebi başarıyla onaylandı',
    );
    await invalidate();
    return true;
  } catch (error) {
    notify.error(
      `Mesai talebi onaylanırken hata oluştu: ${actionError(error, 'Onaylama işlemi başarısız')}`,
    );
    return false;
  }
}

export interface RejectOvertimeModalProps {
  request: OvertimeRequest;
  onClose: () => void;
  /** After a successful reject (the details modal closes too). */
  onRejected: () => void;
  invalidate: () => Promise<void>;
}

/** Port of the #rejectOvertimeModal in pending/index.html. Mount it to open it. */
export function RejectOvertimeModal({
  request,
  onClose,
  onRejected,
  invalidate,
}: RejectOvertimeModalProps) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const length = comment.length;
  const counterColor = length > 450 ? 'red.8' : length > 400 ? 'orange.7' : 'dimmed';

  const submit = async () => {
    setSubmitting(true);
    try {
      await rejectOvertimeRequest(request.id, comment.trim());
      notify.success('Mesai talebi başarıyla reddedildi');
      await invalidate();
      onRejected();
    } catch (error) {
      notify.error(
        `Mesai talebi reddedilirken hata oluştu: ${actionError(error, 'Reddetme işlemi başarısız')}`,
      );
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened
      onClose={() => {
        if (!submitting) onClose();
      }}
      size={500}
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader
        tone="danger"
        icon="fas fa-times-circle"
        title="Mesai Talebini Reddet"
        subtitle={`#${request.id}`}
      />
      <ModalBody>
        <Alert
          color="yellow"
          variant="light"
          icon={<FaIcon icon="fas fa-exclamation-triangle" />}
          mb="md"
        >
          <strong>Dikkat!</strong> Bu işlem geri alınamaz. Mesai talebini reddetmek için bir gerekçe
          belirtmeniz önerilir.
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
          placeholder="Mesai talebini neden reddettiğinizi açıklayın..."
          rows={4}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(event) => setComment(event.currentTarget.value)}
        />
        <Text size="xs" c={counterColor} mt={4}>
          {length}/{COMMENT_MAX} karakter
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
          onClick={() => void submit()}
          leftSection={<FaIcon icon="fas fa-times-circle" />}
        >
          Reddet
        </Button>
      </ModalFooter>
    </Modal>
  );
}
