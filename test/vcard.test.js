import { expect, it } from 'vitest';
import { parseVCards } from '../src/vcard.js';
it('imports given names, folded lines, multiple numbers and escaped names', () => {
  expect(
    parseVCards(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\nTEL;TYPE=CELL:+1 (415) 555-\r\n 2671\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nN:Hopper;Grace;;;\r\nTEL:tel:+14155552672\r\nEND:VCARD',
    ),
  ).toEqual([
    { name: 'Ada', phone: '+14155552671' },
    { name: 'Grace', phone: '+14155552672' },
  ]);
});
it.each([
  'bad',
  'BEGIN:VCARD\nVERSION:3.0',
  'BEGIN:VCARD\nVERSION:2.1\nFN:Ada\nTEL:+123\nEND:VCARD',
  'BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nTEL:5551212\nEND:VCARD',
])('rejects unusable contact cards', (value) => {
  expect(() => parseVCards(value)).toThrow();
});
