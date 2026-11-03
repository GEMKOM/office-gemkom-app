import { Button, Modal, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { estimatorMethodQueryOptions } from '@/api/projects/estimator';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames } from '@/ui';
import estCss from '../estimate-report/EstimateReport.module.css';
import { Markdown } from '../estimate-report/Markdown';

/**
 * "Tahmin nasıl çalışır?" (legacy openEstimatorMethod): the backend's method
 * text, rendered as markdown. `fresh` refetches it after a unit-time change.
 */
export function MethodModal({ fresh, onClose }: { fresh: boolean; onClose: () => void }) {
  const method = useQuery({ ...estimatorMethodQueryOptions(), staleTime: fresh ? 0 : Infinity });
  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader icon="fas fa-circle-question" title="Tahmin nasıl çalışır?" />
      <ModalBody>
        {method.data != null ? (
          <div className={estCss.scope}>
            <div className="est-markdown">
              <Markdown source={method.data} />
            </div>
          </div>
        ) : method.isError ? (
          <Text size="sm" c="red">
            {method.error instanceof Error ? method.error.message : 'Açıklama yüklenemedi'}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Yükleniyor…
          </Text>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>
          Kapat
        </Button>
      </ModalFooter>
    </Modal>
  );
}
