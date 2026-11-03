import { Grid, Input, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { apiFetch, isApiError } from '@/api/client';
import {
  createJobOrder,
  updateJobOrder,
  type JobOrder,
} from '@/api/projects/jobOrders';
import { customersQueryOptions, getCustomerById } from '@/api/reference/customers';
import { extractResults } from '@/api/types';
import { FormModal, ModalSection, notify, SelectRemote, type RemoteOption } from '@/ui';
import classes from './ProjectTracking.module.css';

// Port of the create / child / edit job order forms of jobOrderList.js
// (showCreateJobOrderModal, showCreateChildJobOrderModal, editJobOrder and
// their createJobOrder / updateJobOrder savers).

export type JobOrderFormMode =
  | { kind: 'create' }
  | { kind: 'child'; parent: JobOrder }
  | { kind: 'edit'; jobOrder: JobOrder };

interface FormValues {
  customer: string;
  job_no_extension: string;
  title: string;
  description: string;
  customer_order_no: string;
  erp_product_codes: string;
  quantity: string;
  incoterms: string;
  target_completion_date: string;
  estimated_cost: string;
  general_expenses_rate: string;
}

const REQUIRED = 'Bu alan gereklidir';
const ERP_HELP =
  "İmalat tamamlandığında ERP'ye ürün girişi için kullanılacak ürün kodları. Ana iş emrine girilir; alt iş emirleri devralır.";

/** "01", "02": the next child extension (legacy counted children_count). */
export function nextChildExtension(parent: Pick<JobOrder, 'children_count'>): string {
  return String((parent.children_count || 0) + 1).padStart(2, '0');
}

function dateOnly(value: string | null | undefined): string {
  return value ? String(value).split('T')[0]! : '';
}

function initialValues(mode: JobOrderFormMode): FormValues {
  const empty: FormValues = {
    customer: '',
    job_no_extension: '',
    title: '',
    description: '',
    customer_order_no: '',
    erp_product_codes: '',
    quantity: '1',
    incoterms: '',
    target_completion_date: '',
    estimated_cost: '',
    general_expenses_rate: '',
  };
  if (mode.kind === 'child') {
    const parent = mode.parent;
    return {
      ...empty,
      job_no_extension: nextChildExtension(parent),
      target_completion_date: dateOnly(parent.target_completion_date),
      general_expenses_rate:
        parent.general_expenses_rate !== null && parent.general_expenses_rate !== undefined
          ? String(parent.general_expenses_rate)
          : '0.0000',
    };
  }
  if (mode.kind === 'edit') {
    const job = mode.jobOrder;
    return {
      ...empty,
      customer: job.customer ? String(job.customer) : '',
      title: job.title || '',
      description: job.description || '',
      customer_order_no: job.customer_order_no || '',
      erp_product_codes: (job.erp_product_codes as string | null | undefined) || '',
      quantity: job.quantity || job.quantity === 0 ? String(job.quantity) : '1',
      incoterms: job.incoterms || '',
      general_expenses_rate:
        job.general_expenses_rate !== null && job.general_expenses_rate !== undefined
          ? String(job.general_expenses_rate)
          : '',
    };
  }
  return empty;
}

/**
 * Legacy error handling: a DRF body becomes all its messages joined with
 * ', ', anything else the fallback.
 */
export function joinedErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const messages = Object.values(error.data as Record<string, unknown>)
      .flat(Infinity)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String);
    return messages.join(', ') || fallback;
  }
  return fallback;
}

interface CustomerRow {
  id: number;
  code?: string;
  name?: string;
  short_name?: string;
}

function customerOption(c: CustomerRow): RemoteOption {
  return { value: String(c.id), label: [c.code, c.name].filter(Boolean).join(' - ') || `#${c.id}` };
}

export interface JobOrderFormModalProps {
  mode: JobOrderFormMode;
  onClose: () => void;
  onSaved: (jobOrder: JobOrder) => void;
}

