import { Anchor, Card, Grid, Group, Modal, NativeSelect, NumberInput, Select, Stack, Text, Button } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  activePaymentTermsQueryOptions,
  activeSuppliersQueryOptions,
} from '@/api/procurement/purchaseRequests';
import type { Supplier } from '@/api/procurement/suppliers';
import { StarRating, SupplierStatusBadge } from '@/pages/procurement/suppliers/list/supplierBadges';
import { ModalBody, ModalFooter, ModalHeader, modalClassNames, notify } from '@/ui';
import { CURRENCY_OPTIONS, newSupplierId, validateSupplierFields, type PrSupplier } from '../model';
import { notifyLines } from '../notifyLines';

// suppliersManager.showSupplierModal / onSupplierSelect / saveSupplier.

const currencyName = (code: string | undefined | null) =>
  CURRENCY_OPTIONS.find((c) => c.value === code)?.label ?? null;

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

export function SupplierModal({
  editing,
  onClose,
  onSave,
}: {
  /** Düzenle: the stored supplier; otherwise a new one is picked from the list. */
  editing: PrSupplier | null;
  onClose: () => void;
  onSave: (supplier: PrSupplier) => void;
}) {
  const suppliersQuery = useQuery({ ...activeSuppliersQueryOptions(), enabled: !editing });
  const termsQuery = useQuery(activePaymentTermsQueryOptions());
  const terms = termsQuery.data ?? [];
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked: Supplier | undefined = useMemo(
    () => suppliersQuery.data?.find((s) => String(s.id) === pickedId),
    [suppliersQuery.data, pickedId],
  );
  const [currency, setCurrency] = useState(editing?.default_currency ?? '');
  const [paymentTerms, setPaymentTerms] = useState(editing ? String(editing.default_payment_terms ?? '') : '');
  const [taxRate, setTaxRate] = useState<string>(
    editing && editing.default_tax_rate !== null && editing.default_tax_rate !== undefined
      ? String(editing.default_tax_rate)
      : '',
  );

  useEffect(() => {
    if (suppliersQuery.isError) {
      notify.error(`Tedarikçiler yüklenirken hata oluştu: ${(suppliersQuery.error as Error).message}`);
    }
  }, [suppliersQuery.isError, suppliersQuery.error]);
  useEffect(() => {
    if (termsQuery.isError) {
      notify.error(`Ödeme koşulları yüklenirken hata oluştu: ${(termsQuery.error as Error).message}`);
    }
  }, [termsQuery.isError, termsQuery.error]);

  const onPick = (id: string | null) => {
    setPickedId(id);
    const s = suppliersQuery.data?.find((x) => String(x.id) === id);
    if (!s) return;
    setCurrency(s.default_currency || 'TRY');
    const termId =
      s.default_payment_terms && typeof s.default_payment_terms === 'object'
        ? s.default_payment_terms.id
        : s.default_payment_terms;
    setPaymentTerms(termId !== null && termId !== undefined && terms.some((t) => String(t.id) === String(termId)) ? String(termId) : '');
    setTaxRate(String(s.default_tax_rate || '20.00'));
  };

  const info = editing
    ? editing
    : picked
      ? {
          name: picked.name ?? '',
          contact_person: picked.contact_person ?? '',
          phone: picked.phone ?? '',
          email: picked.email ?? '',
          status: picked.status,
          rating_score: picked.rating_score,
          rating_count: picked.rating_count,
        }
      : null;

  const save = () => {
    if (!editing && !picked) {
      notify.error('Lütfen bir tedarikçi seçin.');
      return;
    }
    const errors = validateSupplierFields(currency, paymentTerms, taxRate);
    if (errors.length) {
      notifyLines.error(`Lütfen aşağıdaki hataları düzeltin:\n${errors.join('\n')}`);
      return;
    }
    onSave({
      ...(editing ?? {}),
      id: editing?.id ?? newSupplierId(),
      name: info!.name.trim(),
      contact_person: info!.contact_person,
      phone: info!.phone,
      email: info!.email,
      default_currency: currency,
      default_payment_terms: paymentTerms,
      default_tax_rate: parseFloat(taxRate),
      status: info!.status ?? null,
      rating_score: info!.rating_score ?? null,
      rating_count: info!.rating_count ?? null,
    });
    onClose();
  };

  const termName = (id: unknown) => terms.find((t) => String(t.id) === String(id))?.name;
  const pickedTerm =
    picked?.default_payment_terms && typeof picked.default_payment_terms === 'object'
      ? picked.default_payment_terms.id
      : picked?.default_payment_terms;

  return (
    <Modal opened onClose={onClose} size="lg" withCloseButton={false} classNames={modalClassNames} padding={0}>
      <ModalHeader title={editing ? 'Tedarikçi Düzenle' : 'Tedarikçi Ekle'} icon="fas fa-handshake" />
      <ModalBody>
        <Stack gap="md">
          {!editing ? (
            <div>
              <Select
                label="Tedarikçi Seçimi"
                placeholder="Tedarikçi seçin..."
                searchable
                clearable
                maxDropdownHeight={300}
                data={(suppliersQuery.data ?? []).map((s) => ({ value: String(s.id), label: s.name ?? `#${s.id}` }))}
                renderOption={({ option }) => {
                  const s = suppliersQuery.data?.find((x) => String(x.id) === option.value);
                  return (
                    <Group gap={6}>
                      <span>{option.label}</span>
                      {s?.status && s.status !== 'approved' ? <SupplierStatusBadge status={s.status} /> : null}
                    </Group>
                  );
                }}
                value={pickedId}
                onChange={onPick}
              />
              <Text size="xs" c="dimmed" mt={4}>
                Yeni tedarikçi eklemek için{' '}
                <Anchor href="/procurement/suppliers/list/" target="_blank" size="xs">
                  <i className="fas fa-external-link-alt" /> Tedarikçiler sayfasını
                </Anchor>{' '}
                ziyaret edin.
              </Text>
            </div>
          ) : null}
          {info ? (
            <>
              <Card withBorder padding="sm">
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>Tedarikçi Bilgileri</Text>
                  <SupplierStatusBadge status={info.status} />
                </Group>
                <Grid>
                  <Grid.Col span={6}>
                    <Text size="xs" c="dimmed">Tedarikçi Adı</Text>
                    <Text size="sm">{dash(info.name)}</Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="xs" c="dimmed">Performans Puanı</Text>
                    <StarRating score={info.rating_score} compact />
                    {info.rating_count ? (
                      <Text span size="xs" c="dimmed">{` (${info.rating_count})`}</Text>
                    ) : null}
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Text size="xs" c="dimmed">İletişim Kişisi</Text>
                    <Text size="sm">{dash(info.contact_person)}</Text>
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Text size="xs" c="dimmed">Telefon</Text>
                    <Text size="sm">{dash(info.phone)}</Text>
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Text size="xs" c="dimmed">E-posta</Text>
                    <Text size="sm">{dash(info.email)}</Text>
                  </Grid.Col>
                </Grid>
              </Card>
              <Grid>
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <NativeSelect
                    label="Para Birimi"
                    required
                    value={currency}
                    onChange={(e) => setCurrency(e.currentTarget.value)}
                    data={[{ value: '', label: 'Para birimi seçin...' }, ...CURRENCY_OPTIONS]}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <NativeSelect
                    label="Ödeme Koşulları"
                    required
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.currentTarget.value)}
                    data={[
                      { value: '', label: 'Ödeme koşulu seçin...' },
                      ...terms.map((t) => ({ value: String(t.id), label: t.name })),
                    ]}
                  />
                  <Text size="xs" c="dimmed" mt={4}>
                    Yeni ödeme koşulu eklemek için{' '}
                    <Anchor href="/procurement/suppliers/payment-terms/" target="_blank" size="xs">
                      Ödeme Koşulları sayfasını
                    </Anchor>{' '}
                    ziyaret edin.
                  </Text>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <NumberInput
                    label="Vergi Oranı (%)"
                    required
                    min={0}
                    max={100}
                    step={0.01}
                    decimalSeparator="."
                    value={taxRate}
                    onChange={(v) => setTaxRate(String(v))}
                    description="Vergi oranını yüzde olarak girin (örn: 18.00)"
                  />
                </Grid.Col>
              </Grid>
              {picked && !editing ? (
                <Card withBorder padding="sm" data-testid="default-values">
                  <Text fw={600} mb="xs">Varsayılan vs Seçilen Değerler</Text>
                  <Grid>
                    <Grid.Col span={6}>
                      <Text size="sm" fw={600}>Varsayılan Değerler</Text>
                      <Text size="sm">Para Birimi: {currencyName(picked.default_currency) ?? 'Belirtilmemiş (TRY)'}</Text>
                      <Text size="sm">Ödeme Koşulları: {termName(pickedTerm) ?? 'Belirtilmemiş'}</Text>
                      <Text size="sm">
                        Vergi Oranı: {picked.default_tax_rate ? `${picked.default_tax_rate}%` : 'Belirtilmemiş (20%)'}
                      </Text>
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Text size="sm" fw={600}>Seçilen Değerler</Text>
                      <Text size="sm">Para Birimi: {currencyName(currency) ?? 'Seçilmedi'}</Text>
                      <Text size="sm">Ödeme Koşulları: {termName(paymentTerms) ?? 'Seçilmedi'}</Text>
                      <Text size="sm">Vergi Oranı: {taxRate !== '' ? `${taxRate}%` : 'Seçilmedi'}</Text>
                    </Grid.Col>
                  </Grid>
                </Card>
              ) : null}
            </>
          ) : null}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="default" onClick={onClose}>İptal</Button>
        <Button onClick={save}>Kaydet</Button>
      </ModalFooter>
    </Modal>
  );
}
