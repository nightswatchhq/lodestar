/**
 * GitHub issue forms, parsed from the YAML the repository actually ships.
 *
 * The six templates are mirrored into kittiwake verbatim, so the compose page renders whatever
 * `nightswatchhq/graph-support` currently declares rather than a copy that drifts from it. A field
 * added there appears here on the mirror's next run, and nothing in Lodestar has to be edited.
 *
 * `renderIssueBody` reproduces the markdown GitHub itself composes on submit - `### label`, the
 * value, `_No response_` for an unanswered optional - so a thread filed from here is
 * indistinguishable in the archive from one filed on GitHub.
 */

import { parse } from 'yaml';

export type FieldType = 'input' | 'textarea' | 'dropdown' | 'checkboxes' | 'markdown';

export interface IssueFormField {
  type: FieldType;
  /** Absent on `markdown` blocks, which carry prose and collect nothing. */
  id?: string;
  label?: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  /** `markdown` only: the prose to show above the fields. */
  value?: string;
  /** `dropdown` only. */
  options?: string[];
  multiple?: boolean;
  /** `checkboxes` only, each with its own required flag. */
  checkboxes?: { label: string; required: boolean }[];
  /** `textarea` only: the language its value is fenced in. */
  render?: string;
}

export interface IssueForm {
  file: string;
  name: string;
  description: string;
  /** The seed GitHub puts in the title box, e.g. `[query] `. */
  titlePrefix: string;
  labels: string[];
  fields: IssueFormField[];
}

/** Answers keyed by field id. Checkbox groups hold the labels that were ticked. */
export type IssueFormValues = Record<string, string | string[] | undefined>;

interface RawField {
  type?: unknown;
  id?: unknown;
  attributes?: Record<string, unknown>;
  validations?: Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function parseField(raw: RawField, index: number): IssueFormField | null {
  const type = str(raw.type);
  if (type !== 'input' && type !== 'textarea' && type !== 'dropdown' && type !== 'checkboxes' && type !== 'markdown') {
    return null;
  }

  const attrs = raw.attributes ?? {};
  const required = raw.validations?.required === true;

  // A collecting field with no id cannot be answered or rendered back, so it is given a stable
  // positional one rather than dropped: dropping it would silently lose a question.
  const id = str(raw.id) ?? (type === 'markdown' ? undefined : `field_${index}`);

  const field: IssueFormField = {
    type,
    id,
    label: str(attrs.label),
    description: str(attrs.description),
    placeholder: str(attrs.placeholder),
    required,
    value: str(attrs.value),
    render: str(attrs.render),
  };

  if (type === 'dropdown') {
    const options = Array.isArray(attrs.options) ? attrs.options.map(String) : [];
    field.options = options;
    field.multiple = attrs.multiple === true;
  }

  if (type === 'checkboxes') {
    const raws = Array.isArray(attrs.options) ? attrs.options : [];
    field.checkboxes = raws
      .map((o) => {
        const box = o as Record<string, unknown>;
        const label = str(box.label);
        return label
          ? { label, required: (box.required as boolean) === true }
          : null;
      })
      .filter((b): b is { label: string; required: boolean } => b !== null);
  }

  return field;
}

/** Throws on YAML that is not an issue form, which is the only useful answer for a broken mirror. */
export function parseIssueForm(file: string, yaml: string): IssueForm {
  const doc = parse(yaml) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') throw new Error(`${file}: not a YAML mapping`);

  const body = Array.isArray(doc.body) ? (doc.body as RawField[]) : [];
  const fields = body.map(parseField).filter((f): f is IssueFormField => f !== null);
  if (fields.length === 0) throw new Error(`${file}: no fields`);

  return {
    file,
    name: str(doc.name) ?? file,
    description: str(doc.description) ?? '',
    titlePrefix: str(doc.title) ?? '',
    labels: Array.isArray(doc.labels) ? doc.labels.map(String) : [],
    fields,
  };
}

/** The fields a reporter answers, in order. */
export function answerableFields(form: IssueForm): IssueFormField[] {
  return form.fields.filter((f) => f.type !== 'markdown' && f.id);
}

function valueFor(field: IssueFormField, values: IssueFormValues): string | string[] | undefined {
  return field.id ? values[field.id] : undefined;
}

/** Empty strings count as unanswered; a required field answered with spaces is not answered. */
export function validateIssueForm(form: IssueForm, values: IssueFormValues): string[] {
  const errors: string[] = [];

  for (const field of answerableFields(form)) {
    const value = valueFor(field, values);
    const label = field.label ?? field.id ?? 'a field';

    if (field.type === 'checkboxes') {
      const ticked = Array.isArray(value) ? value : [];
      for (const box of field.checkboxes ?? []) {
        if (box.required && !ticked.includes(box.label)) errors.push(`"${box.label}" must be ticked`);
      }
      continue;
    }

    if (field.type === 'dropdown') {
      const chosen = Array.isArray(value) ? value : value ? [value] : [];
      const unknown = chosen.filter((c) => !(field.options ?? []).includes(c));
      if (unknown.length > 0) errors.push(`${label}: "${unknown[0]}" is not one of the options`);
      if (field.required && chosen.length === 0) errors.push(`${label} is required`);
      continue;
    }

    const text = typeof value === 'string' ? value.trim() : '';
    if (field.required && text === '') errors.push(`${label} is required`);
  }

  return errors;
}

function renderValue(field: IssueFormField, values: IssueFormValues): string {
  const value = valueFor(field, values);

  if (field.type === 'checkboxes') {
    const ticked = Array.isArray(value) ? value : [];
    const lines = (field.checkboxes ?? []).map(
      (box) => `- [${ticked.includes(box.label) ? 'x' : ' '}] ${box.label}`,
    );
    return lines.join('\n');
  }

  if (field.type === 'dropdown') {
    const chosen = Array.isArray(value) ? value : value ? [value] : [];
    return chosen.length > 0 ? chosen.join(', ') : NO_RESPONSE;
  }

  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') return NO_RESPONSE;
  // `render` fences the answer in the language the template declared, which is what makes a JSON
  // error or a GraphQL query readable in the thread rather than one reflowed paragraph.
  return field.render ? `\`\`\`${field.render}\n${text}\n\`\`\`` : text;
}

const NO_RESPONSE = '_No response_';

/** The markdown GitHub would have composed for the same answers. */
export function renderIssueBody(form: IssueForm, values: IssueFormValues): string {
  const blocks = answerableFields(form).map(
    (field) => `### ${field.label ?? field.id}\n\n${renderValue(field, values)}`,
  );
  return blocks.join('\n\n');
}

/**
 * The provenance line every issue filed from here carries.
 *
 * It exists because the credential is one account: without this the archive would show every
 * report as opened by the maintainer, and that repository credits reporters by name and answers
 * them in the thread. A handle is optional, and saying nobody left one is better than implying the
 * account is the reporter.
 */
export function provenanceFooter(handle?: string): string {
  const who = handle?.trim();
  return who
    ? `---\n\nFiled through [Lodestar](https://www.lodestar-dashboard.com/support) on behalf of ${who}, who is not the account that opened this thread.`
    : `---\n\nFiled through [Lodestar](https://www.lodestar-dashboard.com/support). The reporter left no handle, so the account that opened this thread is not theirs.`;
}
