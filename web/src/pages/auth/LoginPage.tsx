import { forgotPassword } from '@/api/users';
import {
  login,
  mustResetPassword,
  ROUTES,
  shouldBeOnLoginPage,
  takeReturnUrl,
  teamLandingRoute,
} from '@/auth/authService';
import { Anchor, Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppNavigate } from '@/shell/AppLink';
import { AuthScreen, FormStatus } from './AuthScreen';
import { PasswordField } from './PasswordField';
import classes from './auth.module.css';

/** Accounts without office_access are sent to the shop-floor app. */
export const SAHA_URL = 'https://saha.gemcore.com.tr';
const FORBIDDEN_COUNTDOWN = 5;

export const LOGIN_MESSAGES = {
  noUsername: 'Lütfen kullanıcı adınızı girin.',
  noPassword: 'Lütfen şifrenizi girin.',
  badCredentials: 'Kullanıcı adı veya şifre hatalı. Lütfen tekrar deneyin.',
  forgotSent: 'Şifre sıfırlama isteğiniz yöneticinize iletildi.',
  forgotFailed: 'Bağlantı hatası. Lütfen tekrar deneyin.',
} as const;

// Where a signed-in user goes from here: the forced reset first, then the page
// that sent them to the login screen, else their department's home page.
function landingAfterLogin(): string {
  if (mustResetPassword()) return ROUTES.RESET_PASSWORD; // the parked URL waits for the reset page
  return takeReturnUrl() ?? teamLandingRoute();
}

export function LoginPage() {
  const navigate = useAppNavigate();
  const [signedIn] = useState(() => !shouldBeOnLoginPage());
  const redirected = useRef(false);

  // Already signed in (another tab, or the back button): move on. Same as the
  // legacy guardRoute() for a signed-in user on the login page.
  useEffect(() => {
    if (!signedIn || redirected.current) return;
    redirected.current = true;
    navigate(mustResetPassword() ? ROUTES.RESET_PASSWORD : (takeReturnUrl() ?? ROUTES.HOME), {
      replace: true,
    });
  }, [signedIn, navigate]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (signedIn) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!username.trim()) {
      setError(LOGIN_MESSAGES.noUsername);
      usernameRef.current?.focus();
      return;
    }
    if (!password.trim()) {
      setError(LOGIN_MESSAGES.noPassword);
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setBusy(false);
      if (err instanceof Error && err.message === 'FORBIDDEN') {
        setForbidden(true);
      } else {
        setError(LOGIN_MESSAGES.badCredentials);
        passwordRef.current?.select();
      }
      return;
    }
    navigate(landingAfterLogin(), { replace: true });
  }

  return (
    <AuthScreen
      title="Ofis Çalışanları"
      subtitle="Yönetim, planlama ve ofis işlemleri için giriş yapın"
      documentTitle="Giriş Yap - GEMKOM"
      footer={
        <>
          <i className="fas fa-shield-alt" aria-hidden /> Güvenli bağlantı ile korunmaktadır
        </>
      }
    >
      <form onSubmit={submit} noValidate className={classes.form}>
        <TextInput
          ref={usernameRef}
          id="login-username"
          label="Kullanıcı Adı"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          size="md"
          leftSection={<i className="fas fa-user" aria-hidden />}
          value={username}
          onChange={(e) => {
            setUsername(e.currentTarget.value);
            setError(''); // typing again clears the message it was about
          }}
        />
        <PasswordField
          ref={passwordRef}
          id="login-password"
          label="Şifre"
          autoComplete="current-password"
          size="md"
          leftSection={<i className="fas fa-key" aria-hidden />}
          value={password}
          onChange={(e) => {
            setPassword(e.currentTarget.value);
            setError('');
          }}
        />
        <FormStatus tone="error">{error}</FormStatus>
        <Button type="submit" size="md" fullWidth loading={busy} loaderProps={{ type: 'dots' }}>
          Giriş Yap
        </Button>
        {/* Screen readers get the state the spinner shows. */}
        <span className={classes.visuallyHidden} aria-live="polite">
          {busy ? 'Giriş yapılıyor' : ''}
        </span>
        <Anchor
          component="button"
          type="button"
          className={classes.secondaryLink}
          onClick={() => setForgotOpen(true)}
        >
          Şifremi Unuttum
        </Anchor>
      </form>
      <ForgotPasswordModal
        opened={forgotOpen}
        initialUsername={username.trim()}
        onClose={() => setForgotOpen(false)}
      />
      <ForbiddenModal opened={forbidden} />
    </AuthScreen>
  );
}

function ForgotPasswordModal({
  opened,
  initialUsername,
  onClose,
}: {
  opened: boolean;
  initialUsername: string;
  onClose: () => void;
}) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  // Opening starts from what was typed on the login form.
  const [wasOpened, setWasOpened] = useState(opened);
  if (opened !== wasOpened) {
    setWasOpened(opened);
    if (opened) {
      setUsername(initialUsername);
      setMessage(null);
    }
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function close() {
    window.clearTimeout(closeTimer.current);
    setBusy(false);
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    const name = username.trim();
    if (!name) {
      setMessage({ tone: 'error', text: LOGIN_MESSAGES.noUsername });
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const response = await forgotPassword(name);
      // The answer is the same whether or not the account exists.
      setMessage({ tone: 'success', text: LOGIN_MESSAGES.forgotSent });
      if (response.ok) {
        setUsername('');
        closeTimer.current = window.setTimeout(close, 2000);
      }
    } catch {
      setMessage({ tone: 'error', text: LOGIN_MESSAGES.forgotFailed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={opened} onClose={close} title="Şifremi Unuttum" centered size="sm">
      <form onSubmit={submit} noValidate>
        <Stack gap="xs">
          <TextInput
            ref={inputRef}
            label="Kullanıcı Adı"
            placeholder="Kullanıcı adınızı girin"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            data-autofocus
            value={username}
            onChange={(e) => {
              setUsername(e.currentTarget.value);
              if (message?.tone === 'error') setMessage(null);
            }}
          />
          <Text size="sm" c="dimmed">
            <i className="fas fa-info-circle" aria-hidden /> Şifre sıfırlama isteğiniz yöneticinize
            iletilecektir.
          </Text>
          <FormStatus tone={message?.tone ?? 'error'}>{message?.text}</FormStatus>
          <div className={classes.modalActions}>
            <Button variant="default" onClick={close}>
              İptal
            </Button>
            <Button type="submit" loading={busy}>
              Gönder
            </Button>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}

function ForbiddenModal({ opened }: { opened: boolean }) {
  const [left, setLeft] = useState(FORBIDDEN_COUNTDOWN);

  useEffect(() => {
    if (!opened) return;
    const timer = window.setInterval(() => setLeft((n) => n - 1), 1000);
    return () => window.clearInterval(timer);
  }, [opened]);

  useEffect(() => {
    if (opened && left <= 0) window.location.assign(SAHA_URL);
  }, [opened, left]);

  return (
    <Modal
      opened={opened}
      onClose={() => window.location.assign(SAHA_URL)}
      withCloseButton={false}
      closeOnClickOutside={false}
      title={
        <>
          <i className="fas fa-exclamation-triangle" aria-hidden /> Erişim Reddedildi
        </>
      }
      centered
      size="sm"
    >
      <Stack gap="xs">
        <Text>Bu sisteme erişim yetkiniz bulunmamaktadır.</Text>
        <Text c="dimmed">Yönlendiriliyorsunuz...</Text>
        <div className={classes.modalActions}>
          <Button data-autofocus onClick={() => window.location.assign(SAHA_URL)}>
            Tamam ({Math.max(left, 0)})
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
