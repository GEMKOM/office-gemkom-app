import type { CSSProperties, ReactNode } from 'react';
import { FaIcon } from '../FaIcon';
import classes from './FileAttachments.module.css';
import { useFileDrop, type FileDropOptions } from './useFileDrop';

export interface FileDropTargetProps extends FileDropOptions {
  children: ReactNode;
  /** Shown over the area while files are dragged onto it. Default "Dosyaları buraya bırakın". */
  label?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Lets files be dropped on whatever it wraps (a file input, a button and its
 * list), highlighting the area while they are dragged over it. Picking with a
 * click stays the wrapped control's job.
 */
export function FileDropTarget({
  children,
  label,
  className,
  style,
  ...options
}: FileDropTargetProps) {
  const { over, dropProps } = useFileDrop(options);
  return (
    <div
      className={className ? `${classes.dropTarget} ${className}` : classes.dropTarget}
      style={style}
      data-over={over || undefined}
      data-testid="file-drop-target"
      {...dropProps}
    >
      {children}
      {over ? (
        <div className={classes.dropOverlay} aria-hidden>
          <FaIcon icon="fas fa-cloud-arrow-up" />
          <span>
            {label ?? (options.multiple ? 'Dosyaları buraya bırakın' : 'Dosyayı buraya bırakın')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
