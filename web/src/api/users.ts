// The password endpoints the sign-in screens call. Ported from the legacy
// apis/users.js; both return the raw Response so the screens can read the
// API's own error text.

import { authedFetch } from '@/auth/authService';
import { backendBase } from '@/lib/backend';

/** Asks IT for a password reset. Unauthenticated. */
export function forgotPassword(username: string): Promise<Response> {
  return fetch(`${backendBase}/users/forgot-password/request/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
}

/** Sets the signed-in user's new password. */
export function resetPassword(newPassword: string): Promise<Response> {
  return authedFetch(`${backendBase}/users/reset-password/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_password: newPassword }),
  });
}
