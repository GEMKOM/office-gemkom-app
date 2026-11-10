import { Tooltip, UnstyledButton } from '@mantine/core';
import { Fragment, memo, useMemo, type MouseEvent, type ReactNode } from 'react';
import { AppLink } from '@/shell/AppLink';
import type { DataTableColumn } from '@/ui/DataTable/types';
import { FaIcon } from '@/ui/FaIcon';
import { notify } from '@/ui/notify';
import {
  cellNumber,
  jobOrderHref,
  parseMarkdown,
  type Block,
  type Inline,
  type TableText,
} from './markdown';
import classes from './neo.module.css';
import { closeNeo } from './neoStore';

// h2 is the panel's own title; answers start one below it.
const HEADING_TAGS = { 1: 'h3', 2: 'h4', 3: 'h5', 4: 'h6' } as const;

/** On phones the panel covers the page: following a link closes it. */
function onAppLinkClick(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  try {
    if (window.matchMedia('(max-width: 47.99em)').matches) closeNeo();
  } catch {
    // No matchMedia (tests): leave the panel as it is.
  }
}

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineNode key={index} node={node} />
      ))}
    </>
  );
}

function InlineNode({ node }: { node: Inline }): ReactNode {
  switch (node.type) {
    case 'text':
      return node.text;
    case 'br':
      return <br />;
    case 'strong':
      return (
        <strong>
          <InlineNodes nodes={node.children} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <InlineNodes nodes={node.children} />
        </em>
      );
    case 'del':
      return (
        <del>
          <InlineNodes nodes={node.children} />
        </del>
      );
    case 'critical':
      return (
        <span className={classes.mdCritical}>
          <InlineNodes nodes={node.children} />
        </span>
      );
    case 'positive':
      return (
        <span className={classes.mdPositive}>
          <InlineNodes nodes={node.children} />
        </span>
      );
    case 'code':
      return <code>{node.text}</code>;
    case 'job':
      return (
        <AppLink to={jobOrderHref(node.jobNo)} className={classes.mdJob} onClick={onAppLinkClick}>
          {node.jobNo}
        </AppLink>
      );
    case 'link':
      return node.external ? (
        <a href={node.href} target="_blank" rel="noopener noreferrer">
          <InlineNodes nodes={node.children} />
        </a>
      ) : (
        <AppLink to={node.href} onClick={onAppLinkClick}>
          <InlineNodes nodes={node.children} />
        </AppLink>
      );
  }
}

/** Downloads a table of the answer as .xlsx; numbers stay numbers. */
async function exportTable(table: TableText) {
  const columns: DataTableColumn<string[]>[] = table.header.map((header, index) => ({
    key: `c${index}`,
    header: header || `Sütun ${index + 1}`,
    accessor: (row: string[]) => {
      const text = row[index] ?? '';
      return cellNumber(text) ?? text;
    },
  }));
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    // Loaded on first use, like the other exports: it stays out of the shell.
    const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
    await exportToExcel(table.rows, columns, { fileName: `neo-tablo-${stamp}`, sheetName: 'Neo' });
  } catch {
    notify.error('Tablo Excel’e aktarılamadı.');
  }
}

function TableBlock({ block, done }: { block: Extract<Block, { type: 'table' }>; done: boolean }) {
  return (
    <div className={classes.mdTableBox}>
      <div className={classes.mdTableScroll}>
        <table className={classes.mdTable}>
          <thead>
            <tr>
              {block.header.map((cell, index) => (
                <th key={index} style={{ textAlign: block.align[index] ?? undefined }}>
                  <InlineNodes nodes={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    style={{ textAlign: block.align[c] ?? undefined }}
                    data-num={cellNumber(block.raw.rows[r]?.[c] ?? '') !== null || undefined}
                  >
                    <InlineNodes nodes={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {done && block.rows.length > 0 && (
        <div className={classes.mdTableFoot} data-copy-exclude>
          <span>{block.rows.length.toLocaleString('tr-TR')} satır</span>
          <Tooltip label="Excel’e aktar" withArrow openDelay={300}>
            <UnstyledButton
              className={classes.mdTableBtn}
              aria-label="Tabloyu Excel’e aktar"
              onClick={() => void exportTable(block.raw)}
            >
              <FaIcon icon="fas fa-file-excel" /> Excel
            </UnstyledButton>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

function Blocks({ blocks, done }: { blocks: Block[]; done: boolean }) {
  return (
    <>
      {blocks.map((block, index) => (
        <BlockNode key={index} block={block} done={done} />
      ))}
    </>
  );
}

function BlockNode({ block, done }: { block: Block; done: boolean }): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = HEADING_TAGS[block.level];
      return (
        <Tag className={classes.mdHeading}>
          <InlineNodes nodes={block.content} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p>
          <InlineNodes nodes={block.content} />
        </p>
      );
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index}>
          <InlineNodes nodes={item.content} />
          {item.children.length > 0 && <Blocks blocks={item.children} done={done} />}
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start === 1 ? undefined : block.start}>{items}</ol>
      ) : (
        <ul>{items}</ul>
      );
    }
    case 'table':
      return <TableBlock block={block} done={done} />;
    case 'code':
      return (
        <pre className={classes.mdPre}>
          <code>{block.text}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote className={classes.mdQuote}>
          <Blocks blocks={block.blocks} done={done} />
        </blockquote>
      );
    case 'hr':
      return <hr className={classes.mdRule} />;
  }
}

/**
 * A Neo answer: Markdown laid out as React elements (no innerHTML). `done`
 * is false while the answer streams; table tools wait for the full table.
 */
export const NeoMarkdown = memo(function NeoMarkdown({
  text,
  done = true,
}: {
  text: string;
  done?: boolean;
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className={`${classes.rich} ${classes.md}`}>
      {blocks.map((block, index) => (
        <Fragment key={index}>
          <BlockNode block={block} done={done} />
        </Fragment>
      ))}
    </div>
  );
});
