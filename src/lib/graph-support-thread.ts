/**
 * One graph-support thread, and how it renders.
 *
 * The page shows the thread's own words rather than a summary of them. That repository's triage
 * rules are explicit that an untested theory is labelled as a theory and that a claim which is
 * inference rather than observation says so, and a generated summary cannot preserve either: it
 * flattens "I believe, but have not verified" into a statement of mechanism, which is the single
 * thing those write-ups are most careful not to do.
 *
 * What is derived rather than written is only what the labels already say: whose it is, what area
 * it touches, and how it ended.
 */
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import html from 'remark-html';

import type { SupportIssue } from './graph-support';

/** One reply, as the mirror stores it. */
export interface SupportComment {
  id: number;
  issueNumber: number;
  author: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

/** What `/api/support/{number}` answers. */
export interface SupportThread {
  issue: SupportIssue & { body: string };
  comments: SupportComment[];
  fetchedAt: string;
}

/**
 * Markdown to HTML for text a stranger wrote.
 *
 * `remark-html` sanitises by default and that default is doing real work here: these bodies are
 * filed by anyone with a GitHub account, unlike the blog posts elsewhere in this repo which are
 * ours. **Never pass `sanitize: false` to make a table or an inline `<img>` render.** There is a
 * test below this that fails if somebody does.
 */
export async function renderThreadMarkdown(markdown: string): Promise<string> {
  const file = await remark().use(remarkGfm).use(html).process(markdown);
  return String(file);
}
