'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { unavailableReason, useQueryState, type QueryState } from '@/hooks/useQueryState';
import { CHOOSER_URL, ISSUE_TEMPLATES, newIssueUrl } from '@/lib/graph-support-templates';
import type { IssueForm, IssueFormField, IssueFormValues } from '@/lib/issue-form';
import { cn } from '@/lib/utils';
import { fetchIssueForms, fileIssue, IssueRejected, type IssueFormsResponse } from '@/lib/api';

const INPUT_CLASS =
  'w-full rounded-lg border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-2.5 ' +
  'text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--border-mid)] focus:outline-none';

export default function NewIssueForm({ initialTitle = '' }: { initialTitle?: string }) {
  const query = useQuery({ queryKey: ['graph-support-forms'], queryFn: fetchIssueForms });
  const state = useQueryState(query);

  const [title, setTitle] = useState(initialTitle);
  const [chosen, setChosen] = useState<IssueForm | null>(null);
  const [values, setValues] = useState<IssueFormValues>({});
  const [handle, setHandle] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [filed, setFiled] = useState<{ number: number; url: string } | null>(null);

  if (filed) return <Filed number={filed.number} url={filed.url} />;

  // Losing the forms means losing the in-page composer, not the ability to report anything: the
  // links below are the route this page had before it could file, and they still work.
  if (state.kind !== 'ready' || !state.data.canFile) {
    return (
      <Fallback
        title={title}
        setTitle={setTitle}
        loading={state.kind === 'loading'}
        reason={fallbackReason(state)}
      />
    );
  }

  const forms = state.data.templates;

  function choose(form: IssueForm) {
    setChosen(form);
    setValues({});
    setErrors([]);
    if (title.trim() === '' && form.titlePrefix) setTitle(form.titlePrefix);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setSending(true);
    setErrors([]);
    try {
      const issue = await fileIssue({
        template: chosen.file,
        title,
        values,
        handle: handle.trim() || undefined,
        website: honeypot,
      });
      setFiled(issue);
    } catch (e) {
      // A refusal names the fields it wants; anything else is the request not arriving, and the
      // difference matters because only one of the two is worth trying again unchanged.
      setErrors(
        e instanceof IssueRejected
          ? e.reasons
          : ['The issue could not be sent. Your answers are still here.'],
      );
    } finally {
      setSending(false);
    }
  }

  if (!chosen) {
    return (
      <div>
        <TitleField title={title} setTitle={setTitle} />
        <h2 className="mb-1 text-sm font-semibold tracking-tight text-[var(--text)]">
          Which of these is it?
        </h2>
        <p className="mb-4 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
          Picking the right one sets the labels, which is what decides who looks at it.
        </p>
        <div className="space-y-2">
          {forms.map((form) => (
            <button
              key={form.file}
              type="button"
              onClick={() => choose(form)}
              className={cn(
                'group flex w-full items-start gap-3 rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)]',
                'bg-[var(--bg-surface)] px-4 py-3 text-left transition-colors hover:border-[var(--border-mid)]',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--text)] transition-colors group-hover:text-[var(--accent-text)]">
                  {form.name}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
                  {form.description}
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {form.labels.map((l) => (
                    <Badge key={l} variant="default">
                      {l}
                    </Badge>
                  ))}
                </span>
              </span>
            </button>
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

  return (
    <form onSubmit={submit}>
      <button
        type="button"
        onClick={() => setChosen(null)}
        className="mb-5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
      >
        &larr; {chosen.name}
      </button>

      <TitleField title={title} setTitle={setTitle} />

      <div className="space-y-6">
        {chosen.fields.map((field, i) =>
          field.type === 'markdown' ? (
            <p
              key={`md-${i}`}
              className="whitespace-pre-line rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-xs leading-relaxed text-[var(--text-muted)]"
            >
              {asPlainText(field.value ?? '')}
            </p>
          ) : (
            <Field
              key={field.id}
              field={field}
              value={field.id ? values[field.id] : undefined}
              onChange={(v) =>
                setValues((prev) => ({ ...prev, ...(field.id ? { [field.id]: v } : {}) }))
              }
            />
          ),
        )}
      </div>

      <div className="mt-6">
        <label htmlFor="handle" className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
          Who should we credit? Optional.
        </label>
        <input
          id="handle"
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@yourhandle on GitHub, or your Discord name"
          className={INPUT_CLASS}
        />
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
          Issues filed from here are opened by the archive&rsquo;s own account, not yours, so this
          line is the only thing that says the report is yours. Watch the thread on GitHub to get
          the replies.
        </p>
      </div>

      {/* Not shown to anyone. A bot filling every field it finds fails here rather than at GitHub. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="hidden"
      />

      {errors.length > 0 && (
        <ul className="mt-5 space-y-1 rounded-[var(--radius-card)] border-[0.5px] border-[var(--red-dim)] bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--red-text)]">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={sending}
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? 'Filing…' : 'File the issue'}
        </button>
        <a
          href={newIssueUrl(chosen, title)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
        >
          Or file it on GitHub under your own name
        </a>
      </div>
    </form>
  );
}

function TitleField({ title, setTitle }: { title: string; setTitle: (t: string) => void }) {
  return (
    <div className="mb-8">
      <label htmlFor="issue-title" className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
        What are you seeing? Paste the literal error if you have one.
      </label>
      <input
        id="issue-title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="bad indexers: BadResponse(400) on every allocated indexer"
        className={INPUT_CLASS}
      />
      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-faint)]">
        This becomes the title, and it is the whole reason anyone finds the thread later.
      </p>
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: IssueFormField;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const label = (
    <>
      <span className="text-xs font-medium text-[var(--text-muted)]">
        {field.label}
        {field.required && <span className="ml-1 text-[var(--red-text)]">*</span>}
      </span>
      {field.description && (
        <span className="mt-1 block text-[11px] leading-relaxed text-[var(--text-faint)]">
          {asPlainText(field.description)}
        </span>
      )}
    </>
  );

  if (field.type === 'checkboxes') {
    const ticked = Array.isArray(value) ? value : [];
    return (
      <div>
        <div className="mb-2">{label}</div>
        <div className="space-y-1.5">
          {(field.checkboxes ?? []).map((box) => (
            <label key={box.label} className="flex items-start gap-2 text-xs text-[var(--text)]">
              <input
                type="checkbox"
                checked={ticked.includes(box.label)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...ticked, box.label]
                      : ticked.filter((t) => t !== box.label),
                  )
                }
                className="mt-0.5"
              />
              <span>
                {box.label}
                {box.required && <span className="ml-1 text-[var(--red-text)]">*</span>}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === 'dropdown') {
    return (
      <div>
        <label htmlFor={field.id} className="mb-1.5 block">
          {label}
        </label>
        <select
          id={field.id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Choose one</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label htmlFor={field.id} className="mb-1.5 block">
          {label}
        </label>
        <textarea
          id={field.id}
          rows={field.render ? 8 : 5}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cn(INPUT_CLASS, field.render && 'font-mono text-xs')}
        />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={field.id} className="mb-1.5 block">
        {label}
      </label>
      <input
        id={field.id}
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={INPUT_CLASS}
      />
    </div>
  );
}

function Filed({ number, url }: { number: number; url: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-5 py-6">
      <h2 className="text-sm font-semibold text-[var(--text)]">Filed as #{number}</h2>
      <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">
        It is in the archive now. Replies land on the GitHub thread, so watch it there if you want
        to see them.
      </p>
      <div className="mt-4 flex items-center gap-4">
        <Link
          href={`/support/${number}`}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          Read it on Lodestar
        </Link>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
        >
          View on GitHub
        </a>
      </div>
    </div>
  );
}

/** The chooser as it was before this page could file: six links into GitHub's own form. */
function Fallback({
  title,
  setTitle,
  loading,
  reason,
}: {
  title: string;
  setTitle: (t: string) => void;
  loading: boolean;
  reason?: string;
}) {
  return (
    <div>
      <TitleField title={title} setTitle={setTitle} />
      {reason && <p className="mb-4 text-xs text-[var(--text-faint)]">{reason}</p>}
      {loading && <p className="mb-4 text-xs text-[var(--text-faint)]">Reading the issue forms…</p>}
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
            </span>
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

/**
 * Why the composer is not being shown, when it is not.
 *
 * The links underneath work either way, which is exactly why this has to be said: a reader who is
 * not told would take the bounce-out for the design rather than for a fault.
 */
function fallbackReason(state: QueryState<IssueFormsResponse>): string | undefined {
  if (state.kind === 'ready') {
    return state.data.canFile
      ? undefined
      : 'Filing from Lodestar is not switched on yet, so these open GitHub\u2019s own form.';
  }
  if (state.kind === 'loading') return undefined;
  return `${unavailableReason(state) ?? 'The issue forms could not be read.'} These open GitHub\u2019s own form instead.`;
}

/**
 * Template prose is markdown, and this page renders it as text.
 *
 * The line breaks have to go as well as the syntax: the YAML wraps its paragraphs at eighty
 * columns, and `whitespace-pre-line` would honour every one of them, so a sentence arrives broken
 * across three lines at whatever width the file happened to use.
 */
function asPlainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`]/g, '')
    .split(/\n{2,}/)
    .map((para) => para.replace(/\s*\n\s*/g, ' ').trim())
    .filter((para) => para !== '')
    .join('\n\n');
}
