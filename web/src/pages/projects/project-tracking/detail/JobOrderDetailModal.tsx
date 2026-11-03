import { Button, Center, Loader, Modal, Tabs } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { jobOrderQueryOptions } from '@/api/projects/jobOrders';
import { EstimateReport } from '@/pages/projects/estimate-report/EstimateReport';
import { FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import { useJobOrderPermissions } from '../jobOrderActions';
import { DesignTab } from './DesignTab';
import { FilesSection } from './FilesTab';
import { GenelTab, type ChildJob } from './GenelTab';
import css from './JobOrderDetail.module.css';
import { PriceTiersTab } from './PriceTiersTab';
import { QualityTab } from './QualityTab';
import { TasksTab } from './TasksTab';
import { TopicDetailModal } from './TopicDetailModal';
import { TopicsSection } from './TopicsSection';

export { TopicDetailModal, releaseReviewUrl } from './TopicDetailModal';

type DetailTab =
  | 'genel'
  | 'gorevler'
  | 'dizayn'
  | 'kalite'
  | 'dosyalar-tartismalar'
  | 'taseron'
  | 'tahmin';

const TABS: { value: DetailTab; label: string; icon: string }[] = [
  { value: 'genel', label: 'Genel', icon: 'fas fa-info-circle' },
  { value: 'gorevler', label: 'Görevler', icon: 'fas fa-tasks' },
  { value: 'dizayn', label: 'Dizayn', icon: 'fas fa-drafting-compass' },
  { value: 'kalite', label: 'Kalite', icon: 'fas fa-clipboard-check' },
  { value: 'dosyalar-tartismalar', label: 'Dosyalar & Tartışmalar', icon: 'fas fa-paperclip' },
  { value: 'taseron', label: 'Fiyat ve Ağırlık', icon: 'fas fa-weight-hanging' },
  { value: 'tahmin', label: 'Tahmin', icon: 'fas fa-calculator' },
];

export interface JobOrderDetailModalProps {
  /** The job order shown; null renders nothing. */
  jobNo: string | null;
  /** Open this discussion topic on top once the job is loaded (`?job_no=X&topic_id=Y`). */
  topicId?: number | null;
  onClose: () => void;
  /**
   * A topic was opened (its id) or closed (null) inside the modal, so the page
   * can keep `topic_id` in the URL as legacy did.
   */
  onTopicChange?: (topicId: number | null) => void;
}

function DetailContent({
  jobNo,
  topicId,
  onClose,
  onTopicChange,
}: JobOrderDetailModalProps & { jobNo: string }) {
  const { canViewSubcontracting, canViewEstimates } = useJobOrderPermissions();
  const query = useQuery(jobOrderQueryOptions(jobNo));
  const job = query.data as ChildJob | undefined;

  const [tab, setTab] = useState<DetailTab>('genel');
  // Tabs load on first open and stay mounted (legacy lazy loaders + tab cache).
  const [visited, setVisited] = useState<ReadonlySet<DetailTab>>(() => new Set(['genel']));
  const selectTab = (next: DetailTab) => {
    setTab(next);
    setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
  };

  // The topic shown on top; follows the `topicId` prop when it changes.
  const [openTopic, setOpenTopic] = useState<number | null>(topicId ?? null);
  const [topicProp, setTopicProp] = useState(topicId ?? null);
  if ((topicId ?? null) !== topicProp) {
    setTopicProp(topicId ?? null);
    setOpenTopic(topicId ?? null);
  }
  const showTopic = useCallback(
    (id: number | null) => {
      setOpenTopic(id);
      onTopicChange?.(id);
    },
    [onTopicChange],
  );

  useEffect(() => {
    if (query.isError && !query.data) {
      notify.error('İş emri bilgileri yüklenirken hata oluştu');
      onClose();
    }
  }, [query.isError, query.data, onClose]);

  const tabs = TABS.filter(
    (t) =>
      (t.value !== 'taseron' || canViewSubcontracting) && (t.value !== 'tahmin' || canViewEstimates),
  );

  const panel = (value: DetailTab) => {
    if (!job) return null;
    switch (value) {
      case 'genel':
        return <GenelTab job={job} />;
      case 'gorevler':
        return <TasksTab jobNo={job.job_no} />;
      case 'dizayn':
        return <DesignTab jobNo={job.job_no} />;
      case 'kalite':
        return <QualityTab jobNo={job.job_no} />;
      case 'dosyalar-tartismalar':
        return (
          <div className={css.split}>
            <FilesSection jobNo={job.job_no} />
            <TopicsSection jobNo={job.job_no} openTopic={showTopic} />
          </div>
        );
      case 'taseron':
        return <PriceTiersTab job={job} onClose={onClose} />;
      case 'tahmin':
        // The drawing-based cost and risk report; it loads and polls itself.
        return <EstimateReport subject={{ jobNo: job.job_no }} />;
    }
  };

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        fullScreen
        withCloseButton={false}
        closeOnClickOutside={false}
        classNames={modalClassNames}
      >
        <ModalHeader
          title={`İş Emri Detayları: ${job?.job_no ?? jobNo}`}
          icon="fas fa-info-circle"
        />
        <ModalBody>
          {!job ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : (
            <Tabs value={tab} onChange={(value) => value && selectTab(value as DetailTab)} keepMounted>
              <Tabs.List mb="md">
                {tabs.map((t) => (
                  <Tabs.Tab key={t.value} value={t.value} leftSection={<FaIcon icon={t.icon} />}>
                    {t.label}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {tabs.map((t) => (
                <Tabs.Panel key={t.value} value={t.value}>
                  {visited.has(t.value) ? panel(t.value) : null}
                </Tabs.Panel>
              ))}
            </Tabs>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={onClose}>
            Kapat
          </Button>
        </ModalFooter>
      </Modal>
      {job && openTopic !== null ? (
        <TopicDetailModal topicId={openTopic} jobNo={job.job_no} onClose={() => showTopic(null)} />
      ) : null}
    </>
  );
}

/**
 * İş Emri Detayları (legacy window.viewJobOrder): a full-screen modal with a
 * tab per area. Page-level actions (edit, revise the target date, open another
 * job) go through useJobOrderActions(); opening a child or a phase's source job
 * calls actions.view(), which swaps the job shown here.
 */
export function JobOrderDetailModal({
  jobNo,
  topicId,
  onClose,
  onTopicChange,
}: JobOrderDetailModalProps) {
  if (!jobNo) return null;
  // A new job starts on Genel with nothing loaded (legacy cleared its tab cache).
  return (
    <DetailContent
      key={jobNo}
      jobNo={jobNo}
      topicId={topicId}
      onClose={onClose}
      onTopicChange={onTopicChange}
    />
  );
}
