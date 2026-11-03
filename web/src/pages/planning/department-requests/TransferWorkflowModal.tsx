import { Alert, Button, Group, Modal, Stepper, Text, TextInput } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { departmentRequestKeys } from '@/api/general/departmentRequests';
import {
  createPlanningRequest,
  planningRequestKeys,
  type PlanningRequestInput,
} from '@/api/planning/planningRequests';
import {
  errorMessage,
  FaIcon,
  ModalBody,
  ModalFooter,
  ModalHeader,
  modalClassNames,
  notify,
} from '@/ui';
import { downloadItemsCsv } from './exportCsv';

export interface TransferWorkflowModalProps {
  /** The planning request the form built; created only at step 3. */
  request: PlanningRequestInput;
  departmentRequestId?: number;
  onClose: () => void;
}

/**
 * Legacy showTransferWorkflowModal: 1) export the ERP CSV, 2) type the ERP
 * code (optional with Envanter Kontrolü), 3) create the planning request with
 * that code as its request number.
 */
export function TransferWorkflowModal({
  request,
  departmentRequestId,
  onClose,
}: TransferWorkflowModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState('');
  const [erpCode, setErpCode] = useState('');
  const items = request.items ?? [];
  const optional = Boolean(request.check_inventory);

  const create = useMutation({
    mutationFn: createPlanningRequest,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: departmentRequestKeys.all }),
        queryClient.invalidateQueries({ queryKey: planningRequestKeys.all }),
      ]),
  });

  const submit = async () => {
    try {
      await create.mutateAsync(erpCode ? { ...request, request_number: erpCode } : request);
      notify.success('Talep başarıyla gönderildi');
      onClose();
    } catch (error) {
      notify.error(`Talep gönderilirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  return (
    <Modal
      opened
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      size="lg"
      withCloseButton={false}
      classNames={modalClassNames}
    >
      <ModalHeader title="Departman Talebi Transfer İşlemi" icon="fas fa-exchange-alt" />
      <ModalBody>
        <Stepper active={step} size="sm" allowNextStepsSelect={false} mb="lg">
          <Stepper.Step label="Excel Dışa Aktar">
            <Alert color="blue" variant="light" icon={<FaIcon icon="fas fa-info-circle" />} mb="sm">
              <strong>Adım 1:</strong> Excel dosyasını dışa aktarın ve ERP sistemine girin.
            </Alert>
            <Text size="sm">
              <strong>Ürün Sayısı:</strong> {items.length} ürün
            </Text>
            <Text size="sm" mb="sm">
              <strong>Başlık:</strong> {request.title || '-'}
            </Text>
            <Group justify="flex-end">
              <Button
                color="green"
                leftSection={<FaIcon icon="fas fa-file-excel" />}
                onClick={() => {
                  downloadItemsCsv(items, request.needed_date, departmentRequestId);
                  setStep(1);
                }}
              >
                Excel Dışa Aktar
              </Button>
            </Group>
          </Stepper.Step>
          <Stepper.Step label="ERP Kodu Gir">
            <Alert color="blue" variant="light" icon={<FaIcon icon="fas fa-info-circle" />} mb="sm">
              <strong>Adım 2:</strong> ERP sistemine girdikten sonra aldığınız kodu girin.
            </Alert>
            <TextInput
              label="ERP Kodu"
              withAsterisk={!optional}
              placeholder="ERP kodunu girin"
              description={`Bu kod talep numarası olarak gönderilecektir.${
                optional ? ' (Envanter kontrolü seçildiği için opsiyonel)' : ''
              }`}
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              mb="sm"
            />
            <Group justify="flex-end">
              <Button
                leftSection={<FaIcon icon="fas fa-arrow-right" />}
                onClick={() => {
                  const trimmed = code.trim();
                  if (!optional && !trimmed) {
                    notify.warning('Lütfen ERP kodunu girin');
                    return;
                  }
                  setErpCode(trimmed);
                  setStep(2);
                }}
              >
                Devam Et
              </Button>
            </Group>
          </Stepper.Step>
          <Stepper.Step label="Gönder">
            <Alert
              color="yellow"
              variant="light"
              icon={<FaIcon icon="fas fa-exclamation-triangle" />}
              mb="sm"
            >
              <strong>Adım 3:</strong> Talebi göndermek için onaylayın.
            </Alert>
            <Text size="sm">
              <strong>Başlık:</strong> {request.title || '-'}
            </Text>
            <Text size="sm">
              <strong>ERP Kodu:</strong> {erpCode || '-'}
            </Text>
            <Text size="sm" mb="sm">
              <strong>Ürün Sayısı:</strong> {items.length} ürün
            </Text>
            <Group justify="flex-end">
              <Button
                loading={create.isPending}
                leftSection={<FaIcon icon="fas fa-paper-plane" />}
                onClick={() => void submit()}
              >
                Talebi Gönder
              </Button>
            </Group>
          </Stepper.Step>
        </Stepper>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="default"
          disabled={create.isPending}
          leftSection={<FaIcon icon="fas fa-times" />}
          onClick={onClose}
        >
          İptal
        </Button>
      </ModalFooter>
    </Modal>
  );
}
