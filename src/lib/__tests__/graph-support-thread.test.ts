/**
 * The renderer, and the sanitisation nobody should turn off.
 *
 * These bodies are written by anyone with a GitHub account. The blog posts elsewhere in this repo
 * are ours and this is not, so the difference between them is the whole reason this file exists.
 */
import { describe, it, expect } from 'vitest';

import { renderThreadMarkdown } from '../graph-support-thread';

describe('rendering a thread', () => {
  it('renders the Markdown these write-ups are actually made of', async () => {
    const out = await renderThreadMarkdown(
      '## What happened\n\nEvery allocated indexer answers `BadResponse(400)`.',
    );
    expect(out).toContain('<h2>What happened</h2>');
    expect(out).toContain('<code>BadResponse(400)</code>');
  });

  it('renders the fenced blocks and tables the standard asks for', async () => {
    const out = await renderThreadMarkdown(
      '```\ngraphman copy create\n```\n\n| chain | head |\n|---|---|\n| polygon | 93438795 |',
    );
    expect(out).toContain('<pre>');
    expect(out).toContain('<table>');
  });

  it('neutralises a script tag in a body a stranger filed', async () => {
    // The reason `sanitize: false` must never be added to make some edge case render.
    const out = await renderThreadMarkdown('hello <script>alert(1)</script> world');
    expect(out).not.toContain('<script>');
    expect(out).toContain('hello');
  });

  it('neutralises an event handler smuggled through an image', async () => {
    const out = await renderThreadMarkdown('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('onerror');
  });

  it('does not carry a javascript: link through', async () => {
    const out = await renderThreadMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:alert');
  });

  it('leaves an empty body as empty rather than failing', async () => {
    expect((await renderThreadMarkdown('')).trim()).toBe('');
  });
});
