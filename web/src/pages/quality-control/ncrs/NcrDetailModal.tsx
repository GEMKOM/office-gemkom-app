import type { LegacyUser } from '@legacy/authService.js';
import { ActionIcon, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useDeleteNcrFile,
  useNcr,
  useNcrFiles,
  type Ncr,
  type NcrGroup,
} from '@/api/quality-control/ncrs';
import { formatDateTime } from '@/lib/format';
import {
  confirm,
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
} from '@/ui';
import {
  downloadFile,
  downloadFilesAsZip,
  fileIcon,
  normalizeNcrFile,
  type NcrFileView,
} from './ncrFiles';
import { NcrPaperForm } from './NcrPaperForm';
import classes from './ncrs.module.css';
import {
  canDecideNcrs,
  canSubmit,
  isSubmitted,
  nextAction,
  qcReviewId,
  statusLabel,
  teamDisplayName,
} from './ncrRules';
import { NcrFileUploadModal } from './NcrWorkflowModals';

function openFile(file: NcrFileView) {
  if (!file.url) {
    notify.warning('Dosya URL bulunamadı');
    return;
  }
  window.open(file.url, '_blank', 'noopener');
}

function FileList({
  ncrId,
  files,
  state,
}: {
  ncrId: number;
  files: NcrFileView[];
  state: 'loading' | 'error' | 'ready';
}) {
  const remove = useDeleteNcrFile();
  if (state === 'loading') {
    return (
      <Text size="sm" c="dimmed" ta="center" py="sm">
        <Loader size="xs" mr={8} />
        Dosyalar yükleniyor...
      </Text>
    );
  }
  if (state === 'error') {
    return (
      <Text size="sm" c="red" py="xs">
        Dosyalar yüklenemedi.
      </Text>
    );
  }
  if (files.length === 0) {
    return (
      <Text size="sm" c="dimmed" py="xs">
        Henüz dosya yok.
      </Text>
    );
  }

  const deleteFile = async (file: NcrFileView) => {
    if (!file.id) {
      notify.warning('Dosya ID bulunamadı');
      return;
    }
    const ok = await confirm({
      title: 'Dosya Sil',
      message: 'Bu dosyayı silmek istiyor musunuz?',
      details: file.fileName,
      confirmLabel: 'Sil',
      icon: 'fas fa-trash',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync({ ncrId, fileId: file.id });
      notify.success('Dosya silindi');
    } catch (error) {
      console.error('Error deleting NCR file:', error);
      notify.error('Dosya silinirken hata oluştu');
    }
  };

  return (
    <Stack gap={4}>
      {files.map((file) => (
        <div key={file.id} className={classes.fileRow}>
          <FaIcon icon={fileIcon(file.fileName)} />
          <a
            href={file.url || undefined}
            className={classes.fileName}
            title={file.fileName}
            onClick={(event) => {
              event.preventDefault();
              openFile(file);
            }}
          >
            {file.fileName}
          </a>
          {file.typeLabel ? <span className={classes.fileMeta}>{file.typeLabel}</span> : null}
          <span className={classes.fileMeta}>
            {[file.uploadedBy, file.uploadedAt ? formatDateTime(file.uploadedAt) : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className={classes.noPrint}>
            <Group gap={2} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="İndir"
                title="İndir"
                onClick={() => {
                  if (!file.url) notify.warning('Dosya URL bulunamadı');
                  else void downloadFile(file.url, file.fileName);
                }}
              >
                <FaIcon icon="fas fa-download" />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Sil"
                title="Sil"
                onClick={() => void deleteFile(file)}
              >
                <FaIcon icon="fas fa-trash" />
              </ActionIcon>
            </Group>
          </span>
        </div>
      ))}
    </Stack>
  );
}

/** Prints only the form: a copy at the body's top level while the print dialog is up. */
function usePrint() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => {
      document.body.classList.remove('ncr-printing');
      setPrinting(false);
    };
    document.body.classList.add('ncr-printing');
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('ncr-printing');
    };
  }, [printing]);
  return { printing, print: () => setPrinting(true) };
}

export interface NcrDetailModalProps {
  ncrId: number;
  currentUser: LegacyUser;
  groups: NcrGroup[];
  /** Hidden (not unmounted) while a follow-up modal opened from it is up. */
  hidden?: boolean;
  onLoaded?: (ncr: Ncr) => void;
  onClose: () => void;
  onEdit: (ncr: Ncr) => void;
  onSubmit: (ncr: Ncr) => void;
  onDecide: (ncr: Ncr, approve: boolean) => void;
}

