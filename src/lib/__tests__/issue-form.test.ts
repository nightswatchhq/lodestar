/**
 * Parsing GitHub issue forms, and composing the body GitHub would have composed.
 *
 * The fixture is a trimmed copy of `01-query-error.yml` as that repository ships it, kept as YAML
 * rather than as an object literal: what this has to survive is the file changing upstream, and an
 * object literal would only test the parser against a shape the parser already agrees with.
 */
import { describe, it, expect } from 'vitest';

import {
  answerableFields,
  parseIssueForm,
  provenanceFooter,
  renderIssueBody,
  validateIssueForm,
} from '../issue-form';

const YAML = `
name: Query fails or returns wrong data
description: A query against a subgraph errors, returns nothing, or returns data you know is wrong.
title: "[query] "
labels: ["status/triage"]
body:
  - type: markdown
    attributes:
      value: |
        **Do not paste an API key.**
  - type: input
    id: deployment
    attributes:
      label: Deployment ID
      placeholder: QmZsgJ
    validations:
      required: true
  - type: dropdown
    id: endpoint
    attributes:
      label: Where are you querying?
      options:
        - The decentralised network gateway (gateway.thegraph.com)
        - Subgraph Studio (api.studio.thegraph.com)
    validations:
      required: true
  - type: textarea
    id: error
    attributes:
      label: The exact response
      render: json
    validations:
      required: true
  - type: textarea
    id: context
    attributes:
      label: When it started, and what you have already tried
  - type: checkboxes
    id: checks
    attributes:
      label: Before filing
      options:
        - label: I redacted my API key
          required: true
        - label: I searched the archive
`;

const form = parseIssueForm('01-query-error.yml', YAML);

describe('parseIssueForm', () => {
  it('reads the header the chooser renders', () => {
    expect(form.name).toBe('Query fails or returns wrong data');
    expect(form.titlePrefix).toBe('[query] ');
    expect(form.labels).toEqual(['status/triage']);
  });

  it('keeps markdown blocks out of the answerable fields', () => {
    expect(form.fields).toHaveLength(6);
    expect(answerableFields(form).map((f) => f.id)).toEqual([
      'deployment',
      'endpoint',
      'error',
      'context',
      'checks',
    ]);
  });

  it('carries the parts that change how a field is rendered', () => {
    const error = answerableFields(form).find((f) => f.id === 'error');
    expect(error?.render).toBe('json');
    expect(error?.required).toBe(true);

    const context = answerableFields(form).find((f) => f.id === 'context');
    expect(context?.required).toBe(false);

    const endpoint = answerableFields(form).find((f) => f.id === 'endpoint');
    expect(endpoint?.options).toHaveLength(2);

    const checks = answerableFields(form).find((f) => f.id === 'checks');
    expect(checks?.checkboxes).toEqual([
      { label: 'I redacted my API key', required: true },
      { label: 'I searched the archive', required: false },
    ]);
  });

  it('refuses YAML that is not an issue form', () => {
    expect(() => parseIssueForm('x.yml', 'just: a scalar')).toThrow(/no fields/);
    expect(() => parseIssueForm('x.yml', '- a\n- list')).toThrow();
  });
});

describe('validateIssueForm', () => {
  const complete = {
    deployment: 'QmZsgJ',
    endpoint: 'Subgraph Studio (api.studio.thegraph.com)',
    error: '{"errors":[]}',
    checks: ['I redacted my API key'],
  };

  it('passes a complete answer', () => {
    expect(validateIssueForm(form, complete)).toEqual([]);
  });

  it('holds a required field that is only whitespace', () => {
    expect(validateIssueForm(form, { ...complete, deployment: '   ' })).toContain(
      'Deployment ID is required',
    );
  });

  it('holds a required checkbox that was not ticked', () => {
    expect(validateIssueForm(form, { ...complete, checks: [] })).toContain(
      '"I redacted my API key" must be ticked',
    );
  });

  it('refuses a dropdown answer that is not one of the options', () => {
    const errors = validateIssueForm(form, { ...complete, endpoint: 'my own laptop' });
    expect(errors[0]).toMatch(/not one of the options/);
  });

  it('does not require the optional field', () => {
    expect(validateIssueForm(form, complete)).toEqual([]);
  });
});

describe('renderIssueBody', () => {
  const body = renderIssueBody(form, {
    deployment: 'QmZsgJ',
    endpoint: 'Subgraph Studio (api.studio.thegraph.com)',
    error: '{"errors":[{"message":"bad indexers"}]}',
    checks: ['I redacted my API key'],
  });

  it('heads each answer with the label, as GitHub does', () => {
    expect(body).toContain('### Deployment ID\n\nQmZsgJ');
    expect(body).toContain('### Where are you querying?\n\nSubgraph Studio');
  });

  it('fences a rendered textarea in the declared language', () => {
    expect(body).toContain('### The exact response\n\n```json\n{"errors"');
    expect(body).toContain('```');
  });

  it('says an optional field went unanswered rather than dropping it', () => {
    expect(body).toContain('### When it started, and what you have already tried\n\n_No response_');
  });

  it('renders checkboxes ticked and unticked', () => {
    expect(body).toContain('- [x] I redacted my API key');
    expect(body).toContain('- [ ] I searched the archive');
  });

  it('omits the markdown block, which collects nothing', () => {
    expect(body).not.toContain('Do not paste an API key');
  });
});

describe('provenanceFooter', () => {
  it('names the reporter when they left a handle', () => {
    expect(provenanceFooter('@someone')).toContain('on behalf of @someone');
  });

  it('says the account is not theirs when they did not', () => {
    expect(provenanceFooter()).toMatch(/left no handle/);
    expect(provenanceFooter('   ')).toMatch(/left no handle/);
  });
});
