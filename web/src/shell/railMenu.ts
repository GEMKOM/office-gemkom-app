import type { MenuProps } from '@mantine/core';
import classes from './shell.module.css';

/** The graphite dropdown every rail menu uses (sections, user menu). */
export const railMenuClassNames: MenuProps['classNames'] = {
  dropdown: classes.flyout,
  item: classes.flyoutItem,
  label: classes.flyoutLabel,
  divider: classes.flyoutDivider,
};
