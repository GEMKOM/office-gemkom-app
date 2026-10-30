import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { AppLink } from '@/shell/AppLink';

export function NotFound() {
  return (
    <Center mih="60vh">
      <Stack align="center" gap="xs">
        <Title order={2}>Sayfa bulunamadı</Title>
        <Text c="dimmed">Aradığınız sayfa taşınmış veya kaldırılmış olabilir.</Text>
        <Button component={AppLink} to="/" mt="md">
          Ana sayfaya dön
        </Button>
      </Stack>
    </Center>
  );
}
