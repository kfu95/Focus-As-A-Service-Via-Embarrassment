import Foundation

final class AlertEngine {
  let transport: MessageTransport
  let directory: URL
  init(transport: MessageTransport, directory: URL) {
    self.transport = transport
    self.directory = directory
  }
  func send(_ episode: Episode) throws -> Receipt {
    try validate(episode)
    let path = directory.appendingPathComponent(episode.id + ".json")
    var journal = Journal(episode: episode)
    if FileManager.default.fileExists(atPath: path.path) {
      journal = try JSONDecoder().decode(Journal.self, from: Data(contentsOf: path))
      guard journal.episode == episode else {
        throw HelperError("Alert ID was reused with different recipients or messages.")
      }
    }
    var receipt = Receipt(
      episodeId: episode.id,
      results: episode.recipients.map { SendResult(phone: $0.phone, ok: false) })
    let phones = episode.recipients.map(\.phone)
    func save() throws { try JSONEncoder().encode(journal).write(to: path, options: .atomic) }
    do {
      var candidates = try transport.chats().filter { verified($0, phones: phones) }
      if let id = journal.chatId {
        candidates = candidates.filter { $0.id == id }
        guard candidates.count == 1 else {
          throw HelperError(
            "The original group changed or disappeared. Restore its exact membership before retrying."
          )
        }
      } else if candidates.isEmpty {
        try save()
        let before = Set(try transport.chats().map(\.id))
        try transport.bootstrap(phones: phones, message: episode.recipients[0].message)
        candidates = try transport.chats().filter {
          !before.contains($0.id) && verified($0, phones: phones)
        }
        guard candidates.count == 1 else {
          throw HelperError(
            "Messages did not create one verifiable group with every recipient. No individual-text fallback is allowed. Check iMessage or iPhone Text Message Forwarding and group MMS/RCS support."
          )
        }
        journal.sent = 1
      }
      guard let chat = candidates.first else { throw HelperError("No group found.") }
      journal.chatId = chat.id
      try save()
      receipt.chatId = chat.id
      while journal.sent < episode.recipients.count {
        guard let current = try transport.chats().first(where: { $0.id == chat.id }),
          verified(current, phones: phones)
        else {
          throw HelperError(
            "A recipient cannot join the group or its membership changed. Check Messages and Text Message Forwarding."
          )
        }
        try transport.send(chat: current, message: episode.recipients[journal.sent].message)
        journal.sent += 1
        try save()
      }
      guard let final = try transport.chats().first(where: { $0.id == chat.id }),
        verified(final, phones: phones)
      else {
        throw HelperError("Could not verify all recipients in the group after sending.")
      }
      receipt.participants = final.participants
      receipt.groupVerified = true
      receipt.ok = true
    } catch { receipt.error = error.localizedDescription }
    for i in receipt.results.indices { receipt.results[i].ok = i < journal.sent }
    return receipt
  }
}
