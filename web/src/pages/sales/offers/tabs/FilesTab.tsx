import { Button } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { deleteOfferFile, offerFilesQueryOptions, useInvalidateOffers } from '@/api/sales/offers';
import { downloadFilesAsZip, FaIcon, FileAttachments, notify } from '@/ui';
import { FileUploadModal } from '../dialogs/FileUploadModal';
import { isClosed } from '../logic';
import { TabFooter, type TabProps } from '../OfferModal';
import { EmptyState, ErrorText, toAttachment } from '../parts';

/** Legacy Dosyalar: the offer's files; uploads go through the Dosya Yükle form (type, name, note). */
export function FilesTab({ offer }: TabProps) {
  const files = useQuery(offerFilesQueryOptions(offer.id));
  const invalidate = useInvalidateOffers();
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const closed = isClosed(offer.status);
  const list = files.data ?? [];

  const downloadAll = async () => {
    if (!list.length) {
      notify.warning('İndirilecek dosya yok');
      return;
    }
    setZipping(true);
    notify.info('Dosyalar indiriliyor...');
    try {
      const result = await downloadFilesAsZip(
        list.map(toAttachment),
        String(offer.offer_no || offer.id || offer.title || 'Teklif'),
        'Teklif',
      );
      if (result.status === 'nothing-added')
        notify.warning('Zip içine eklenecek geçerli dosya bulunamadı');
      else if (result.status === 'done')
        notify.success(`${result.count} dosya zip olarak indirildi`);
      else notify.warning('İndirilecek dosya yok');
    } catch (error) {
      console.error('Error creating zip file:', error);
      notify.error('Zip dosyası oluşturulurken hata oluştu');
    } finally {
      setZipping(false);
    }
  };

  return (
    <>
      {files.isError ? (
        <ErrorText>Dosyalar yüklenemedi.</ErrorText>
      ) : !files.isPending && !list.length ? (
        <EmptyState icon="fas fa-folder-open">Henüz dosya yüklenmemiş.</EmptyState>
      ) : (
        <FileAttachments
          title="Dosyalar"
          layout="list"
          files={list.map(toAttachment)}
          loading={files.isPending}
          readOnly={closed}
          onDelete={async (file) => {
            try {
              await deleteOfferFile(offer.id, file.id ?? '');
              notify.success('Dosya silindi');
              await invalidate();
            } catch (error) {
              console.error('Error deleting offer file:', error);
              notify.error('Dosya silinirken hata oluştu');
            }
          }}
        />
      )}

      {uploading ? (
        <FileUploadModal offerId={offer.id} onClose={() => setUploading(false)} />
      ) : null}

      <TabFooter>
        {!closed ? (
          <>
            <Button
              color="green"
              loading={zipping}
              leftSection={<FaIcon icon="fas fa-download" />}
              onClick={() => void downloadAll()}
            >
              Tümünü İndir (ZIP)
            </Button>
            <Button
              leftSection={<FaIcon icon="fas fa-upload" />}
              onClick={() => setUploading(true)}
            >
              Dosya Yükle
            </Button>
          </>
        ) : null}
      </TabFooter>
    </>
  );
}
