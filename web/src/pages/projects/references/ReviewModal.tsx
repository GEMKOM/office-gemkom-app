import { REFERENCE_REVIEW } from '@/api/projects/estimator';
import { Button, Modal, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { reviewReferenceProfile, type ReferenceProfile } from '@/api/projects/references';
import { errorMessage, FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames } from '@/ui';
import { LegacyBadge } from '../estimate-report/LegacyBadge';
import { ExclusionHistory } from './costHistoryParts';
import { ProfileFacts } from './ProfileFacts';
import css from './ReferencesPage.module.css';

export type ReviewStatus = 'verified' | 'excluded' | 'unreviewed';

const REVIEW_TEXT: Record<ReviewStatus, { title: string; icon: string; color: string; label: string; hint: string; placeholder: string }> = {
  verified: {
    title: 'Doğrula',
    icon: 'fas fa-check',
    color: 'green',
    label: 'Doğrula',
    hint: 'Kaynak listesi ve kayıtlı saatler kontrol edildi. Hesabı değiştirmez; doğrulanmış ve incelenmemiş referanslar aynı şekilde kullanılır.',
    placeholder: 'İsteğe bağlı not (ör. kaynak listesi pafta 3 ile karşılaştırıldı)',
  },
  excluded: {
    title: 'Hariç tut',
    icon: 'fas fa-ban',
    color: 'red',
    label: 'Hariç tut',
    hint: 'Bu iş hiçbir tahminde (iç imalat ve taşeron), aile faktör dağılımında ve hold-out kontrolünde kullanılmaz. Geri alınabilir.',
    placeholder: 'Neden? (zorunlu — ör. saatler üst iş emrine yazılmış, kaynak listesi eksik okunmuş)',
  },
  unreviewed: {
    title: 'İncelemeyi geri al',
    icon: 'fas fa-rotate-left',
    color: 'gray',
    label: 'Geri al',
    hint: 'Referans yeniden “İncelenmedi” olur ve (hariç tutulmuşsa) tahminlerde tekrar kullanılır.',
    placeholder: 'İsteğe bağlı not',
  },
};

export interface ReviewModalProps {
  row: ReferenceProfile;
  status: ReviewStatus;
  onClose: () => void;
  onSaved: (updated: ReferenceProfile) => void;
}

/** Doğrula / Hariç tut / İncelemeyi geri al (legacy openReview). */
export function ReviewModal({ row, status, onClose, onSaved }: ReviewModalProps) {
  const t = REVIEW_TEXT[status];
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const text = note.trim();
    if (status === 'excluded' && !text) {
      setError('Hariç tutmak için not gerekli.');
      return;
    }
    setSaving(true);
    try {
      onSaved(await reviewReferenceProfile(row.job_no, status, text));
    } catch (e) {
      const noteError = isApiError(e) ? (e.data as { note?: string[] } | undefined)?.note?.[0] : undefined;
      setError(noteError || errorMessage(e, 'Kaydedilemedi'));
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} size="xl" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader icon={t.icon} title={`${t.title}: ${row.job_no} — ${row.title || ''}`} />
      <ModalBody>
        <ProfileFacts row={row} />
        <ExclusionHistory notes={row.exclusion_notes} effect={row.exclusion_effect} />
        <div className={css.hint}>{t.hint}</div>
        <Text size="sm" mb="xs">
          Şu anki durum: <LegacyBadge entry={REFERENCE_REVIEW[row.review_status || ''] ?? REFERENCE_REVIEW.unreviewed} />
          {row.review_note ? ` — ${row.review_note}` : ''}
          {row.reviewed_by_name ? (
            <Text span c="dimmed" size="sm">
              {' '}
              ({row.reviewed_by_name})
            </Text>
          ) : null}
        </Text>
        <Textarea
          aria-label="İnceleme notu"
          rows={3}
          placeholder={t.placeholder}
          value={note}
          onChange={(event) => {
            setNote(event.currentTarget.value);
            setError('');
          }}
          data-autofocus
        />
        {error ? <div className={css.error}>{error}</div> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose} disabled={saving}>
          Vazgeç
        </Button>
        <Button color={t.color} leftSection={<FaIcon icon={t.icon} />} loading={saving} onClick={() => void save()}>
          {t.label}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
