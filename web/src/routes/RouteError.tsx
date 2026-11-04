import { Button, Center, Code, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { isStaleChunkError, reloadForNewVersion } from './staleChunk';

/**
 * The router's error page (instead of React Router's developer screen). A page
 * chunk that a deploy removed reloads the app once to get the new version;
 * anything else shows what went wrong with a way out.
 */
export function RouteError() {
  const error = useRouteError();
  const stale = isStaleChunkError(error);
  // Decided once: true while the reload is on its way.
  const [reloading] = useState(() => stale && reloadForNewVersion());

  useEffect(() => {
    if (!stale) console.error(error);
  }, [error, stale]);

  if (reloading) {
    return (
      <Center mih="100vh" aria-busy="true">
        <Stack align="center" gap="sm">
          <Loader />
          <Text c="dimmed">Uygulamanın yeni sürümü yükleniyor…</Text>
        </Stack>
      </Center>
    );
  }

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : undefined;

  return (
    <Center mih="100vh" px="md">
      <Stack align="center" gap="xs" maw={560}>
        <Title order={2}>{stale ? 'Uygulama güncellendi' : 'Bir hata oluştu'}</Title>
        <Text c="dimmed" ta="center">
          {stale
            ? 'Bu sayfanın yeni sürümü yüklenemedi. Sayfayı yenileyip tekrar deneyin.'
            : 'Sayfa açılırken beklenmeyen bir hata oluştu. Sayfayı yenileyin; tekrar olursa BT ile paylaşın.'}
        </Text>
        {detail && !stale ? (
          <Code block mt="xs" w="100%">
            {detail}
          </Code>
        ) : null}
        <Group mt="md">
          <Button onClick={() => window.location.reload()}>Sayfayı yenile</Button>
          {/* A full load, so it also picks up a new version. */}
          <Button component="a" href="/" variant="default">
            Ana sayfa
          </Button>
        </Group>
      </Stack>
    </Center>
  );
}
