import { hasRouteAccess } from '@/auth/accessControl';
import { REPORT_DEPARTMENTS } from '@/routes/reportCatalog';
import { ActionIcon, Button, Select, TextInput } from '@mantine/core';
import { useMemo, useState, type MouseEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { AppLink, useAppNavigate } from '@/shell/AppLink';
import { FaIcon, PageHeader, useUrlFilters } from '@/ui';
import ui from '@/ui/ui.module.css';
import {
  catalogItems,
  departmentOptions,
  FAVOURITES_GROUP,
  groupByTopic,
  matchesSearch,
  readFavourites,
  writeFavourites,
  type CatalogItem,
} from './catalog';
import classes from './ReportCatalog.module.css';

// Each topic keeps one card colour; red stays out of cards.
const TOPIC_FAMILY: Record<string, string> = {
  maliyet: 'orange',
  verimlilik: 'green',
  uretim: 'blue',
  personel: 'purple',
  bakim: 'yellow',
  satinalma: 'blue',
  finans: 'green',
  yonetim: 'grey',
  canli: 'blue',
  sistem: 'grey',
};

function useFavourites() {
  const { user } = useAuth();
  const userId = user?.id ?? 'anon';
  const [routes, setRoutes] = useState(() => readFavourites(userId));
  const set = useMemo(() => new Set(routes), [routes]);
  const toggle = (route: string) => {
    const next = set.has(route) ? routes.filter((r) => r !== route) : [...routes, route];
    setRoutes(next);
    writeFavourites(userId, next);
  };
  return { favourites: set, toggle };
}

function fromControl(event: MouseEvent) {
  return event.target instanceof Element && event.target.closest('a, button') !== null;
}

function ReportCard({
  item,
  favourite,
  onToggleFavourite,
}: {
  item: CatalogItem;
  favourite: boolean;
  onToggleFavourite: () => void;
}) {
  const navigate = useAppNavigate();
  const { entry, link } = item;
  return (
    <article
      className={ui.hubCard}
      data-family={TOPIC_FAMILY[entry.topic] ?? 'grey'}
      data-link
      // The whole card opens the report, as on the hubs; the title link keeps
      // middle-click / new tab, and the star handles itself.
      onClick={(event) => !fromControl(event) && navigate(link)}
    >
      <FaIcon icon={entry.icon} className={ui.hubWatermark} />
      <h3 className={ui.hubTitle}>
        <FaIcon icon={entry.icon} className={ui.hubTitleIcon} />
        <AppLink to={link}>{entry.title}</AppLink>
      </h3>
      <p className={classes.question}>{entry.question}</p>
      <div className={classes.cardFoot}>
        <span className={classes.departments}>
          {entry.departments.map((d) => REPORT_DEPARTMENTS[d] ?? d).join(' · ')}
        </span>
        <ActionIcon
          variant="subtle"
          color={favourite ? 'yellow' : 'gray'}
          aria-label={favourite ? `${entry.title}: favorilerden çıkar` : `${entry.title}: favorilere ekle`}
          aria-pressed={favourite}
          onClick={onToggleFavourite}
        >
          <FaIcon icon={favourite ? 'fas fa-star' : 'far fa-star'} />
        </ActionIcon>
      </div>
    </article>
  );
}

export interface ReportCatalogProps {
  title: string;
  subtitle: string;
  /** A hub's departments; missing = every report. */
  departments?: readonly string[];
  backTo?: string;
}

/**
 * The searchable report catalog: only reports the user can open, grouped by
 * topic, favourites pinned on top. /reports shows all of it; each report hub
 * shows its departments' part. Search and department live in the URL.
 */
export function ReportCatalog({ title, subtitle, departments, backTo }: ReportCatalogProps) {
  const { values, apply } = useUrlFilters({ q: '', dept: '' });
  const { favourites, toggle } = useFavourites();
  const scope = departments ?? [];

  const inScope = catalogItems({ departments: scope }, hasRouteAccess);
  const options = departmentOptions(inScope, scope);
  const department = options.some((o) => o.value === values.dept) ? values.dept : '';
  const items = (department ? catalogItems({ departments: scope, department }, hasRouteAccess) : inScope).filter(
    (item) => matchesSearch(item.entry, values.q),
  );
  const groups = groupByTopic(items, favourites);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon="fas fa-chart-pie"
        backTo={backTo}
        stats={[{ id: 'report-count', label: 'Rapor', value: inScope.length }]}
        actions={
          departments ? (
            <Button component={AppLink} to="/reports" variant="default" leftSection={<FaIcon icon="fas fa-th-large" />}>
              Tüm Raporlar
            </Button>
          ) : undefined
        }
      />

      <div className={`${ui.panel} ${classes.toolbar}`}>
        <TextInput
          className={classes.search}
          aria-label="Rapor ara"
          placeholder="Rapor ara: maliyet, mesai, tedarikçi…"
          leftSection={<FaIcon icon="fas fa-search" />}
          value={values.q}
          onChange={(event) => apply({ q: event.currentTarget.value })}
        />
        {options.length > 1 ? (
          <Select
            className={classes.department}
            aria-label="Departman"
            placeholder="Tüm departmanlar"
            clearable
            data={options}
            value={department || null}
            onChange={(value) => apply({ dept: value ?? '' })}
          />
        ) : null}
      </div>

      {inScope.length === 0 ? (
        <p className={classes.empty}>Açabileceğiniz bir rapor yok.</p>
      ) : groups.length === 0 ? (
        <p className={classes.empty}>Aramanıza uyan rapor yok.</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className={classes.group} aria-labelledby={`report-group-${group.key}`}>
            <h2 id={`report-group-${group.key}`} className={classes.groupTitle}>
              {group.key === FAVOURITES_GROUP ? <FaIcon icon="fas fa-star" color="var(--mantine-color-yellow-6)" /> : null}
              {group.label}
              <span className={classes.groupCount}>{group.items.length}</span>
            </h2>
            <div className={ui.hubGrid}>
              {group.items.map((item) => (
                <ReportCard
                  key={item.entry.route}
                  item={item}
                  favourite={favourites.has(item.entry.route)}
                  onToggleFavourite={() => toggle(item.entry.route)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
