/**
 * Which columns a big table shows, and how tightly, remembered per table in localStorage.
 *
 * Only a choice the reader made is stored. A column nobody has touched keeps its default, including
 * the breakpoint that hides it on a narrow screen, so a first visit looks exactly as it did.
 */

export type Density = 'comfortable' | 'compact';

export type ColumnSpec = {
  id: string;
  label: string;
  /** Shown until the reader says otherwise. Defaults to true. */
  defaultVisible?: boolean;
  /** The breakpoint below which the default hides it. */
  hideBelow?: 'sm' | 'md' | 'lg';
};

export type TablePrefs = { columns: Record<string, boolean>; density: Density };

export const DEFAULT_PREFS: TablePrefs = { columns: {}, density: 'comfortable' };

// Written out whole so Tailwind sees each class.
const HIDE_BELOW: Record<NonNullable<ColumnSpec['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

function key(table: string): string {
  return `lodestar:table:${table}`;
}

export function parseColumnChoices(value: unknown): Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [id, on] of Object.entries(value)) {
    if (typeof on === 'boolean') out[id] = on;
  }
  return out;
}

export function loadTablePrefs(storage: Pick<Storage, 'getItem'> | undefined, table: string): TablePrefs {
  try {
    const raw = storage?.getItem(key(table));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS;
    const p = parsed as { columns?: unknown; density?: unknown };
    return {
      columns: parseColumnChoices(p.columns),
      density: p.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveTablePrefs(
  storage: Pick<Storage, 'setItem'> | undefined,
  table: string,
  prefs: TablePrefs,
): TablePrefs {
  try {
    storage?.setItem(key(table), JSON.stringify(prefs));
  } catch {
    // Kept for this visit only.
  }
  return prefs;
}

export function isColumnVisible(spec: ColumnSpec, columns: Record<string, boolean>): boolean {
  return columns[spec.id] ?? spec.defaultVisible ?? true;
}

/** The default's breakpoint class, or none once the reader has asked for the column. */
export function columnClass(spec: ColumnSpec, columns: Record<string, boolean>): string {
  if (columns[spec.id] === true || !spec.hideBelow) return '';
  return HIDE_BELOW[spec.hideBelow];
}

/** Flips one column, dropping the choice when it lands back on the default. */
export function toggleColumn(
  spec: ColumnSpec,
  columns: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...columns };
  const on = !isColumnVisible(spec, columns);
  if (on === (spec.defaultVisible ?? true) && !(on && spec.hideBelow)) delete next[spec.id];
  else next[spec.id] = on;
  return next;
}