/** Mount it when it should open, so the form starts fresh each time. */
export function JobOrderFormModal({ mode, onClose, onSaved }: JobOrderFormModalProps) {
  const isCreate = mode.kind === 'create';
  const isChild = mode.kind === 'child';
  const isEdit = mode.kind === 'edit';
  const editedChild = isEdit && Boolean(mode.jobOrder.parent);

  const form = useForm<FormValues>({
    initialValues: initialValues(mode),
    validate: {
      customer: (v) => ((isCreate || (isEdit && !editedChild)) && !v ? REQUIRED : null),
      job_no_extension: (v) => (!isEdit && !v.trim() ? REQUIRED : null),
      title: (v) => (!v.trim() ? REQUIRED : null),
      general_expenses_rate: (v) => (!String(v).trim() ? REQUIRED : null),
    },
  });
  const [saving, setSaving] = useState(false);

  // Customer codes of the searched options: the job number is "<code>-<ext>".
  const [searchedCodes, setSearchedCodes] = useState<ReadonlyMap<string, string>>(new Map());
  const [customerCode, setCustomerCode] = useState<string | null>(null);

  // Legacy create modal listed the first page (ordering=code) before any search.
  const firstPage = useQuery({
    ...customersQueryOptions({ is_active: true, ordering: 'code', page_size: 20 }),
    enabled: isCreate,
  });
  const firstOptions = useMemo(() => (firstPage.data?.results ?? []).map(customerOption), [firstPage.data]);
  const codeOf = (id: string): string | null =>
    searchedCodes.get(id) ?? firstPage.data?.results.find((c) => String(c.id) === id)?.code ?? null;

  const searchCustomers = async (term: string, signal: AbortSignal): Promise<RemoteOption[]> => {
    const data = await apiFetch<unknown>('/projects/customers/', {
      params: isCreate
        ? { search: term.trim(), is_active: true, ordering: 'code', page_size: 20 }
        : { search: term.trim(), is_active: true, page_size: 50 },
      signal,
    });
    const rows = extractResults<CustomerRow>(data);
    setSearchedCodes((prev) => {
      const next = new Map(prev);
      for (const c of rows) if (c.code) next.set(String(c.id), c.code);
      return next;
    });
    return rows.map(customerOption);
  };

  const save = async (values: FormValues) => {
    setSaving(true);
    try {
      if (isEdit) {
        const job = mode.jobOrder;
        const quantity = Number.parseInt(values.quantity, 10);
        const data: Record<string, unknown> = {
          job_no: job.job_no,
          title: values.title,
          description: values.description,
          customer: values.customer ? Number.parseInt(values.customer, 10) : values.customer,
          customer_order_no: values.customer_order_no,
          erp_product_codes: values.erp_product_codes,
          quantity: Number.isNaN(quantity) || quantity < 1 ? 1 : quantity,
          general_expenses_rate: values.general_expenses_rate,
        };
        if (values.incoterms.trim()) data.incoterms = values.incoterms.trim();
        const saved = await updateJobOrder(job.job_no, data);
        if (!saved?.job_no) throw new Error('İş emri güncellenemedi');
        onSaved(saved);
        notify.success('İş emri başarıyla güncellendi');
        onClose();
        return;
      }

      const data: Record<string, unknown> = {
        title: values.title,
        description: values.description,
        quantity: Number.parseInt(values.quantity, 10) || 1,
        general_expenses_rate: values.general_expenses_rate,
      };
      // Empty dates and numbers are left out rather than sent as ''.
      if (values.target_completion_date) data.target_completion_date = values.target_completion_date;
      if (values.incoterms.trim()) data.incoterms = values.incoterms;
      if (mode.kind === 'child') {
        data.parent = mode.parent.job_no;
        data.job_no = `${mode.parent.job_no}-${values.job_no_extension}`;
      } else {
        let code = customerCode ?? codeOf(values.customer);
        if (!code && values.customer) code = (await getCustomerById(values.customer)).code || null;
        if (!code) {
          notify.error('Müşteri kodu bulunamadı. Lütfen müşteri seçtiğinizden emin olun.');
          return;
        }
        data.job_no = `${code}-${values.job_no_extension.trim()}`;
        data.customer = Number.parseInt(values.customer, 10);
        data.customer_order_no = values.customer_order_no;
        data.erp_product_codes = values.erp_product_codes;
        if (values.estimated_cost !== '') data.estimated_cost = values.estimated_cost;
      }
      const saved = await createJobOrder(data);
      if (!saved?.job_no) throw new Error('İş emri oluşturulamadı');
      notify.success('İş emri başarıyla oluşturuldu');
      onSaved(saved);
      onClose();
    } catch (error) {
      notify.error(
        joinedErrorMessage(
          error,
          isEdit ? 'İş emri güncellenirken hata oluştu' : 'İş emri oluşturulurken hata oluştu',
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const prefix = isChild ? `${mode.parent.job_no}-` : isCreate ? (customerCode ? `${customerCode}-` : null) : null;
  const jobNoField = isEdit ? (
    <TextInput
      label="İş Emri No"
      description="Benzersiz iş emri numarası"
      withAsterisk
      value={mode.jobOrder.job_no}
      disabled
      readOnly
    />
  ) : (
    <TextInput
      label="İş Emri No"
      description={isChild ? 'Alt iş emri uzantısı (örn: 01, 02)' : 'İş emri uzantısı (örn: 01, 02)'}
      placeholder="01"
      withAsterisk
      // Legacy kept the field disabled until a customer gave the prefix.
      disabled={isCreate && !customerCode}
      leftSection={prefix ? <span className={classes.jobNoPrefix}>{prefix}</span> : null}
      leftSectionWidth={prefix ? `${prefix.length * 0.6 + 1}rem` : undefined}
      {...form.getInputProps('job_no_extension')}
    />
  );

  const editCustomer = isEdit ? mode.jobOrder : null;
  const customerField = (
    <Input.Wrapper
      label="Müşteri"
      description={isCreate ? 'Müşteri seçin (arama yapabilirsiniz)' : 'Müşteri seçin'}
      withAsterisk={isCreate || !editedChild}
      error={form.errors.customer}
    >
      <SelectRemote
        aria-label="Müşteri"
        placeholder={isCreate ? 'Müşteri seçin...' : 'Müşteri ara (en az 3 karakter)'}
        minSearchLength={3}
        queryKey={['projectTracking', 'customerSearch', isCreate ? 'create' : 'edit']}
        search={searchCustomers}
        initialOptions={
          isCreate
            ? firstOptions
            : editCustomer?.customer
              ? [
                  {
                    value: String(editCustomer.customer),
                    label:
                      [editCustomer.customer_code, editCustomer.customer_short_name || editCustomer.customer_name || '']
                        .filter(Boolean)
                        .join(' - ') || `#${editCustomer.customer}`,
                  },
                ]
              : []
        }
        disabled={editedChild}
        value={form.values.customer || null}
        onChange={(value) => {
          form.setFieldValue('customer', value ?? '');
          if (isCreate) setCustomerCode(value ? codeOf(value) : null);
        }}
      />
    </Input.Wrapper>
  );

  const title = isEdit ? 'İş Emri Düzenle' : 'Yeni İş Emri Oluştur';
  const subtitle = isEdit
    ? `${mode.jobOrder.job_no} · ${mode.jobOrder.title}`
    : isChild
      ? `Alt iş emri: ${mode.parent.job_no}`
      : undefined;

  const col = (span: number, node: ReactNode) => <Grid.Col span={{ base: 12, sm: span }}>{node}</Grid.Col>;

  return (
    <FormModal
      opened
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={isEdit ? 'fas fa-edit' : 'fas fa-plus-circle'}
      size="lg"
      submitting={saving}
      onSubmit={form.onSubmit((values) => void save(values))}
    >
      {isCreate ? (
        <ModalSection title="Müşteri Bilgileri">
          <Grid gap="sm">{col(6, customerField)}</Grid>
        </ModalSection>
      ) : null}

      <ModalSection title="Temel Bilgiler">
        <Grid gap="sm">
          {col(6, jobNoField)}
          {col(
            isChild ? 12 : 6,
            <TextInput
              label="Başlık"
              description={isChild ? 'Alt iş emri başlığı' : 'İş emri başlığı'}
              placeholder={isChild ? 'Alt iş emri başlığını girin' : isCreate ? 'İş emri başlığını girin' : undefined}
              withAsterisk
              {...form.getInputProps('title')}
            />,
          )}
          {col(
            12,
            <Textarea
              label="Açıklama"
              description="Detaylı açıklama"
              placeholder={isEdit ? undefined : 'Detaylı açıklama'}
              rows={2}
              {...form.getInputProps('description')}
            />,
          )}
          {isCreate
            ? col(
                6,
                <TextInput
                  label="Müşteri Sipariş No"
                  description="Müşteri sipariş numarası"
                  placeholder="Müşteri sipariş numarası"
                  {...form.getInputProps('customer_order_no')}
                />,
              )
            : null}
          {isCreate
            ? col(
                12,
                <Textarea
                  label="ERP Ürün Kodları"
                  description={ERP_HELP}
                  placeholder="ERP ürün kodları"
                  rows={3}
                  {...form.getInputProps('erp_product_codes')}
                />,
              )
            : null}
          {isChild || isCreate
            ? [
                col(
                  6,
                  <TextInput
                    key="quantity"
                    type="number"
                    label="Miktar"
                    description="İş emri miktarı"
                    placeholder="Miktar"
                    min={1}
                    step={1}
                    {...form.getInputProps('quantity')}
                  />,
                ),
                col(
                  6,
                  <TextInput
                    key="incoterms"
                    label="Teslim Şekli"
                    description="Teslim şekli bilgisi"
                    placeholder="Teslim şekli"
                    {...form.getInputProps('incoterms')}
                  />,
                ),
              ]
            : null}
        </Grid>
      </ModalSection>

      {isEdit ? (
        <ModalSection title="Müşteri Bilgileri">
          <Grid gap="sm">
            {col(6, customerField)}
            {col(
              6,
              <TextInput
                label="Müşteri Sipariş No"
                description="Müşteri sipariş numarası"
                {...form.getInputProps('customer_order_no')}
              />,
            )}
            {col(
              12,
              <Textarea label="ERP Ürün Kodları" description={ERP_HELP} rows={3} {...form.getInputProps('erp_product_codes')} />,
            )}
            {col(
              6,
              <TextInput
                type="number"
                label="Miktar"
                description="İş emri miktarı"
                min={1}
                step={1}
                {...form.getInputProps('quantity')}
              />,
            )}
            {col(6, <TextInput label="Teslim Şekli" description="Teslim şekli bilgisi" {...form.getInputProps('incoterms')} />)}
          </Grid>
        </ModalSection>
      ) : (
        <ModalSection title="Tarihler">
          <Grid gap="sm">
            {col(
              6,
              <TextInput
                type="date"
                label="Hedef Tamamlanma Tarihi"
                description="Hedef tamamlanma tarihi"
                {...form.getInputProps('target_completion_date')}
              />,
            )}
          </Grid>
        </ModalSection>
      )}

      <ModalSection title="Maliyet Bilgileri">
        <Grid gap="sm">
          {isCreate
            ? col(
                12,
                <TextInput
                  type="number"
                  label="Tahmini Maliyet"
                  description="Tahmini maliyet"
                  placeholder="Tahmini maliyet"
                  {...form.getInputProps('estimated_cost')}
                />,
              )
            : null}
          {col(
            12,
            <TextInput
              type="number"
              label="Genel Gider Oranı"
              description="Genel gider oranı (zorunlu)"
              placeholder="0.0000"
              step="0.0001"
              withAsterisk
              {...form.getInputProps('general_expenses_rate')}
            />,
          )}
        </Grid>
      </ModalSection>
    </FormModal>
  );
}
