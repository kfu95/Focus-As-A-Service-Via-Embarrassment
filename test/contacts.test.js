import { describe, expect, it } from 'vitest';
import {
  getAlertRecipients,
  parseContactsCsv,
  renderContactMessages,
  validateContact,
} from '../src/contacts.js';

describe('contacts', () => {
  it('validates names and E.164 numbers', () => {
    expect(validateContact({ name: ' Ada ', phone: ' +14155552671 ' })).toEqual(
      { name: 'Ada', phone: '+14155552671' },
    );
    expect(() => validateContact({ name: ' ', phone: '+14155552671' })).toThrow(
      'name',
    );
    for (const phone of [
      '14155552671',
      '+0123',
      '+1 415',
      '+1234567890123456',
    ]) {
      expect(() => validateContact({ name: 'Ada', phone })).toThrow('E.164');
    }
  });
  it('parses CSV including quoted names and rejects malformed rows', () => {
    expect(
      parseContactsCsv(
        'name,phone\r\n"Doe, Jane",+14155552671\r\n"A ""B""",+442071838750',
      ),
    ).toEqual([
      { name: 'Doe, Jane', phone: '+14155552671' },
      { name: 'A "B"', phone: '+442071838750' },
    ]);
    expect(() => parseContactsCsv('Ada,+123,extra')).toThrow('columns');
    expect(() =>
      parseContactsCsv(
        'name,phone\r\n\r\n"Jane\r\nDoe",+123\r\nAda,+123,extra',
      ),
    ).toThrow('CSV row 5');
    expect(() => parseContactsCsv('"Ada,+123')).toThrow('CSV format');
    expect(() => parseContactsCsv('Ada,123')).toThrow('E.164');
  });
  it('renders each name literally in every placeholder', () => {
    expect(
      renderContactMessages(
        [{ name: '$& Ada', phone: '+123' }],
        'Hi {name}, bye {name}',
      ),
    ).toEqual([{ name: '$& Ada', phone: '+123', message: 'Hi $&, bye $&' }]);
  });
});

it('rejects messages the helper cannot accept before arming an alert', () => {
  const people = [
    { name: 'Ada', phone: '+14155552671' },
    { name: 'Grace', phone: '+14155552672' },
  ];
  expect(() => getAlertRecipients(people, ' ')).toThrow('4 KB');
  expect(() => getAlertRecipients(people, '🥲'.repeat(1001))).toThrow('4 KB');
  expect(getAlertRecipients(people, 'Hi {name}, I miss you')[1].message).toBe(
    'Hi Grace, I miss you',
  );
});
