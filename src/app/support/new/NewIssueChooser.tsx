'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { CHOOSER_URL, ISSUE_TEMPLATES, newIssueUrl } from '@/lib/graph-support-templates';
import { cn } from '@/lib/utils';

export default function NewIssueChooser({ initialTitle = '' }: { initialTitle?: string }) {
  const [title, setTitle] = useState(initialTitle);

  return (
    <div>
      <div className="mb-8">
        <label
          htmlFor="issue-title"
          className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]"
        >
          What are you seeing? Paste the literal error if you have one.
        </label>
        <input
          id="issue-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='bad indexers: BadResponse(400) on every allocated indexer'
          className="w-full rounded-lg border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--border-mid)] focus:outline-none"
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
          This becomes the title, and it is the whole reason anyone finds the thread later. That
          repository puts the error text in titles deliberately.
        </p>
      </div>

      <h2 className="mb-1 text-sm font-semibold tracking-tight text-[var(--text)]">
        Which of these is it?
      </h2>
      <p className="mb-4 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
        Picking the right one sets the labels, which is what decides who looks at it. If none fit,
        the last option opens a blank issue.
      </p>

      <div className="space-y-2">
        {ISSUE_TEMPLATES.map((t) => (
          <a
            key={t.file}
            href={newIssueUrl(t, title)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'group flex items-start gap-3 rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)]',
              'bg-[var(--bg-surface)] px-4 py-3 transition-colors hover:border-[var(--border-mid)]',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--text)] transition-colors group-hover:text-[var(--accent-text)]">
                {t.name}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
                {t.description}
              </span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {t.labels.map((l) => (
                  <Badge key={l} variant="default">
                    {l}
                  </Badge>
                ))}
              </span>
            </span>
            <svg
              className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        ))}

        <a
          href={CHOOSER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-[var(--radius-card)] border-[0.5px] border-dashed border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-mid)] hover:text-[var(--text)]"
        >
          None of these. Open a blank issue on GitHub.
        </a>
      </div>
    </div>
  );
}
