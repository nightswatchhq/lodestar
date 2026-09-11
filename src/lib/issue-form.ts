/**
 * The shape of a GitHub issue form, as `/api/issue-forms` hands it over.
 *
 * The YAML parse, the validation and the markdown render moved to kittiwake on 2026-09-11
 * (nightswatchhq/kittiwake#113), along with the filing itself: the templates were already mirrored
 * there, and parsing them in two places is two sets of decisions about a schema that is GitHub's.
 * What stays here is the vocabulary the compose page renders a field with.
 *
 * A field added to a template appears in these types as data rather than as a change: the page
 * switches on `type` and shows `label`, `description` and `placeholder` whatever the template says.
 */

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
