// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortHeader } from '../SortHeader';

function header(sort: { key: 'allocated' | 'signalled'; dir: 'asc' | 'desc' } | null, onSort = vi.fn()) {
  render(
    <table>
      <thead>
        <tr>
          <SortHeader label="Allocated" sortKey="allocated" sort={sort} onSort={onSort} align="right" />
        </tr>
      </thead>
    </table>,
  );
  return onSort;
}

describe('SortHeader', () => {
  it('asks to sort by its own column when clicked', () => {
    const onSort = header(null);
    fireEvent.click(screen.getByRole('button', { name: /Allocated/ }));
    expect(onSort).toHaveBeenCalledWith('allocated');
  });

  it('tells assistive technology which way the column is sorted', () => {
    header({ key: 'allocated', dir: 'desc' });
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending');
  });

  it('reports no sort when another column is sorted', () => {
    header({ key: 'signalled', dir: 'asc' });
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none');
  });
});
