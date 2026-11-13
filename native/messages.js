ObjC.import('Foundation');
function run(argv) {
  const data = $.NSData.dataWithContentsOfFile(argv[0]);
  if (!data) throw new Error('Missing Messages request.');
  const input = JSON.parse(
    ObjC.unwrap(
      $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding),
    ),
  );
  const messages = Application('Messages');
  const normalize = (value) => String(value).replace(/[\s().-]/g, '');
  const describe = (chat) => ({
    id: chat.id(),
    participants: chat.participants().map((p) => normalize(p.handle())),
  });
  if (input.type === 'chats')
    return JSON.stringify(messages.chats().map(describe));
  if (input.type === 'send') {
    const chat = messages.chats.byId(input.chat.id);
    const same = () =>
      JSON.stringify(describe(chat).participants.sort()) ===
      JSON.stringify(input.chat.participants.slice().sort());
    if (input.chat.participants.length < 2 || !same())
      throw new Error('Group membership mismatch.');
    messages.send(input.message, { to: chat });
    if (!same()) throw new Error('Group membership changed after sending.');
    return JSON.stringify({ ok: true });
  }
  throw new Error('Unknown Messages operation.');
}
