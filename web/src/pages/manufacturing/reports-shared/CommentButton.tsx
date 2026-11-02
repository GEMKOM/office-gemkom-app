import { Button, Popover, Text } from '@mantine/core';
import { FaIcon } from '@/ui';

/**
 * A row's comment behind a small button, for the timer reports. Legacy drew
 * the button and a popup (finished timers) or a modal (user report).
 */
export function CommentButton({ comment, label }: { comment: string; label?: string }) {
  return (
    <Popover position="bottom" withArrow shadow="md" width={300} withinPortal>
      <Popover.Target>
        <Button
          size="compact-xs"
          variant="default"
          title="Yorumu görüntüle"
          aria-label={label ? undefined : 'Yorumu görüntüle'}
          leftSection={label ? <FaIcon icon="fas fa-comment" /> : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          {label ?? <FaIcon icon="fas fa-comment" />}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" fw={600} mb={4}>
          Yorum
        </Text>
        <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {comment}
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}
