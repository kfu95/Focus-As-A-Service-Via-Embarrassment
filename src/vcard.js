import { validateContact } from './contacts.js';

function splitValue(value) {
  return value
    .split(/(?<!\\);/)
    .map((part) =>
      part.replace(/\\([nN,;\\])/g, (_match, char) =>
        /[nN]/.test(char) ? ' ' : char,
      ),
    );
}

export function parseVCards(text) {
  if (text.length > 1_000_000)
    throw new Error('Contact cards must be smaller than 1 MB.');
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
  const contacts = [];
  let card = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.toUpperCase() === 'BEGIN:VCARD') {
      if (card) throw new Error('Nested contact card.');
      card = { phones: [] };
    } else if (line.toUpperCase() === 'END:VCARD') {
      if (!card) throw new Error('Unexpected end of contact card.');
      if (!['3.0', '4.0'].includes(card.version))
        throw new Error('Export vCard 3.0 or 4.0 from Contacts.');
      const name = card.given || card.full?.split(/\s+/)[0];
      if (!name || !card.phones.length)
        throw new Error('Each card needs a first name and phone number.');
      for (const phone of card.phones)
        contacts.push(validateContact({ name, phone }));
      card = null;
    } else {
      if (!card) throw new Error('Expected a .vcf contact card.');
      const colon = line.indexOf(':');
      if (colon < 0) throw new Error('Invalid contact card field.');
      const key = line.slice(0, colon).toUpperCase();
      const value = line.slice(colon + 1);
      if (/ENCODING=|CHARSET=(?!UTF-8)/i.test(key))
        throw new Error('Export UTF-8 vCard 3.0 or 4.0 from Contacts.');
      const field = key.split(';')[0].split('.').at(-1);
      if (field === 'VERSION') card.version = value;
      if (field === 'N') card.given = splitValue(value)[1]?.trim();
      if (field === 'FN') card.full = splitValue(value)[0].trim();
      if (field === 'TEL')
        card.phones.push(value.replace(/^tel:/i, '').replace(/[\s().-]/g, ''));
    }
  }
  if (card || !contacts.length)
    throw new Error('Incomplete or empty contact card.');
  return contacts;
}
