import {
  Button,
  createTheme,
  Input,
  InputWrapper,
  Menu,
  Modal,
  Paper,
  Popover,
  Table,
  type MantineColorsTuple,
} from '@mantine/core';
import classes from './styles/components.module.css';
import modalClasses from './ui/Modal.module.css';

// GEMKOM red (#8b0000, the logo's red) at shade 7; shade 8 is the hover.
const gemkom: MantineColorsTuple = [
  '#fff0f0',
  '#ffdede',
  '#f9b9b9',
  '#f39191',
  '#ec6b6b',
  '#d94141',
  '#b81c1c',
  '#8b0000',
  '#730000',
  '#5c0000',
];

const sans = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';

// Direction B "Kırmızı bant" of the GEMKOM İç Sistem design system. Colours,
// shadows and layout sizes are CSS variables in styles/global.css.
export const theme = createTheme({
  primaryColor: 'gemkom',
  primaryShade: 7,
  colors: { gemkom },
  defaultRadius: 'md',
  // Mantine transitions (modals, menus) stand still under prefers-reduced-motion.
  respectReducedMotion: true,
  fontFamily: sans,
  fontFamilyMonospace: '"IBM Plex Mono", Consolas, ui-monospace, monospace',
  headings: { fontFamily: sans, fontWeight: '700' },
  fontSizes: { xs: '12px', sm: '14px', md: '14px', lg: '16px', xl: '20px' },
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '14px', xl: '20px' },
  shadows: {
    xs: '0 1px 2px rgba(16, 24, 40, 0.05)',
    sm: '0 1px 2px rgba(16, 24, 40, 0.05), 0 4px 16px rgba(16, 24, 40, 0.05)',
    md: '0 1px 2px rgba(16, 24, 40, 0.05), 0 4px 16px rgba(16, 24, 40, 0.05)',
    lg: '0 10px 28px rgba(16, 24, 40, 0.12)',
    xl: '0 12px 32px rgba(16, 24, 40, 0.18)',
  },
  components: {
    Button: Button.extend({ classNames: { root: classes.button } }),
    Input: Input.extend({ classNames: { input: classes.input } }),
    InputWrapper: InputWrapper.extend({ classNames: { label: classes.inputLabel } }),
    Menu: Menu.extend({ classNames: { dropdown: classes.dropdown } }),
    Modal: Modal.extend({
      defaultProps: {
        radius: 'lg',
        overlayProps: { color: '#1f2933', backgroundOpacity: 0.5, blur: 2 },
        transitionProps: { transition: 'pop', duration: 180, timingFunction: 'ease-out' },
      },
      classNames: { root: modalClasses.root, content: modalClasses.content },
    }),
    Popover: Popover.extend({ classNames: { dropdown: classes.dropdown } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    Table: Table.extend({
      classNames: { table: classes.table, th: classes.tableTh, td: classes.tableTd, tr: classes.tableTr },
    }),
  },
});
