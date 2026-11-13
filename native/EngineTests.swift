import Foundation

final class FakeMessages: MessageTransport {
  var groups: [Chat] = []
  var accepted: [(String, String)] = []
  var starts = 0
  var failAt: Int?
  var split = false
  var afterSend: (() -> Void)?
  func chats() throws -> [Chat] { groups }
  func bootstrap(phones: [String], message: String) throws {
    starts += 1
    if split {
      groups = phones.map { Chat(id: $0, participants: [$0]) }
    } else {
      groups.append(Chat(id: "new-group", participants: phones))
    }
    accepted.append(("new-group", message))
  }
  func send(chat: Chat, message: String) throws {
    if failAt == accepted.count { throw HelperError("Messages rejected send") }
    accepted.append((chat.id, message))
    afterSend?()
  }
}
@main
struct EngineTests {
  static func main() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer {
      do { try FileManager.default.removeItem(at: root) } catch {
        fatalError("Test cleanup failed: \(error)")
      }
    }
    let people = [
      Recipient(name: "Ada", phone: "+14155552671", message: "Hi Ada, I miss you"),
      Recipient(name: "Grace", phone: "+14155552672", message: "Hi Grace, I miss you"),
    ]
    func episode() -> Episode { Episode(id: UUID().uuidString, recipients: people) }
    let phones = people.map(\.phone)
    precondition(normalizeContactPhone("+1 (212) 555-0123") == "+12125550123")
    let extensionPhone = normalizeContactPhone("+1 (212) 555-0123 x45")
    precondition(extensionPhone == "+12125550123x45" && !validPhone(extensionPhone))
    let oversizedContacts: [String: Any] = [
      "version": 1, "ok": true,
      "contacts": [["name": String(repeating: "A", count: 1_000_000), "phone": "+123"]],
    ]
    let oversizedResponse = try JSONSerialization.jsonObject(
      with: encodeNativeResponse(oversizedContacts)) as! [String: Any]
    precondition(oversizedResponse["ok"] as? Bool == false)
    precondition((oversizedResponse["error"] as? String)?.contains("1 MB") == true)
    do {
      let fake = FakeMessages()
      let engine = AlertEngine(transport: fake, directory: root)
      let event = episode()
      let receipt = try engine.send(event)
      precondition(receipt.ok && receipt.groupVerified && receipt.results.allSatisfy(\.ok))
      precondition(fake.starts == 1 && fake.accepted.map { $0.0 } == ["new-group", "new-group"])
      precondition(fake.accepted.map { $0.1 } == ["Hi Ada, I miss you", "Hi Grace, I miss you"])
      let retried = try engine.send(event)
      precondition(retried.ok)
      precondition(fake.accepted.count == 2, "Completed alerts must not resend")
    }
    do {
      let fake = FakeMessages()
      fake.groups = [Chat(id: "existing", participants: phones)]
      fake.failAt = 1
      let event = episode()
      let engine = AlertEngine(transport: fake, directory: root)
      let failed = try engine.send(event)
      precondition(!failed.ok && failed.results.map(\.ok) == [true, false])
      fake.failAt = nil
      let retried = try engine.send(event)
      precondition(retried.ok)
      precondition(fake.starts == 0 && fake.accepted.count == 2)
    }
    do {
      let fake = FakeMessages()
      fake.split = true
      let receipt = try AlertEngine(transport: fake, directory: root).send(episode())
      precondition(!receipt.ok && !receipt.groupVerified && fake.accepted.count == 1)
    }
    do {
      let fake = FakeMessages()
      fake.groups = [Chat(id: "wrong", participants: phones + ["+14155552673"])]
      let receipt = try AlertEngine(transport: fake, directory: root).send(episode())
      precondition(receipt.ok && fake.starts == 1 && receipt.chatId != "wrong")
    }
    do {
      let fake = FakeMessages()
      fake.groups = [Chat(id: "existing", participants: phones)]
      fake.afterSend = { fake.groups = [Chat(id: "existing", participants: [phones[0]])] }
      let receipt = try AlertEngine(transport: fake, directory: root).send(episode())
      precondition(!receipt.ok && fake.accepted.count == 1)
    }
    do {
      let fake = FakeMessages()
      let engine = AlertEngine(transport: fake, directory: root)
      let invalid = Episode(id: "../../bad", recipients: people)
      do {
        _ = try engine.send(invalid)
        fatalError("Invalid alert accepted")
      } catch {}
      precondition(fake.accepted.isEmpty)
    }
    print(
      "Native engine: group routing, membership, partial retry, idempotency, and validation passed. No real send boundary used."
    )
  }
}
