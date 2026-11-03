import { Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { activePaymentTermsQueryOptions } from '@/api/procurement/purchaseRequests';
import { StarRating, SupplierStatusBadge } from '@/pages/procurement/suppliers/list/supplierBadges';
import { FaIcon, StatusBadge } from '@/ui';
import { CURRENCY_SYMBOLS } from '../shared/comparison';
import classes from './CreatePurchaseRequest.module.css';
import type { PrOffer, PrSupplier } from './model';

// suppliersManager.renderSuppliers: one card per supplier.

export function SupplierCards({
  suppliers,
  offers,
  onOffer,
  onEdit,
  onDelete,
}: {
  suppliers: readonly PrSupplier[];
  offers: Record<string, Record<string, PrOffer>>;
  onOffer: (s: PrSupplier) => void;
  onEdit: (s: PrSupplier) => void;
  onDelete: (s: PrSupplier) => void;
}) {
  const terms = useQuery({ ...activePaymentTermsQueryOptions(), enabled: suppliers.length > 0 }).data ?? [];
  if (!suppliers.length) {
    return (
      <Stack align="center" c="dimmed" p="lg">
        <i className="fas fa-handshake fa-3x" />
        <Text size="sm">Henüz tedarikçi eklenmemiş. Teklif karşılaştırması yapabilmek için tedarikçi ekleyin.</Text>
      </Stack>
    );
  }
  return (
    <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
      {suppliers.map((s) => {
        const hasOffer = !!offers[s.id];
        const currency = s.default_currency || 'TRY';
        const term = terms.find((t) => String(t.id) === String(s.default_payment_terms));
        const tax = s.default_tax_rate;
        return (
          <div key={s.id} className={classes.supplierCard} data-has-offer={hasOffer || undefined} data-testid="supplier-card">
            <Group justify="space-between" mb="xs">
              <Group gap={6}>
                <Text fw={700}>{s.name}</Text>
                {s.status && s.status !== 'approved' ? <SupplierStatusBadge status={s.status} /> : null}
              </Group>
              <StatusBadge color={hasOffer ? 'green' : 'yellow'}>{hasOffer ? 'Teklif Alındı' : 'Teklif Bekleniyor'}</StatusBadge>
            </Group>
            <SimpleGrid cols={2} spacing={6} mb="sm">
              <Info label="Performans Puanı" value={<StarRating score={s.rating_score} compact />} />
              <Info label="İletişim Kişisi" value={s.contact_person || '-'} />
              <Info label="Telefon" value={s.phone || '-'} />
              <Info label="E-posta" value={s.email || '-'} />
              <Info label="Para Birimi" value={`${CURRENCY_SYMBOLS[currency] ?? ''} ${currency}`} />
              <Info label="Ödeme Koşulları" value={term?.name ?? 'Belirtilmemiş'} />
              <Info
                label="Vergi Oranı"
                value={tax !== null && tax !== undefined && !Number.isNaN(tax) ? `${tax}%` : 'Belirtilmemiş (20%)'}
              />
            </SimpleGrid>
            <Group gap="xs">
              <Button size="xs" leftSection={<FaIcon icon="fas fa-dollar-sign" />} onClick={() => onOffer(s)}>
                Teklif Gir
              </Button>
              <Button size="xs" variant="outline" leftSection={<FaIcon icon="fas fa-edit" />} onClick={() => onEdit(s)}>
                Düzenle
              </Button>
              <Button size="xs" variant="outline" color="red" leftSection={<FaIcon icon="fas fa-trash" />} onClick={() => onDelete(s)}>
                Sil
              </Button>
            </Group>
          </div>
        );
      })}
    </SimpleGrid>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" component="div">{value}</Text>
    </div>
  );
}
