import { resetPassword } from '@legacy/apis/users.js';
import {
  getUser,
  isLoggedIn,
  logout,
  ROUTES,
  shouldBeOnResetPasswordPage,
  takeReturnUrl,
} from '@legacy/authService.js';
import { Anchor, Button } from '@mantine/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppNavigate } from '@/shell/AppLink';
import { AuthScreen, FormStatus } from './AuthScreen';
import { PasswordField } from './PasswordField';
import classes from './auth.module.css';

export const RESET_MESSAGES = {
  tooShort: 'Şifre en az 6 karakter olmalıdır.',
  mismatch: 'Şifreler eşleşmiyor.',
  failed: 'Şifre güncellenemedi. Lütfen tekrar deneyin.',
  crashed: 'Bir hata oluştu. Lütfen tekrar deneyin.',
  doneReturning: 'Şifreniz başarıyla güncellendi. Yönlendiriliyorsunuz...',
  doneHome: 'Şifreniz başarıyla güncellendi. Ana sayfaya yönlendiriliyorsunuz...',
} as const;

const MIN_LENGTH = 6;
export const REDIRECT_DELAY_MS = 1500;

// The cached user must stop asking for a reset, or every page sends us back here.
async function clearResetFlag() {
  try {
    const user = await getUser();
    localStorage.setItem('user', JSON.stringify({ ...user, must_reset_password: false }));
  } catch (error) {
    console.warn('Failed to refresh user data after password reset:', error);
    const cached = JSON.parse(localStorage.getItem('user') || '{}') as Record<string, unknown>;
    localStorage.setItem('user', JSON.stringify({ ...cached, must_reset_password: false }));
  }
}

export function ResetPasswordPage() {
  const navigate = useAppNavigate();
  const [allowed] = useState(shouldBeOnResetPasswordPage);
  const redirected = useRef(false);

  // Only a signed-in user with a forced reset belongs here.
  useEffect(() => {
    if (allowed || redirected.current) return;
    redirected.current = true;
    navigate(isLoggedIn() ? (takeReturnUrl() ?? ROUTES.HOME) : ROUTES.LOGIN, { replace: true });
  }, [allowed, navigate]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const redirectTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(redirectTimer.current), []);

  if (!allowed) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || done) return;
    setMessage(null);
    // As the legacy page: surrounding spaces are not part of the password.
    const newPassword = password.trim();
    if (newPassword.length < MIN_LENGTH) {
      setMessage({ tone: 'error', text: RESET_MESSAGES.tooShort });
      passwordRef.current?.focus();
      return;
    }
    if (newPassword !== confirm.trim()) {
      setMessage({ tone: 'error', text: RESET_MESSAGES.mismatch });
      confirmRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await resetPassword(newPassword);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setMessage({ tone: 'error', text: data.message || RESET_MESSAGES.failed });
        return;
      }
      await clearResetFlag();
      // A link the user opened before signing in is still parked; go there.
      const returnUrl = takeReturnUrl();
      setMessage({
        tone: 'success',
        text: returnUrl ? RESET_MESSAGES.doneReturning : RESET_MESSAGES.doneHome,
      });
      setPassword('');
      setConfirm('');
      setDone(true);
      redirectTimer.current = window.setTimeout(
        () => navigate(returnUrl ?? ROUTES.HOME, { replace: true }),
        REDIRECT_DELAY_MS,
      );
    } catch {
      setMessage({ tone: 'error', text: RESET_MESSAGES.crashed });
    } finally {
      setBusy(false);
    }
  }

  const clearError = () => {
    if (message?.tone === 'error') setMessage(null);
  };

  return (
    <AuthScreen
      title="Şifre Sıfırla"
      subtitle="Devam etmeden önce hesabınız için yeni bir şifre belirleyin"
      documentTitle="Şifre Sıfırla - GEMKOM"
      footer={
        <Anchor
          component="button"
          type="button"
          className={classes.footerLink}
          onClick={() => logout()}
        >
          Farklı bir hesapla giriş yap
        </Anchor>
      }
    >
      <form onSubmit={submit} noValidate className={classes.form}>
        <PasswordField
          ref={passwordRef}
          id="reset-password"
          label="Yeni Şifre"
          description="En az 6 karakter"
          autoComplete="new-password"
          autoFocus
          size="md"
          disabled={done}
          value={password}
          onChange={(e) => {
            setPassword(e.currentTarget.value);
            clearError();
          }}
        />
        <PasswordField
          ref={confirmRef}
          id="reset-password-confirm"
          label="Yeni Şifre (Tekrar)"
          autoComplete="new-password"
          size="md"
          disabled={done}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.currentTarget.value);
            clearError();
          }}
        />
        <FormStatus tone={message?.tone ?? 'error'}>{message?.text}</FormStatus>
        <Button type="submit" size="md" fullWidth loading={busy} disabled={done}>
          Kaydet
        </Button>
      </form>
    </AuthScreen>
  );
}
