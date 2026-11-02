import { Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import { useRejectRevision, type RevisionRequestTask } from '@/api/design/revisionRequests';
import { FormModal, ModalSection, notify } from '@/ui';

const rejectSchema = z.object({
  reason: z.string().refine((v) => v.trim() !== '', 'Reddetme nedeni gereklidir'),
});

type RejectValues = z.infer<typeof rejectSchema>;

export interface RejectRevisionModalProps {
  task: RevisionRequestTask;
  onClose: () => void;
  /** After a successful reject (the page also closes the details modal). */
  onRejected: () => void;
}

/** Port of the legacy reject EditModal. Mount it when it should open. */
export function RejectRevisionModal({ task, onClose, onRejected }: RejectRevisionModalProps) {
  const form = useForm<RejectValues>({
    initialValues: { reason: '' },
    validate: zod4Resolver(rejectSchema),
  });
  const reject = useRejectRevision();
  const request = task.pending_revision_request;

  const save = async ({ reason }: RejectValues) => {
    if (!request?.release_id) {
      // Legacy did nothing here; say why instead.
      notify.error('Revizyon talebi bilgisi bulunamadı');
      return;
    }
    try {
      await reject.mutateAsync({
        releaseId: request.release_id,
        topic_id: request.topic_id,
        reason: reason.trim(),
      });
      notify.success('Revizyon talebi başarıyla reddedildi');
      onRejected();
    } catch (error) {
      console.error('Error rejecting revision:', error);
      notify.error(`Revizyon talebi reddedilirken hata oluştu: ${(error as Error).message}`);
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="Revizyon Talebini Reddet"
      subtitle={[task.job_order, task.title].filter(Boolean).join(' · ') || undefined}
      icon="fas fa-times-circle"
      size="md"
      submitLabel="Reddet"
      submitIcon="fas fa-times"
      submitting={reject.isPending}
      onSubmit={form.onSubmit(save)}
    >
      <ModalSection title="Reddetme Nedeni" icon="fas fa-times-circle">
        <Textarea
          label="Reddetme Nedeni"
          placeholder="Reddetme nedenini açıklayın..."
          description="Reddetme nedenini detaylı olarak açıklayın"
          withAsterisk
          rows={3}
          {...form.getInputProps('reason')}
        />
      </ModalSection>
    </FormModal>
  );
}
