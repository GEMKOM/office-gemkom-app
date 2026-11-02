import { Center, Loader, Modal, Tabs } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { departmentTaskQueryOptions, type DepartmentTask } from '@/api/projects/departmentTasks';
import { FaIcon, ModalBody, ModalHeader, modalClassNames, notify } from '@/ui';
import { useDepartmentTasks } from './context';
import classes from './DepartmentTasks.module.css';
import { availableTabs, type TaskTabKey } from './logic';
import { SubcontractorTab, InternalTeamTab } from './tabs/AssignmentTabs';
import { ConsultationTab } from './tabs/ConsultationTab';
import { AddSubtaskTab, BulkSubtaskTab, EditTab } from './tabs/FormTabs';
import { NcrsTab, QcReviewsTab, SubmitQcTab } from './tabs/QualityTabs';
import { ReleaseApprovalTab } from './tabs/ReleaseApprovalTab';
import { ActionTab, DeleteTab, SelfStartRevisionTab } from './tabs/SimpleTabs';

function TabContent({ tab, task }: { tab: TaskTabKey; task: DepartmentTask }): ReactNode {
  switch (tab) {
    case 'edit':
      return <EditTab task={task} />;
    case 'start':
    case 'uncomplete':
    case 'unskip':
      return <ActionTab kind={tab} task={task} />;
    case 'delete':
      return <DeleteTab task={task} />;
    case 'self-start-revision':
      return <SelfStartRevisionTab task={task} />;
    case 'add-subtask':
      return <AddSubtaskTab task={task} />;
    case 'bulk-subtask':
      return <BulkSubtaskTab task={task} />;
    case 'submit-qc':
      return <SubmitQcTab task={task} />;
    case 'qc-reviews':
      return <QcReviewsTab task={task} />;
    case 'ncrs':
      return <NcrsTab task={task} />;
    case 'subcontractor':
      return <SubcontractorTab task={task} />;
    case 'internal-team':
      return <InternalTeamTab task={task} />;
    case 'release-approval':
      return <ReleaseApprovalTab task={task} />;
    case 'consultation':
      return <ConsultationTab task={task} />;
    default:
      return <p>İşlem formu yüklenemedi</p>;
  }
}

/**
 * Legacy viewTaskDetails: "Görev İşlemleri" with one vertical tab per
 * available action. A tab mounts the first time it is opened and stays
 * mounted, so its form keeps what was typed (legacy loaded each tab once).
 */
export function TaskModal({ taskId }: { taskId: number }) {
  const { config, closeTask } = useDepartmentTasks();
  const query = useQuery(departmentTaskQueryOptions(taskId));
  const task = query.data;
  const tabs = useMemo(() => (task ? availableTabs(config, task) : []), [config, task]);
  const [active, setActive] = useState<string | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (query.isError) {
      notify.error('Görev detayları yüklenirken hata oluştu');
      closeTask();
    }
  }, [query.isError, closeTask]);

  const noTabs = Boolean(task) && tabs.length === 0;
  useEffect(() => {
    if (noTabs) {
      notify.info('Bu görev için kullanılabilir işlem bulunmamaktadır');
      closeTask();
    }
  }, [noTabs, closeTask]);

  // The open tab: the chosen one while it is still offered, else the first.
  const current = active && tabs.some((t) => t.key === active) ? active : (tabs[0]?.key ?? null);
  const shown = current && !visited.has(current) ? new Set(visited).add(current) : visited;

  if (query.isError || noTabs) return null;

  return (
    <Modal
      opened
      onClose={closeTask}
      size="xl"
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader
        title="Görev İşlemleri"
        icon="fas fa-tasks"
        subtitle={
          task ? [task.job_order, task.title].filter(Boolean).join(' · ') || undefined : undefined
        }
      />
      <ModalBody>
        {!task ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : (
          <Tabs
            orientation="vertical"
            variant="pills"
            value={current}
            onChange={(value) => {
              setActive(value);
              if (value) setVisited((prev) => new Set(prev).add(value));
            }}
            keepMounted
          >
            <Tabs.List className={classes.tabsList}>
              {tabs.map((tab) => (
                <Tabs.Tab key={tab.key} value={tab.key} leftSection={<FaIcon icon={tab.icon} />}>
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Panel key={tab.key} value={tab.key} className={classes.tabPanel}>
                {shown.has(tab.key) ? <TabContent tab={tab.key} task={task} /> : null}
              </Tabs.Panel>
            ))}
          </Tabs>
        )}
      </ModalBody>
    </Modal>
  );
}
