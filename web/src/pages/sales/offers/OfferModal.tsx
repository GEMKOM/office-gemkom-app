import { Button, Center, Loader, Modal, Tabs } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  approvalStatusQueryOptions,
  offerQueryOptions,
  type OfferDetail,
} from '@/api/sales/offers';
import { EstimateReport } from '@/pages/projects/estimate-report/EstimateReport';
import { FaIcon, ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import { useOffers } from './context';
import { TAB_LABELS, type OfferTab } from './logic';
import css from './OffersPage.module.css';
import { ApprovalTab } from './tabs/ApprovalTab';
import { ConsultationsTab } from './tabs/ConsultationsTab';
import { FilesTab } from './tabs/FilesTab';
import { GenelTab } from './tabs/GenelTab';
import { ItemsTab } from './tabs/ItemsTab';
import { PricingTab } from './tabs/PricingTab';

const TAB_ICONS: Record<OfferTab, string> = {
  genel: 'fas fa-info-circle',
  kalemler: 'fas fa-list',
  dosyalar: 'fas fa-paperclip',
  consultations: 'fas fa-comments',
  pricing: 'fas fa-coins',
  approval: 'fas fa-check-double',
  tahmin: 'fas fa-calculator',
};

interface FooterSlot {
  target: HTMLElement | null;
  active: boolean;
}

const FooterSlotContext = createContext<FooterSlot>({ target: null, active: false });

/**
 * A tab's buttons in the modal footer (legacy getOfferModalFooterHtml): only
 * the open tab's show, between the decision buttons and Kapat.
 */
export function TabFooter({ children }: { children: ReactNode }) {
  const { target, active } = useContext(FooterSlotContext);
  return active && target ? createPortal(children, target) : null;
}

export interface TabProps {
  offer: OfferDetail;
}

function TabContent({ tab, offer }: { tab: OfferTab; offer: OfferDetail }) {
  switch (tab) {
    case 'genel':
      return <GenelTab offer={offer} />;
    case 'kalemler':
      return <ItemsTab offer={offer} />;
    case 'dosyalar':
      return <FilesTab offer={offer} />;
    case 'consultations':
      return <ConsultationsTab offer={offer} />;
    case 'pricing':
      return <PricingTab offer={offer} />;
    case 'approval':
      return <ApprovalTab offer={offer} />;
    case 'tahmin':
      // The drawing-based estimate (estimator app); only view_estimates holders get the tab.
      return <EstimateReport subject={{ offerId: offer.id }} />;
  }
}

export interface OfferModalProps {
  offerId: number;
  tab: OfferTab;
  estimatesAllowed: boolean;
  onTabChange: (tab: OfferTab) => void;
  onClose: () => void;
}

/**
 * Legacy viewOffer: "<no> — <title>" with a tab per area. A tab mounts the
 * first time it is opened and stays mounted, so typed changes survive a tab
 * switch; its data refetches whenever an action changes the offer.
 */
export function OfferModal({
  offerId,
  tab,
  estimatesAllowed,
  onTabChange,
  onClose,
}: OfferModalProps) {
  const { openDialog } = useOffers();
  const query = useQuery(offerQueryOptions(offerId));
  const offer = query.data;
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const [visited, setVisited] = useState<ReadonlySet<OfferTab>>(() => new Set([tab]));
  const shown = visited.has(tab) ? visited : new Set(visited).add(tab);
  if (shown !== visited) setVisited(shown);

  // The approval tab's payload says whether this user may decide now; the offer itself says so too.
  const approval = useQuery({
    ...approvalStatusQueryOptions(offerId),
    enabled: shown.has('approval'),
  });
  const canDecide = approval.data
    ? approval.data.current_user_can_decide === true
    : offer?.needs_my_approval === true;

  useEffect(() => {
    if (query.isError && !query.data) {
      notify.error('Teklif yüklenirken hata oluştu');
      onClose();
    }
  }, [query.isError, query.data, onClose]);

  const tabs = (Object.keys(TAB_LABELS) as OfferTab[]).filter(
    (t) => t !== 'tahmin' || estimatesAllowed,
  );

  return (
    <Modal
      opened
      onClose={onClose}
      size="min(1400px, 96vw)"
      withCloseButton={false}
      closeOnClickOutside={false}
      classNames={modalClassNames}
    >
      <ModalHeader
        title={offer ? `${offer.offer_no} — ${offer.title || 'Teklif'}` : 'Teklif Detayı'}
        icon="fas fa-file-invoice-dollar"
      />
      <ModalBody>
        {!offer ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : (
          <Tabs
            value={tab}
            onChange={(value) => value && onTabChange(value as OfferTab)}
            keepMounted
          >
            <Tabs.List mb="md">
              {tabs.map((t) => (
                <Tabs.Tab key={t} value={t} leftSection={<FaIcon icon={TAB_ICONS[t]} />}>
                  {TAB_LABELS[t]}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            {tabs.map((t) => (
              <Tabs.Panel key={t} value={t}>
                <FooterSlotContext.Provider value={{ target: footer, active: t === tab }}>
                  {shown.has(t) ? <TabContent tab={t} offer={offer} /> : null}
                </FooterSlotContext.Provider>
              </Tabs.Panel>
            ))}
          </Tabs>
        )}
      </ModalBody>
      <ModalFooter>
        {offer && canDecide ? (
          <>
            <Button
              color="green"
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => openDialog({ kind: 'approve', offerId })}
            >
              Onayla
            </Button>
            <Button
              color="red"
              leftSection={<FaIcon icon="fas fa-times" />}
              onClick={() => openDialog({ kind: 'reject', offerId })}
            >
              Reddet
            </Button>
          </>
        ) : null}
        <div ref={setFooter} className={css.footerSlot} />
        <Button variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={onClose}>
          Kapat
        </Button>
      </ModalFooter>
    </Modal>
  );
}
