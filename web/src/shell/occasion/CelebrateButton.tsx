import { Button, Group, Popover, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { ApiError } from '@/api/client';
import { useCelebrate, type ColleagueOccasion } from '@/api/general/specialDays';
import { useAuth } from '@/auth/AuthProvider';
import { notify, StatusBadge } from '@/ui';
import { THEME_TONE } from './occasionModel';
import { useOccasionPreview } from './previewStore';
import classes from './occasion.module.css';

const MAX_MESSAGE = 280;

/**
 * "Kutla": a small popover with an optional message; the colleague gets an
 * in-app notification. Once sent (or sent before) it turns into "Kutladınız".
 */
export function CelebrateButton({ person }: { person: ColleagueOccasion }) {
  const { isImpersonating } = useAuth();
  // A preview shows another day; celebrations always go out for the real one.
  const previewing = useOccasionPreview() !== null;
  const [opened, setOpened] = useState(false);
  const [message, setMessage] = useState('');
  const celebrate = useCelebrate();

  if (person.celebrated_by_me) return <StatusBadge color="green">Kutladınız</StatusBadge>;

  const tone = person.kind === 'birthday' ? THEME_TONE.birthday : THEME_TONE.anniversary;
  const what =
    person.kind === 'birthday' ? 'doğum gününü' : `${person.years ?? ''}. iş yılını`.trim();

  const send = () => {
    celebrate.mutate(
      { recipient: person.user_id, kind: person.kind, message: message.trim() },
      {
        onSuccess: () => {
          notify.success(`${person.full_name} için kutlamanız iletildi`);
          setOpened(false);
          setMessage('');
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409) {
            notify.info('Bu günü zaten kutlamıştınız');
            setOpened(false);
            return;
          }
          notify.error(error, { fallback: 'Kutlama gönderilemedi' });
        },
      },
    );
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={320}
      trapFocus
      withArrow
      shadow="md"
    >
      <Popover.Target>
        <Button
          size="compact-sm"
          color={tone}
          onClick={() => setOpened((o) => !o)}
          disabled={isImpersonating || previewing}
          title={previewing ? 'Önizlemede kutlama gönderilmez' : undefined}
          aria-label={`${person.full_name} kutla`}
        >
          Kutla
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <div>
            <Text size="sm" fw={600}>
              {person.full_name}
            </Text>
            <Text size="xs" c="dimmed">
              {what.charAt(0).toLocaleUpperCase('tr')}
              {what.slice(1)} kutlayın
            </Text>
          </div>
          <Textarea
            label="Kısa mesaj (isteğe bağlı)"
            rows={3}
            maxLength={MAX_MESSAGE}
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
            data-autofocus
          />
          <Group justify="space-between" wrap="nowrap">
            <span className={classes.counter}>
              {message.length} / {MAX_MESSAGE}
            </span>
            <Group gap="xs" wrap="nowrap">
              <Button size="compact-sm" variant="default" onClick={() => setOpened(false)}>
                Vazgeç
              </Button>
              <Button size="compact-sm" color={tone} loading={celebrate.isPending} onClick={send}>
                Gönder
              </Button>
            </Group>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
