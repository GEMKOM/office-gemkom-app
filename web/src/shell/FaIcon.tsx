import { FaIcon as BaseIcon, type FaIconProps } from '@/ui/FaIcon';

/** Menu icons get a fixed width so labels line up, like the legacy navbar's me-1 icons. */
export function FaIcon(props: FaIconProps) {
  return <BaseIcon {...props} style={{ width: 16, textAlign: 'center', ...props.style }} />;
}
