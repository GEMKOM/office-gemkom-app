import { exportElementToPdf } from '@legacy/utils/pdfExport.js';
import { Loader } from '@mantine/core';
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { notify } from '@/ui';
import s from './MeetingView.module.css';

// The in-slide modal: every section drill-down (and the share dialog) opens
// over the slide, so the presentation never leaves the screen. Esc is the
// deck's (it closes the modal before it would close the deck).

export interface ModalPdf {
  /** "293-15" (also the ASCII page footer). */
  jobNo: string;
  /** "Talaşlı İmalat Detayı" */
  kindLabel: string;
  /** The job's title and customer, for the PDF's "who and when" line. */
  title?: string | null;
  customer?: string | null;
}

export interface MeetingModalProps {
  title: ReactNode;
  jobNo: string;
  onClose: () => void;
  /** The PDF button; omitted for the share dialog. */
  pdf?: ModalPdf | null;
  narrow?: boolean;
  children: ReactNode;
}

export function MeetingModal({ title, jobNo, onClose, pdf, narrow, children }: MeetingModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // The open modal as it looks on screen, but unclipped: the whole scroll
  // length, not the visible window.
  async function downloadPdf() {
    const modal = modalRef.current;
    if (!modal || !pdf) return;
    if (modal.querySelector('[data-modal-loading]')) {
      notify.info('Detay henüz yükleniyor, birazdan tekrar deneyin.');
      return;
    }
    const now = new Date();
    const subtitle = [pdf.title, pdf.customer, `GEMKOM · ${now.toLocaleDateString('tr-TR')}`]
      .filter(Boolean)
      .join(' · ');
    const fileStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setExporting(true);
    try {
      await exportElementToPdf(modal, {
        fileName: `${pdf.jobNo} ${pdf.kindLabel} ${fileStamp}`,
        orientation: 'portrait',
        captureWidth: 1000,
        captureClass: s.pdfCapture,
        stageClass: s.pdfStage,
        footerText: pdf.jobNo,
        prepare: (clone) => {
          clone.querySelectorAll('[data-modal-pdf], [data-modal-close]').forEach((el) => el.remove());
          // Who and when: the slide carries it on screen, the sheet has to
          // say it itself.
          const head = clone.querySelector('[data-modal-head]');
          if (head && subtitle) {
            const meta = document.createElement('div');
            meta.className = s.pdfMeta!;
            meta.textContent = subtitle;
            head.after(meta);
          }
        },
      });
      notify.success('PDF indirildi.');
    } catch (error) {
      console.error('PDF export failed:', error);
      notify.error('PDF oluşturulamadı.');
    } finally {
      setExporting(false);
    }
  }

  return createPortal(
    <div
      className={s.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={narrow ? `${s.modal} ${s.modalNarrow}` : s.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-modal-title"
      >
        <div className={s.modalHead} data-modal-head>
          <span className={s.modalTitle} id="pp-modal-title">
            {title} <span className={s.modalJob}>· {jobNo}</span>
          </span>
          <div className={s.modalActions}>
            {pdf ? (
              <button
                type="button"
                className={s.modalPdf}
                data-modal-pdf
                title="Detayın tamamını PDF olarak indir"
                disabled={exporting}
                onClick={() => void downloadPdf()}
              >
                {exporting ? <Loader size={12} color="gray" /> : <i className="fas fa-file-pdf" aria-hidden />} PDF
              </button>
            ) : null}
            <button type="button" className={s.modalClose} data-modal-close aria-label="Kapat" onClick={onClose}>
              <i className="fas fa-xmark" aria-hidden />
            </button>
          </div>
        </div>
        <div className={s.modalBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalLoading() {
  return (
    <div className={s.modalLoading} data-modal-loading>
      <Loader size="xs" color="gray" /> Yükleniyor...
    </div>
  );
}
