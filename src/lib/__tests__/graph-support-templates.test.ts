/**
 * The chooser's links.
 *
 * A wrong `template` parameter does not error: GitHub quietly falls back to its own chooser, so a
 * broken link here looks like a working one and the labels the template would have set never
 * arrive. Hence assertions on the exact filenames.
 */
import { describe, it, expect } from 'vitest';

import {
  CHOOSER_URL,
  ISSUE_TEMPLATES,
  newIssueUrl,
} from '../graph-support-templates';

describe('the issue templates', () => {
  it('carries all six the repository defines', () => {
    expect(ISSUE_TEMPLATES.map((t) => t.file)).toEqual([
      '01-query-error.yml',
      '02-subgraph.yml',
      '03-indexer.yml',
      '04-docs.yml',
      '05-question.yml',
      '06-symptom.yml',
    ]);
  });

  it('gives every template a label set, since that is what routes it', () => {
    for (const t of ISSUE_TEMPLATES) {
      expect(t.labels.length, t.file).toBeGreaterThan(0);
      // Everything arrives untriaged, and the triage process starts from that label.
      expect(t.labels, t.file).toContain('status/triage');
    }
  });

  it('names labels that match the taxonomy rather than inventing them', () => {
    const known = /^(status|area|owner|kind)\//;
    for (const t of ISSUE_TEMPLATES) {
      for (const l of t.labels) expect(l, `${t.file}: ${l}`).toMatch(known);
    }
  });
});

describe('the link into GitHub', () => {
  it('names the template file, which is what sets the labels', () => {
    const url = new URL(newIssueUrl(ISSUE_TEMPLATES[0]));
    expect(url.origin + url.pathname).toBe(
      'https://github.com/nightswatchhq/graph-support/issues/new',
    );
    expect(url.searchParams.get('template')).toBe('01-query-error.yml');
  });

  it('seeds the title when the reporter has already typed the error', () => {
    const url = new URL(newIssueUrl(ISSUE_TEMPLATES[0], 'bad indexers: BadResponse(400)'));
    expect(url.searchParams.get('title')).toBe('bad indexers: BadResponse(400)');
  });

  it('escapes a title rather than breaking the query string', () => {
    // Real titles carry &, # and = from error text and block numbers.
    const nasty = 'block #93438795 & shard_d_redux = missing';
    const url = new URL(newIssueUrl(ISSUE_TEMPLATES[1], nasty));
    expect(url.searchParams.get('title')).toBe(nasty);
    expect(url.searchParams.get('template')).toBe('02-subgraph.yml');
  });

  it('omits an empty or whitespace title rather than seeding a blank one', () => {
    expect(newIssueUrl(ISSUE_TEMPLATES[0], '   ')).not.toContain('title=');
    expect(newIssueUrl(ISSUE_TEMPLATES[0])).not.toContain('title=');
  });

  it('offers GitHub’s own chooser as the way out', () => {
    expect(CHOOSER_URL).toBe(
      'https://github.com/nightswatchhq/graph-support/issues/new/choose',
    );
  });
});