/** Port of showNCRDetails: the NCR as a paper form, its files and the workflow buttons. */
export function NcrDetailModal({
  ncrId,
  currentUser,
  groups,
  hidden = false,
  onLoaded,
  onClose,
  onEdit,
  onSubmit,
  onDecide,
}: NcrDetailModalProps) {
  const detail = useNcr(ncrId);
  const filesQuery = useNcrFiles(ncrId, detail.isSuccess);
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const { printing, print } = usePrint();
  const ncr = detail.data;

  useEffect(() => {
    if (!detail.isError) return;
    notify.error('NCR detayları yüklenirken hata oluştu');
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.isError]);

  useEffect(() => {
    if (ncr) onLoaded?.(ncr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncr]);

  const files = (filesQuery.data ?? []).map(normalizeNcrFile);
  const fileState = filesQuery.isError ? 'error' : filesQuery.isPending ? 'loading' : 'ready';

  const downloadAll = async () => {
    if (!ncr) return;
    setZipping(true);
    try {
      const fresh = await filesQuery.refetch();
      if (fresh.isError) throw fresh.error;
      const list = (fresh.data ?? []).map(normalizeNcrFile);
      if (list.length === 0) {
        notify.warning('İndirilecek dosya yok');
        return;
      }
      notify.info('Dosyalar indiriliyor...');
      const result = await downloadFilesAsZip(list, String(ncr.ncr_number || ncr.id));
      if (result.status === 'nothing-added')
        notify.warning('Zip içine eklenecek geçerli dosya bulunamadı');
      else if (result.status === 'done')
        notify.success(`${result.count} dosya zip olarak indirildi`);
    } catch (error) {
      console.error('Error loading files for download:', error);
      notify.error('Dosyalar yüklenirken hata oluştu');
    } finally {
      setZipping(false);
    }
  };

  const decide = canDecideNcrs(currentUser);
  const showDecision = Boolean(ncr && decide && isSubmitted(ncr));
  const showSubmit = Boolean(ncr && canSubmit(currentUser, ncr));

  const form = (forPrint: boolean) =>
    ncr ? (
      <NcrPaperForm
        ncr={ncr}
        statusLabel={statusLabel(ncr)}
        teamName={teamDisplayName(ncr, groups)}
        qcReviewId={qcReviewId(ncr)}
        next={nextAction(ncr, currentUser, groups)}
        forPrint={forPrint}
        attachments={
          <>
            <Group justify="flex-end" gap="xs" mb="sm" className={classes.noPrint}>
              <Button
                size="xs"
                variant="default"
                loading={zipping}
                leftSection={<FaIcon icon="fas fa-download" />}
                onClick={() => void downloadAll()}
              >
                Tümünü İndir (ZIP)
              </Button>
              <Button
                size="xs"
                variant="default"
                leftSection={<FaIcon icon="fas fa-upload" />}
                onClick={() => setUploading(true)}
              >
                Dosya Yükle
              </Button>
            </Group>
            <FileList ncrId={ncr.id} files={files} state={fileState} />
          </>
        }
      />
    ) : null;

  return (
    <>
      <Modal
        opened={!hidden}
        onClose={onClose}
        fullScreen
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader
          title={ncr ? ncr.ncr_number || `NCR #${ncr.id}` : 'NCR'}
          subtitle={ncr?.title}
          icon="fas fa-file-alt"
        />
        <ModalBody>
          {ncr ? (
            <div className={classes.formBackdrop}>{form(false)}</div>
          ) : (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={onClose}>
            Kapat
          </Button>
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-print" />}
            disabled={!ncr}
            onClick={print}
          >
            Yazdır
          </Button>
          {ncr && decide ? (
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-edit" />}
              onClick={() => onEdit(ncr)}
            >
              Düzenle
            </Button>
          ) : null}
          {ncr && showSubmit ? (
            <Button
              leftSection={<FaIcon icon="fas fa-paper-plane" />}
              onClick={() => onSubmit(ncr)}
            >
              Onaya Gönder
            </Button>
          ) : null}
          {ncr && showDecision ? (
            <>
              <Button
                variant="default"
                color="red"
                leftSection={<FaIcon icon="fas fa-times" />}
                onClick={() => onDecide(ncr, false)}
              >
                Reddet
              </Button>
              <Button
                leftSection={<FaIcon icon="fas fa-check" />}
                onClick={() => onDecide(ncr, true)}
              >
                Onayla
              </Button>
            </>
          ) : null}
        </ModalFooter>
      </Modal>

      {uploading && ncr ? (
        <NcrFileUploadModal
          ncrId={ncr.id}
          onClose={(uploaded) => {
            setUploading(false);
            if (uploaded) void filesQuery.refetch();
          }}
        />
      ) : null}

      {printing && ncr
        ? createPortal(<div className={classes.printRoot}>{form(true)}</div>, document.body)
        : null}
    </>
  );
}
