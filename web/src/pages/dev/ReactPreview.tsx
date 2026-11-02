import { Anchor, Stack, Text, Title } from '@mantine/core';
import { AppLink } from '@/shell/AppLink';

// Dev-only landing page for checking the shell while no real page is migrated.
export function ReactPreview() {
  return (
    <Stack p="md">
      <Title order={2}>React önizleme</Title>
      <Text c="dimmed">Bu sayfa yalnızca geliştirme ortamında görünür.</Text>
      <Anchor component={AppLink} to="/react-preview/ui">
        UI bileşenleri
      </Anchor>
      <Anchor component={AppLink} to="/react-preview/gantt">
        Gantt (büyük veri)
      </Anchor>
    </Stack>
  );
}
