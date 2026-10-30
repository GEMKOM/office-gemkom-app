import { forwardRef, useCallback, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { isMigratedRoute } from '@/routes/migrated';

function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function isInternal(to: string) {
  return to.startsWith('/') && !to.startsWith('//');
}

/**
 * Navigate to an app path: client-side when the target is a React route, a full
 * page load when it is still a legacy page.
 */
export function useAppNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: string, options?: { replace?: boolean }) => {
      if (isInternal(to) && isMigratedRoute(to)) {
        navigate(to, options);
      } else if (options?.replace) {
        window.location.replace(to);
      } else {
        window.location.assign(to);
      }
    },
    [navigate],
  );
}

export type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

/**
 * An <a> that works across the React/legacy boundary. It keeps a real href, so
 * middle-click and "open in new tab" behave like any link.
 */
export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink(
  { to, onClick, target, ...rest },
  ref,
) {
  const navigate = useAppNavigate();
  return (
    <a
      ref={ref}
      href={to}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || target === '_blank' || !isPlainLeftClick(event)) return;
        if (isInternal(to) && isMigratedRoute(to)) {
          event.preventDefault();
          navigate(to);
        }
      }}
      {...rest}
    />
  );
});
