import { ScrollRestoration } from 'react-router';
import { AuthProvider } from '@/auth/AuthProvider';
import { AppLayout } from './AppLayout';

export function RootLayout() {
  return (
    <AuthProvider>
      <AppLayout />
      <ScrollRestoration />
    </AuthProvider>
  );
}
