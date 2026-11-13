export function validateContact(contact) {
  const name = String(contact.name || '').trim();
  const phone = String(contact.phone || '').trim();
  if (!name) throw new Error('Each contact needs a name.');
  if (!/^\+[1-9]\d{1,14}$/.test(phone))
    throw new Error(
      `Invalid phone number for ${name}. Use E.164 format, for example +14155552671.`,
    );
  return { name, phone };
}

export function parseContactsCsv(text) {
  const rows = [];
  let row = [];
  let lineNumber = 1;
  let rowNumber = 1;
  let field = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        field += char;
        if (char === '\n' || (char === '\r' && text[i + 1] !== '\n'))
          lineNumber += 1;
      }
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (char !== ',') {
        if (row.some((value) => value.trim()))
          rows.push({ columns: row, rowNumber });
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        lineNumber += 1;
        rowNumber = lineNumber;
      }
    } else if (closed || char === '"') throw new Error('Invalid CSV format.');
    else field += char;
  }
  if (quoted) throw new Error('Invalid CSV format.');
  row.push(field);
  if (row.some((value) => value.trim())) rows.push({ columns: row, rowNumber });
  if (
    rows.length &&
    rows[0].columns[0].trim().toLowerCase() === 'name' &&
    rows[0].columns[1]?.trim().toLowerCase() === 'phone'
  )
    rows.shift();
  return rows.map(({ columns, rowNumber }) => {
    if (columns.length !== 2)
      throw new Error(`CSV row ${rowNumber} must have name and phone columns.`);
    return validateContact({ name: columns[0], phone: columns[1] });
  });
}

export function renderContactMessages(contacts, template) {
  return contacts.map((contact) => ({
    ...contact,
    message: template.replaceAll(
      '{name}',
      () => contact.name.trim().split(/\s+/)[0],
    ),
  }));
}

export function getAlertRecipients(contacts, template) {
  const recipients = renderContactMessages(
    contacts.map(validateContact),
    template,
  );
  if (
    recipients.length < 2 ||
    recipients.length > 50 ||
    new Set(recipients.map((c) => c.phone)).size !== recipients.length
  )
    throw new Error('Choose 2 to 50 contacts with different phone numbers.');
  if (
    recipients.some(
      (c) =>
        !c.message.trim() || new TextEncoder().encode(c.message).length > 4000,
    )
  )
    throw new Error(
      'Each rendered message must contain text and fit within 4 KB. Shorten the template or contact name.',
    );
  return recipients;
}
