import { ScrollRestoration } from 'react-router';
import { AuthProvider } from '@/auth/AuthProvider';
import { AppLayout } from './AppLayout';
import { scrollKey } from './scrollKey';

export function RootLayout() {
  return (
    <AuthProvider>
      <AppLayout />
      <ScrollRestoration getKey={scrollKey} />
    </AuthProvider>
  );
}
