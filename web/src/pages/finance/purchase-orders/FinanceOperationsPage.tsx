import { Button } from '@mantine/core';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { FaIcon, PageHeader } from '@/ui';
import classes from './FinanceOperations.module.css';
import { AdhocCostsTab } from './tabs/AdhocCostsTab';
import { DbsTab } from './tabs/DbsTab';
import { ExpensesTab } from './tabs/ExpensesTab';
import { LoansTab } from './tabs/LoansTab';
import { PurchaseOrdersTab } from './tabs/PurchaseOrdersTab';
import { ReceiptsTab } from './tabs/ReceiptsTab';
import { TaxesTab } from './tabs/TaxesTab';

export type FinanceTab = 'po' | 'dbs' | 'expenses' | 'loans' | 'taxes' | 'adhoc-costs' | 'receipts';

const TABS: { tab: FinanceTab; label: string; icon: string }[] = [
  { tab: 'po', label: 'Satın Alma Siparişleri', icon: 'fas fa-shopping-cart' },
  { tab: 'dbs', label: 'DBS Tedarikçileri', icon: 'fas fa-university' },
  { tab: 'expenses', label: 'Aylık Giderler', icon: 'fas fa-calendar-alt' },
  { tab: 'loans', label: 'Krediler', icon: 'fas fa-hand-holding-usd' },
  { tab: 'taxes', label: 'Vergiler', icon: 'fas fa-file-invoice-dollar' },
  { tab: 'adhoc-costs', label: 'Ek Giderler', icon: 'fas fa-briefcase' },
  { tab: 'receipts', label: 'Beklenen Tahsilatlar', icon: 'fas fa-hand-holding-usd' },
];

export function readTab(value: string | null): FinanceTab {
  return TABS.some((t) => t.tab === value) ? (value as FinanceTab) : 'po';
}

/**
 * The red band and the tab buttons above every tab. Each tab passes its own
 * header buttons (legacy updateFinanceHeaderForTab: Dışa Aktar on orders,
 * a create button elsewhere).
 */
export function FinanceHeader({ tab, actions }: { tab: FinanceTab; actions?: ReactNode }) {
  const navigate = useNavigate();
  // Each tab starts from its own default filters, so switching drops the others' params.
  const open = (next: FinanceTab) => navigate({ search: next === 'po' ? '' : `?tab=${next}` });
  return (
    <>
      <PageHeader
        title="Finans İşlemleri"
        subtitle="Ödemeler, tahsilatlar, giderler ve finansal kayıtlar"
        icon="coins"
        backTo="/finance"
        actions={actions}
      />
      <div className={classes.switcher}>
        <Button.Group aria-label="Görünüm seçimi" className={classes.tabs}>
          {TABS.map(({ tab: t, label, icon }) => (
            <Button
              key={t}
              size="xs"
              variant={t === tab ? 'filled' : 'default'}
              aria-pressed={t === tab}
              leftSection={<FaIcon icon={icon} />}
              onClick={() => open(t)}
            >
              {label}
            </Button>
          ))}
        </Button.Group>
      </div>
    </>
  );
}

/** A create button for the band (legacy header createButtonText). */
export function CreateButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={onClick}>
      {label}
    </Button>
  );
}

/**
 * Finans İşlemleri (port of finance/purchase-orders): purchase orders and
 * their payments, DBS suppliers, monthly expenses, loans, taxes, ad-hoc job
 * costs and expected receipts, one tab each.
 *
 *   /finance/purchase-orders/                  orders (status filter, payments)
 *   /finance/purchase-orders/?order=<id>       an order's details (e-mail and Neo links)
 *   /finance/purchase-orders/?tab=<tab>        another tab
 */
export function FinanceOperationsPage() {
  const [search] = useSearchParams();
  const tab = readTab(search.get('tab'));
  switch (tab) {
    case 'dbs':
      return <DbsTab />;
    case 'expenses':
      return <ExpensesTab />;
    case 'loans':
      return <LoansTab />;
    case 'taxes':
      return <TaxesTab />;
    case 'adhoc-costs':
      return <AdhocCostsTab />;
    case 'receipts':
      return <ReceiptsTab />;
    default:
      return <PurchaseOrdersTab />;
  }
}
