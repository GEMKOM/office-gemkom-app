import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  offerErrorMessage,
  runOfferAction,
  useInvalidateOffers,
  type OfferAction,
  type OfferDetail,
} from '@/api/sales/offers';
import { confirm, notify } from '@/ui';
import type { OfferTab } from './logic';

/**
 * The page's modals besides the offer itself. They stack: the convert modal
 * can open the customer editor on top of it, and closing pops the top one.
 */
export type OfferDialog =
  | { kind: 'create' }
  | { kind: 'edit'; offer: OfferDetail }
  | { kind: 'submit-approval'; offerId: number }
  | { kind: 'decision'; offerId: number }
  | { kind: 'approve'; offerId: number }
  | { kind: 'reject'; offerId: number }
  | { kind: 'convert'; offerId: number }
  | { kind: 'customer'; customerId: number };

export interface OffersContextValue {
  /** Opens the offer modal (writes offer_no and tab to the URL). */
  openOffer: (offer: { id: number; offer_no: string }, tab?: OfferTab) => void;
  openDialog: (dialog: OfferDialog) => void;
  closeDialog: () => void;
  /** Confirm, run, toast and refetch a bodiless workflow action. */
  runAction: (offerId: number, action: OfferAction) => Promise<void>;
}

const OffersContext = createContext<OffersContextValue | null>(null);

export function useOffers(): OffersContextValue {
  const value = useContext(OffersContext);
  if (!value) throw new Error('useOffers outside OffersProvider');
  return value;
}

const ACTIONS: Record<
  OfferAction,
  {
    title: string;
    icon: string;
    message: string;
    confirmLabel: string;
    success: string;
    error: string;
  }
> = {
  'submit-customer': {
    title: 'Müşteriye Gönder',
    icon: 'fas fa-paper-plane',
    message: 'Teklifi müşteriye göndermek istediğinize emin misiniz?',
    confirmLabel: 'Gönder',
    success: 'Müşteriye gönderildi',
    error: 'Gönderim hatası',
  },
  'mark-won': {
    title: 'Onay',
    icon: 'fas fa-exclamation-triangle',
    message: 'Teklifi kazanıldı olarak işaretlemek istediğinize emin misiniz?',
    confirmLabel: 'Evet',
    success: 'Kazanıldı olarak işaretlendi',
    error: 'İşlem hatası',
  },
  'mark-lost': {
    title: 'Onay',
    icon: 'fas fa-exclamation-triangle',
    message: 'Teklifi kaybedildi olarak işaretlemek istediğinize emin misiniz?',
    confirmLabel: 'Evet',
    success: 'Kaybedildi olarak işaretlendi',
    error: 'İşlem hatası',
  },
  cancel: {
    title: 'Onay',
    icon: 'fas fa-exclamation-triangle',
    message: 'Teklifi iptal etmek istediğinize emin misiniz?',
    confirmLabel: 'Evet',
    success: 'Teklif iptal edildi',
    error: 'İptal hatası',
  },
  'revert-won': {
    title: 'Kazanıldıyı Geri Al',
    icon: 'fas fa-undo',
    message:
      'Teklif kazanıldı işaretinden çıkarılacak ve önceki duruma (müşteriye sunuldu veya onaylandı) dönecek. Devam etmek istiyor musunuz?',
    confirmLabel: 'Evet',
    success: 'Kazanıldı işareti geri alındı',
    error: 'Geri alma hatası',
  },
};

export function OffersProvider({
  openOffer,
  children,
}: {
  openOffer: OffersContextValue['openOffer'];
  children: (dialogs: OfferDialog[]) => ReactNode;
}) {
  const [dialogs, setDialogs] = useState<OfferDialog[]>([]);
  const invalidate = useInvalidateOffers();

  const openDialog = useCallback((dialog: OfferDialog) => setDialogs((d) => [...d, dialog]), []);
  const closeDialog = useCallback(() => setDialogs((d) => d.slice(0, -1)), []);

  const runAction = useCallback(
    async (offerId: number, action: OfferAction) => {
      const spec = ACTIONS[action];
      const ok = await confirm({
        title: spec.title,
        icon: spec.icon,
        message: spec.message,
        confirmLabel: spec.confirmLabel,
        cancelLabel: 'İptal',
        danger: true,
      });
      if (!ok) return;
      try {
        await runOfferAction(offerId, action);
        notify.success(spec.success);
        await invalidate();
      } catch (error) {
        notify.error(offerErrorMessage(error, spec.error));
      }
    },
    [invalidate],
  );

  const value = useMemo(
    () => ({ openOffer, openDialog, closeDialog, runAction }),
    [openOffer, openDialog, closeDialog, runAction],
  );
  return <OffersContext.Provider value={value}>{children(dialogs)}</OffersContext.Provider>;
}
