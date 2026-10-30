import { SimpleGrid, Skeleton, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { FaIcon } from './FaIcon';
import classes from './ui.module.css';

export interface StatCard {
  id?: string;
  title: ReactNode;
  value: ReactNode;
  /** Font Awesome classes. Default 'fas fa-chart-bar'. */
  icon?: string;
  /** A Mantine colour, or a legacy Bootstrap name ('primary', 'success', ...). */
  color?: string;
  tooltip?: string;
  onClick?: () => void;
}

export interface StatCardsProps {
  cards: StatCard[];
  /** Replaces each value with a skeleton bar; the cards keep their place. */
  loading?: boolean;
  /** Cards per row on wide screens (legacy itemsPerRow). Default 4. */
  cols?: number;
}

// Bootstrap contextual names the legacy cards used, mapped to Mantine colours.
const BOOTSTRAP_COLORS: Record<string, string> = {
  primary: 'gemkom',
  secondary: 'gray',
  success: 'green',
  danger: 'red',
  warning: 'yellow',
  info: 'cyan',
  dark: 'dark',
  light: 'gray',
};

export function mantineColor(color: string | undefined, fallback = 'gemkom'): string {
  if (!color) return fallback;
  return BOOTSTRAP_COLORS[color] ?? color;
}

export type TileFamily = 'brand' | 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple' | 'grey';

// Legacy Bootstrap names and Mantine colours, mapped to the design system's
// tile families (soft fill, deep glyph). Bootstrap "primary" was blue.
const FAMILIES: Record<string, TileFamily> = {
  primary: 'blue',
  info: 'blue',
  cyan: 'blue',
  blue: 'blue',
  success: 'green',
  green: 'green',
  teal: 'green',
  warning: 'yellow',
  yellow: 'yellow',
  orange: 'orange',
  danger: 'red',
  red: 'red',
  grape: 'purple',
  violet: 'purple',
  purple: 'purple',
  secondary: 'grey',
  dark: 'grey',
  light: 'grey',
  gray: 'grey',
  gemkom: 'brand',
};

export function tileFamily(color: string | undefined): TileFamily {
  return (color && FAMILIES[color]) || 'brand';
}

function CardBody({ card, loading }: { card: StatCard; loading: boolean }) {
  return (
    <div className={classes.stat}>
      <span className={classes.tile} data-family={tileFamily(card.color)} style={{ width: 40, height: 40, fontSize: 16 }}>
        <FaIcon icon={card.icon ?? 'fas fa-chart-bar'} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        {loading ? (
          <Skeleton height={24} width="60%" mb={6} />
        ) : (
          <div className={classes.statValue}>{card.value}</div>
        )}
        <Text className={classes.statLabel} truncate>
          {card.title}
        </Text>
      </div>
    </div>
  );
}

/** Replaces components/statistics-cards on dashboards; list pages put figures in the PageHeader band. */
export function StatCards({ cards, loading = false, cols = 4 }: StatCardsProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: cols }} spacing="md" mb="md">
      {cards.map((card, index) => {
        const body = <CardBody card={card} loading={loading} />;
        const content = card.onClick ? (
          <UnstyledButton onClick={card.onClick} w="100%" h="100%">
            {body}
          </UnstyledButton>
        ) : (
          body
        );
        return (
          <div key={card.id ?? index} id={card.id}>
            {card.tooltip ? <Tooltip label={card.tooltip}>{content}</Tooltip> : content}
          </div>
        );
      })}
    </SimpleGrid>
  );
}
