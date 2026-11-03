import { useEffect } from 'react';
import { useCustomer } from '@/api';
import { useInvalidateOffers } from '@/api/sales/offers';
import { CustomerFormModal } from '@/pages/sales/customers/CustomerFormModal';
import { notify } from '@/ui';
import { useOffers, type OfferDialog } from '../context';
import { ConvertModal } from './ConvertModal';
import { DecisionModal, DecisionOverviewModal, SubmitApprovalModal } from './DecisionModals';
import { OfferFormModal } from './OfferFormModal';

/** The customer editor of the Genel tab and the convert modal (legacy openCustomerEditModal). */
function CustomerEdit({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const customer = useCustomer(customerId);
  const invalidate = useInvalidateOffers();
  useEffect(() => {
    if (customer.isError) {
      notify.error('Müşteri bilgileri yüklenirken hata oluştu');
      onClose();
    }
  }, [customer.isError, onClose]);
  if (!customer.data) return null;
  // The offer shows the customer's details, so it refetches after a save.
  return (
    <CustomerFormModal
      customer={customer.data}
      onClose={onClose}
      onSaved={() => void invalidate()}
    />
  );
}

function Dialog({ dialog, onClose }: { dialog: OfferDialog; onClose: () => void }) {
  switch (dialog.kind) {
    case 'create':
      return <OfferFormModal onClose={onClose} />;
    case 'edit':
      return <OfferFormModal offer={dialog.offer} onClose={onClose} />;
    case 'submit-approval':
      return <SubmitApprovalModal offerId={dialog.offerId} onClose={onClose} />;
    case 'decision':
      return <DecisionOverviewModal offerId={dialog.offerId} onClose={onClose} />;
    case 'approve':
    case 'reject':
      return (
        <DecisionModal
          offerId={dialog.offerId}
          approve={dialog.kind === 'approve'}
          onClose={onClose}
        />
      );
    case 'convert':
      return <ConvertModal offerId={dialog.offerId} onClose={onClose} />;
    case 'customer':
      return <CustomerEdit customerId={dialog.customerId} onClose={onClose} />;
  }
}

/** The stacked page dialogs; each one closes only itself (the top of the stack). */
export function OfferDialogs({ dialogs }: { dialogs: OfferDialog[] }) {
  const { closeDialog } = useOffers();
  return (
    <>
      {dialogs.map((dialog, i) => (
        <Dialog key={`${i}-${dialog.kind}`} dialog={dialog} onClose={closeDialog} />
      ))}
    </>
  );
}
