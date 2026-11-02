import '@legacy/components/estimate-report/estimate-report.css';
import { loadMethodHtml } from '@legacy/components/estimator-method/estimator-method.js';
import { Button, Modal, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames } from '@/ui';
import { EstimateHtml } from '../estimate-report/EstimateHtml';
import shim from '../estimate-report/EstimateReport.module.css';

/**
 * "Tahmin nasıl çalışır?" (legacy openEstimatorMethod): the backend's method
 * text, rendered by utils/markdownLite (escape first). `fresh` refetches it
 * after a unit-time change.
 */
export function MethodModal({ fresh, onClose }: { fresh: boolean; onClose: () => void }) {
  const method = useQuery({
    queryKey: ['estimator', 'method', 'html'],
    queryFn: () => loadMethodHtml({ fresh }),
    staleTime: fresh ? 0 : Infinity,
  });
  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames}>
      <ModalHeader icon="fas fa-circle-question" title="Tahmin nasıl çalışır?" />
      <ModalBody>
        {method.data ? (
          <EstimateHtml className={`${shim.shim} est-markdown`} html={method.data} />
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
