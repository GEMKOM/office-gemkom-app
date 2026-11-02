import type { CSSProperties } from 'react';
import type { PositionTreeNode } from '@/api/human_resources/organization';
import { FaIcon } from '@/ui';
import css from './OrgChartPage.module.css';

// Port of components/organization-tree: a centred org chart drawn with nested
// lists (display: table) and CSS connectors.

function stringHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const PALETTE = ['#0d6efd', '#6f42c1', '#20c997', '#dc3545', '#fd7e14', '#198754', '#0dcaf0', '#6610f2', '#d97706', '#0891b2'];

/** A stable accent colour per department code. */
export function departmentColor(code: string | null | undefined): string | null {
  return code ? PALETTE[stringHash(code) % PALETTE.length]! : null;
}

export interface OrgChartProps {
  nodes: PositionTreeNode[];
  collapsed: ReadonlySet<number>;
  onToggle: (id: number) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Lower-cased search term: matches are outlined, the rest dimmed. */
  search: string;
}

export function OrgChart({ nodes, collapsed, onToggle, selectedId, onSelect, search }: OrgChartProps) {
  const renderLevel = (list: PositionTreeNode[], root: boolean) => (
    <ul className={root ? `${css.tree} ${css.root}` : css.tree}>
      {list.map((node) => {
        const id = Number(node.id);
        const children = Array.isArray(node.children) ? node.children : [];
        const hasChildren = children.length > 0;
        const isCollapsed = hasChildren && collapsed.has(id);
        const holders = Number(node.holder_count || 0);
        const color = departmentColor(node.department_code);
        const title = node.title || '';
        const match = search ? title.toLocaleLowerCase('tr-TR').includes(search) : null;
        return (
          <li key={id} className={css.node}>
            <div
              role="button"
              tabIndex={0}
              className={css.card}
              data-vacant={holders === 0 || undefined}
              data-selected={selectedId === id || undefined}
              data-match={match === true || undefined}
              data-dimmed={match === false || undefined}
              style={color ? ({ '--org-dept-color': color } as CSSProperties) : undefined}
              aria-label={`${title || '-'} (${holders} kişi)`}
              aria-pressed={selectedId === id}
              onClick={() => onSelect(id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(id);
                }
              }}
            >
              {color ? <span className={css.accent} /> : null}
              <span className={css.badge} title="Atanmış kullanıcı sayısı">
                {holders}
              </span>
              <div className={css.title}>{title || '-'}</div>
              <div className={css.sub}>
                <span className={css.pill}>
                  <span className={css.dot} />
                  {node.department_code || 'genel'}
                </span>
                <span className={css.pill}>L{node.level ?? '-'}</span>
              </div>
              {hasChildren ? (
                <button
                  type="button"
                  className={css.toggle}
                  title={isCollapsed ? 'Aç' : 'Kapat'}
                  aria-label={`${title} ${isCollapsed ? 'aç' : 'kapat'}`}
                  aria-expanded={!isCollapsed}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(id);
                  }}
                >
                  <FaIcon icon={isCollapsed ? 'fas fa-plus' : 'fas fa-minus'} />
                </button>
              ) : null}
            </div>
            {hasChildren && !isCollapsed ? renderLevel(children, false) : null}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={css.viewport}>
      <div className={css.canvas}>{renderLevel(nodes, true)}</div>
    </div>
  );
}
