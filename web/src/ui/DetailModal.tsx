import {
  Anchor,
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Grid,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  Stack,
  Text,
  Tooltip,
  type MantineSize,
} from '@mantine/core';
import type { ReactNode } from 'react';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatTime,
} from '@/lib/format';
import { FaIcon } from './FaIcon';

export type DetailFieldType =
  | 'text'
  | 'number'
  | 'currency'
  | 'percentage'
  | 'date'
  | 'datetime'
  | 'time'
  | 'boolean'
  | 'email'
  | 'url'
  | 'badge'
  | 'list'
  | 'json';

export interface DetailField {
  label: ReactNode;
  value?: unknown;
  /** How `value` is shown; ignored when `render` is given. Default 'text'. */
  type?: DetailFieldType;
  /** Custom display (legacy `format`). */
  render?: ReactNode;
  /** Grid width out of 12 (legacy colSize). Default 6. */
  span?: number;
  /** Click to copy the raw value. */
  copyable?: boolean;
  /** For type 'currency'. Default 'TRY'. */
  currency?: string;
  /** For type 'badge'. */
  badgeColor?: string;
  hidden?: boolean;
}

export interface DetailSection {
  title?: ReactNode;
  icon?: string;
  fields?: DetailField[];
  /** Anything else in the section (legacy addCustomSection / customContent). */
  content?: ReactNode;
  hidden?: boolean;
}

export interface DetailModalProps {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: string;
  /** Default 'lg'. 'full' = fullscreen. */
  size?: MantineSize | 'full' | number | string;
  sections: DetailSection[];
  loading?: boolean;
  /** Shows a "Düzenle" button in the footer. */
  onEdit?: () => void;
  editLabel?: ReactNode;
  /** Extra footer buttons, left of Kapat. */
  footerActions?: ReactNode;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function FieldValue({ field }: { field: DetailField }) {
  if (field.render !== undefined) return <>{field.render}</>;
  const { value, type = 'text' } = field;
  if (type === 'boolean') return <>{value ? 'Evet' : 'Hayır'}</>;
  if (isBlank(value) || (Array.isArray(value) && value.length === 0)) {
    return <Text c="dimmed" span>-</Text>;
  }
  const text = String(value);
  switch (type) {
    case 'number':
      return <>{formatNumber(value as number)}</>;
    case 'currency':
      return <>{formatCurrency(value as number, field.currency)}</>;
    case 'percentage':
      return <>{formatPercent(value as number)}</>;
    case 'date':
      return <>{formatDate(value as string)}</>;
    case 'datetime':
      return <>{formatDateTime(value as string)}</>;
    case 'time':
      return <>{formatTime(value as string)}</>;
    case 'email':
      return <Anchor href={`mailto:${text}`}>{text}</Anchor>;
    case 'url':
      return (
        <Anchor href={text} target="_blank" rel="noopener noreferrer">
          {text}
        </Anchor>
      );
    case 'badge':
      return <Badge color={field.badgeColor}>{text}</Badge>;
    case 'list':
      return (
        <Stack gap={2}>
          {(Array.isArray(value) ? value : [value]).map((item, index) => (
            <span key={index}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</span>
          ))}
        </Stack>
      );
    case 'json':
      return <Code block>{JSON.stringify(value, null, 2)}</Code>;
    default:
      return <>{text}</>;
  }
}

function Field({ field }: { field: DetailField }) {
  const value = <FieldValue field={field} />;
  return (
    <Grid.Col span={{ base: 12, sm: field.span ?? 6 }}>
      <Text size="xs" c="dimmed" fw={500} mb={2}>
        {field.label}
      </Text>
      {field.copyable && !isBlank(field.value) ? (
        <CopyButton value={String(field.value)}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Kopyalandı' : 'Kopyalamak için tıklayın'} withArrow>
              <Box fz="sm" onClick={copy} style={{ cursor: 'copy' }}>
                {value}
              </Box>
            </Tooltip>
          )}
        </CopyButton>
      ) : (
        <Box fz="sm">{value}</Box>
      )}
    </Grid.Col>
  );
}

/** Replaces components/display-modal: read-only sections of label/value fields. */
export function DetailModal({
  opened,
  onClose,
  title,
  icon,
  size = 'lg',
  sections,
  loading = false,
  onEdit,
  editLabel = 'Düzenle',
  footerActions,
}: DetailModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={size === 'full' ? '100%' : size}
      fullScreen={size === 'full'}
      title={
        <Text fw={600}>
          {icon ? <FaIcon icon={icon} style={{ marginRight: 8 }} /> : null}
          {title}
        </Text>
      }
    >
      <Box pos="relative">
        <LoadingOverlay visible={loading} />
        <Stack gap="md">
          {sections
            .filter((section) => !section.hidden)
            .map((section, index) => (
              <Paper key={index} withBorder p="sm">
                {section.title ? (
                  <Text fw={600} size="sm" mb="xs">
                    {section.icon ? (
                      <FaIcon
                        icon={section.icon}
                        color="var(--mantine-primary-color-filled)"
                        style={{ marginRight: 6 }}
                      />
                    ) : null}
                    {section.title}
                  </Text>
                ) : null}
                {section.fields && section.fields.length > 0 ? (
                  <Grid gap="sm">
                    {section.fields
                      .filter((field) => !field.hidden)
                      .map((field, fieldIndex) => (
                        <Field key={fieldIndex} field={field} />
                      ))}
                  </Grid>
                ) : null}
                {section.content}
              </Paper>
            ))}
        </Stack>
      </Box>
      <Group justify="flex-end" mt="md" gap="xs">
        {footerActions}
        <Button variant="default" onClick={onClose} leftSection={<FaIcon icon="fas fa-times" />}>
          Kapat
        </Button>
        {onEdit ? (
          <Button onClick={onEdit} leftSection={<FaIcon icon="fas fa-edit" />}>
            {editLabel}
          </Button>
        ) : null}
      </Group>
    </Modal>
  );
}
