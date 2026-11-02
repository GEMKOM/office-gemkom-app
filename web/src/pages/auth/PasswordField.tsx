import { PasswordInput, type PasswordInputProps } from '@mantine/core';
import { forwardRef, useState, type KeyboardEvent } from 'react';
import classes from './auth.module.css';

/**
 * Password input with a show/hide toggle that keyboard users can reach, and a
 * Caps Lock warning in a reserved line under it (so the form never shifts).
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordField({ onKeyDown, onKeyUp, onBlur, ...props }, ref) {
    const [capsLock, setCapsLock] = useState(false);
    const [visible, setVisible] = useState(false);
    const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
      // Some key events (autofill, IME) carry no modifier state.
      if (typeof event.getModifierState === 'function') {
        setCapsLock(event.getModifierState('CapsLock'));
      }
    };
    const hintId = props.id ? `${props.id}-caps` : undefined;
    return (
      <div>
        <PasswordInput
          ref={ref}
          visible={visible}
          onVisibilityChange={setVisible}
          visibilityToggleFocusable
          visibilityToggleButtonProps={{
            'aria-label': visible ? 'Şifreyi gizle' : 'Şifreyi göster',
          }}
          aria-describedby={capsLock ? hintId : undefined}
          onKeyDown={(event) => {
            readCapsLock(event);
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            readCapsLock(event);
            onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setCapsLock(false);
            onBlur?.(event);
          }}
          {...props}
        />
        <div className={classes.capsLock} id={hintId} aria-live="polite">
          {capsLock && (
            <>
              <i className="fas fa-arrow-up" aria-hidden />
              Caps Lock açık
            </>
          )}
        </div>
      </div>
    );
  },
);
