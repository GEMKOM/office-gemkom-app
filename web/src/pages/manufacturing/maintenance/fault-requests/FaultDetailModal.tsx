import { Button, Modal } from '@mantine/core';
import type { MachineFault } from '@/api/maintenance/faults';
import { formatDateTime } from '@/lib/format';
import {
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  PaperBackdrop,
  PaperCell,
  PaperChecks,
  PaperForm,
  PaperGrid,
  PaperNarrative,
  PaperPrintCopy,
  PaperSection,
  PaperSignature,
  PaperSignatures,
  PaperTextCell,
  PaperTimeline,
  usePaperPrint,
} from '@/ui';
import { FaultTypeBadge } from '../shared';
import {
  equipmentName,
  FaultStatusBadge,
  faultStatusLabel,
  openDuration,
  reporterName,
  resolverName,
} from './columns';

const TYPE_CHOICES = [
  { value: 'breaking', label: 'Makine Duruşu' },
  { value: 'fault', label: 'Arıza (Duruşsuz)' },
  { value: 'maintenance', label: 'Bakım' },
] as const;

function faultKind(fault: MachineFault): string {
  if (fault.is_breaking) return 'breaking';
  if (fault.is_maintenance) return 'maintenance';
  return 'fault';
}

const stamp = (value: string | null | undefined) => (value ? formatDateTime(value) : '');

/** Legacy buildOpenDurationText: long units, "(hâlâ açık)" while unresolved. */
function openDurationText(fault: MachineFault): string {
  if (!fault.reported_at) return '-';
  const label = openDuration(fault, true);
  return fault.resolved_at ? label : `${label} (hâlâ açık)`;
}

/**
 * The fault as a printed GEMKOM form, like the NCR report. The fault API has
 * no assignee or attachment fields: the people are the reporter and the
 * resolver.
 */
export function FaultReport({ fault, printedAt }: { fault: MachineFault; printedAt?: Date }) {
  const machine = fault.machine_name?.trim();
  const reporter = reporterName(fault);
  const resolver = resolverName(fault);
  return (
    <PaperForm
      org="GEMKOM · Bakım Onarım"
      title={fault.is_maintenance ? 'Bakım Talep Formu' : 'Arıza Talep Formu'}
      subtitle="Makine Arıza ve Bakım Kaydı"
      meta={[
        { label: 'Talep No', value: `#${fault.id}`, mono: true },
        { label: 'Bildirilme', value: stamp(fault.reported_at) || '—' },
        { label: 'Durum', value: <FaultStatusBadge fault={fault} /> },
        { label: 'Tür', value: <FaultTypeBadge fault={fault} /> },
      ]}
      footer={
        <>
          <span>GEMKOM · Arıza Talebi #{fault.id}</span>
          {printedAt ? <span>Rapor tarihi: {formatDateTime(printedAt)}</span> : null}
        </>
      }
    >
      <PaperSection number={1} title="Ekipman Bilgileri">
        <PaperGrid>
          <PaperCell label="Ekipman" span={2}>
            <strong>{machine || fault.asset_name || '—'}</strong>
          </PaperCell>
          <PaperTextCell label="Konum" value={fault.location} />
          <PaperTextCell
            label="Kayıt"
            value={machine ? 'Kayıtlı makine' : fault.asset_name ? 'Elle girilen ekipman' : ''}
          />
        </PaperGrid>
      </PaperSection>

      <PaperSection number={2} title="Arıza Tanımı">
        <PaperGrid>
          <PaperCell label="Talep Türü" span={4}>
            <PaperChecks choices={TYPE_CHOICES} selected={faultKind(fault)} />
          </PaperCell>
          <PaperTextCell
            label="Açıklama"
            value={fault.description}
            span={4}
            emptyText="Açıklama girilmedi."
          />
        </PaperGrid>
      </PaperSection>

      <PaperSection number={3} title="Zaman Çizelgesi">
        <PaperTimeline
          steps={[
            {
              title: 'Talep bildirildi',
              detail: reporter,
              at: stamp(fault.reported_at) || '—',
            },
            fault.resolved_at
              ? { title: 'Çözüldü', detail: resolver || '—', at: stamp(fault.resolved_at) }
              : { title: 'Çözüm bekleniyor', pending: true },
          ]}
        />
        <PaperGrid columns={2}>
          <PaperTextCell label="Açık Süre" value={openDurationText(fault)} />
          <PaperTextCell label="Durum" value={faultStatusLabel(fault)} />
        </PaperGrid>
      </PaperSection>

      <PaperSection number={4} title="Çözüm">
        <PaperNarrative
          value={fault.resolution_description}
          emptyText={fault.resolved_at ? 'Çözüm açıklaması girilmedi.' : 'Henüz çözülmedi.'}
        />
      </PaperSection>

      <PaperSection number={5} title="Sorumlular ve Onay">
        <PaperSignatures columns={2}>
          <PaperSignature role="Bildiren" name={reporter} date={stamp(fault.reported_at)} />
          <PaperSignature
            role="Çözen (Bakım Sorumlusu)"
            name={resolver}
            date={stamp(fault.resolved_at)}
            note={fault.resolved_at ? undefined : 'Henüz çözülmedi'}
          />
        </PaperSignatures>
      </PaperSection>
    </PaperForm>
  );
}

/** Port of showFaultDetails: the fault as a report that prints / saves as PDF. */
export function FaultDetailModal({ fault, onClose }: { fault: MachineFault; onClose: () => void }) {
  const { printing, print } = usePaperPrint(`Ariza-Talebi-${fault.id}`);
  return (
    <>
      <Modal
        opened
        onClose={onClose}
        size={1000}
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader
          title={`Arıza Talebi #${fault.id}`}
          subtitle={equipmentName(fault)}
          icon="fas fa-file-alt"
        />
        <ModalBody>
          <PaperBackdrop>
            <FaultReport fault={fault} />
          </PaperBackdrop>
        </ModalBody>
        <ModalFooter>
          <Button variant="default" leftSection={<FaIcon icon="fas fa-times" />} onClick={onClose}>
            Kapat
          </Button>
          <Button leftSection={<FaIcon icon="fas fa-file-pdf" />} onClick={print}>
            Yazdır / PDF
          </Button>
        </ModalFooter>
      </Modal>

      {printing ? (
        <PaperPrintCopy>
          <FaultReport fault={fault} printedAt={new Date()} />
        </PaperPrintCopy>
      ) : null}
    </>
  );
}
