import { describe, expect, it } from 'vitest';
import {
  CLINIC_PAGE_SIZE,
  collectPages,
  countLabel,
  csvOfPage,
  mergeById,
  pageParams,
  readPage,
} from './paging';

// A fake paged server: `rows` split into pages of `size`, answering { rows, has_more }.
const fakeServer = (rows, size) => {
  const calls = [];
  const fetchPage = async (offset) => {
    calls.push(offset);
    const page = rows.slice(offset, offset + size);
    return { rows: page, has_more: offset + page.length < rows.length };
  };
  return { fetchPage, calls };
};
const opts = { count: (p) => p.rows.length, hasMore: (p) => p.has_more };

describe('collectPages', () => {
  it('walks every page, advancing the offset by what each page held', async () => {
    const server = fakeServer([1, 2, 3, 4, 5], 2);
    const { pages, complete } = await collectPages(server.fetchPage, opts);
    expect(server.calls).toEqual([0, 2, 4]);
    expect(pages.flatMap((p) => p.rows)).toEqual([1, 2, 3, 4, 5]);
    expect(complete).toBe(true);
  });

  it('makes a single call when everything fits in one page', async () => {
    const server = fakeServer([1, 2], 5);
    const { pages, complete } = await collectPages(server.fetchPage, opts);
    expect(server.calls).toEqual([0]);
    expect(pages).toHaveLength(1);
    expect(complete).toBe(true);
  });

  it('stops on an empty page even if the server still claims more', async () => {
    const calls = [];
    const fetchPage = async (offset) => {
      calls.push(offset);
      return offset === 0 ? { rows: [1, 2], has_more: true } : { rows: [], has_more: true };
    };
    const { pages, complete } = await collectPages(fetchPage, opts);
    expect(calls).toEqual([0, 2]);
    expect(pages).toHaveLength(2);
    expect(complete).toBe(true);
  });

  it('reports an incomplete result when maxPages runs out', async () => {
    const server = fakeServer([1, 2, 3, 4, 5, 6], 2);
    const { pages, complete } = await collectPages(server.fetchPage, { ...opts, maxPages: 2 });
    expect(pages).toHaveLength(2);
    expect(complete).toBe(false);
  });

  it('passes errors through', async () => {
    await expect(collectPages(async () => { throw new Error('boom'); }, opts)).rejects.toThrow('boom');
  });
});

describe('csvOfPage', () => {
  it('reads the csv of the paged answer', () => {
    expect(csvOfPage({ csv: 'a,b\r\n', count: 1, has_more: false })).toBe('a,b\r\n');
  });

  it('accepts the older plain-text answer', () => {
    expect(csvOfPage('a,b\r\n')).toBe('a,b\r\n');
  });

  it('gives an empty string for anything else', () => {
    expect(csvOfPage(null)).toBe('');
    expect(csvOfPage({})).toBe('');
    expect(csvOfPage({ csv: 5 })).toBe('');
  });

  it('pages concatenate into one file with a single header', () => {
    const pages = [{ csv: 'H\r\nr1\r\nr2\r\n' }, { csv: 'r3\r\n' }];
    expect(pages.map(csvOfPage).join('')).toBe('H\r\nr1\r\nr2\r\nr3\r\n');
  });
});

describe('pageParams', () => {
  it('leaves p_offset out of the first page', () => {
    expect(pageParams(0)).toEqual({ p_limit: CLINIC_PAGE_SIZE, p_offset: undefined });
    expect(pageParams()).toEqual({ p_limit: CLINIC_PAGE_SIZE, p_offset: undefined });
  });

  it('sends the offset for later pages', () => {
    expect(pageParams(20)).toEqual({ p_limit: 20, p_offset: 20 });
    expect(pageParams(40, 10)).toEqual({ p_limit: 10, p_offset: 40 });
  });
});

describe('readPage', () => {
  it('reads a paged answer', () => {
    const clinics = [{ id: 'a' }, { id: 'b' }];
    expect(readPage({ clinics, count: 2, total: 5, has_more: true })).toEqual({
      clinics,
      total: 5,
      hasMore: true,
    });
  });

  it('copes with the older answer that has no total or has_more', () => {
    const clinics = [{ id: 'a' }, { id: 'b' }];
    expect(readPage({ clinics, count: 2 })).toEqual({ clinics, total: 2, hasMore: false });
  });

  it('never reports more after an empty page', () => {
    expect(readPage({ clinics: [], total: 40, has_more: true })).toEqual({
      clinics: [],
      total: 40,
      hasMore: false,
    });
  });

  it('survives a missing or malformed answer', () => {
    expect(readPage(null)).toEqual({ clinics: [], total: 0, hasMore: false });
    expect(readPage({ clinics: 'nope' })).toEqual({ clinics: [], total: 0, hasMore: false });
  });
});

describe('mergeById', () => {
  it('appends new rows in order', () => {
    expect(mergeById([{ id: 1 }, { id: 2 }], [{ id: 3 }])).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('skips rows that were already shown', () => {
    expect(mergeById([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }])).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });

  it('does not change its inputs', () => {
    const current = [{ id: 1 }];
    mergeById(current, [{ id: 2 }]);
    expect(current).toEqual([{ id: 1 }]);
  });
});

describe('countLabel', () => {
  it('shows progress while more are waiting', () => {
    expect(countLabel(20, 96)).toBe('20 of 96 Clinics');
  });

  it('shows a plain count once everything is loaded', () => {
    expect(countLabel(96, 96)).toBe('96 Clinics');
    expect(countLabel(5, 5)).toBe('5 Clinics');
    expect(countLabel(1, 1)).toBe('1 Clinic');
  });
});
