import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initialAnswers, missingRequired, renderAnswers, type FormField } from './issueForms';

const FIELDS: FormField[] = [
  { type: 'markdown', text: 'Thanks for writing in.' },
  {
    type: 'input',
    id: 'version',
    label: 'Version',
    description: '',
    placeholder: '',
    value: '1.0',
    required: true,
    render: null,
  },
  {
    type: 'textarea',
    id: 'logs',
    label: 'Logs',
    description: '',
    placeholder: '',
    value: '',
    required: false,
    render: 'shell',
  },
  {
    type: 'dropdown',
    id: 'os',
    label: 'OS',
    description: '',
    options: ['Android', 'iOS'],
    multiple: false,
    required: true,
  },
  {
    type: 'checkboxes',
    id: 'terms',
    label: 'Terms',
    description: '',
    options: [
      { label: 'I searched first', required: true },
      { label: 'I can help', required: false },
    ],
  },
];

test('answers start at each field default, nothing ticked', () => {
  assert.deepEqual(initialAnswers(FIELDS), {
    version: '1.0',
    logs: '',
    os: [],
    terms: [false, false],
  });
});

test('required fields and required ticks are reported by label', () => {
  const answers = initialAnswers(FIELDS);
  assert.deepEqual(missingRequired(FIELDS, answers), ['OS', 'Terms']);
  assert.deepEqual(
    missingRequired(FIELDS, { ...answers, version: '  ', os: ['iOS'], terms: [true, false] }),
    ['Version'],
  );
});

test('the body is written in the website’s own format', () => {
  const body = renderAnswers(FIELDS, {
    version: '2.1',
    logs: 'boom',
    os: ['Android'],
    terms: [true, false],
  });
  assert.equal(
    body,
    [
      '### Version\n\n2.1',
      '### Logs\n\n```shell\nboom\n```',
      '### OS\n\nAndroid',
      '### Terms\n\n- [x] I searched first\n- [ ] I can help',
    ].join('\n\n'),
  );
  assert.match(renderAnswers(FIELDS, initialAnswers(FIELDS)), /### Logs\n\n_No response_/);
});
