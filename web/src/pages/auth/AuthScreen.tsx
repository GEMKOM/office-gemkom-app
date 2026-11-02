import { useEffect, type ReactNode } from 'react';
import logoMarkOnDark from '@/shell/gemkom-mark-on-dark.png';
import classes from './auth.module.css';

/**
 * The frame of the signed-out pages (login, reset password): no rail, no
 * session. On desktop the brand fills a graphite column (the rail's colour,
 * the mark on dark) beside the form; on a phone it is the red band with the
 * form card rising into it.
 */
export function AuthScreen({
  title,
  subtitle,
  documentTitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  documentTitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = documentTitle;
    return () => {
      document.title = previous;
    };
  }, [documentTitle]);

  return (
    <div className={classes.screen}>
      <header className={classes.brand}>
        <img src={logoMarkOnDark} alt="" className={classes.brandMark} />
        <div>
          <p className={classes.brandName}>GEMKOM</p>
          <p className={classes.brandTagline}>Ofis Personel Giriş Sistemi</p>
        </div>
      </header>
      <main className={classes.main}>
        <section className={classes.card} aria-labelledby="auth-title">
          <img src="/images/gemkom.png" alt="GEMKOM" className={classes.cardLogo} />
          <h1 id="auth-title" className={classes.title}>
            {title}
          </h1>
          <p className={classes.subtitle}>{subtitle}</p>
          {children}
        </section>
        {footer && <div className={classes.footer}>{footer}</div>}
      </main>
    </div>
  );
}

/** One reserved line under a form: shows the message without moving the layout. */
export function FormStatus({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <div className={classes.status} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {children && (
        <>
          <i
            className={tone === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle'}
            aria-hidden
          />
          <span>{children}</span>
        </>
      )}
    </div>
  );
}
