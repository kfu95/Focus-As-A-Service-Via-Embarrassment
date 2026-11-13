import Foundation

struct HelperError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}
struct Recipient: Codable, Equatable {
  let name: String
  let phone: String
  let message: String
}
struct Episode: Codable, Equatable {
  let id: String
  let recipients: [Recipient]
}
struct Chat: Codable {
  let id: String
  let participants: [String]
}
struct SendResult: Codable {
  let phone: String
  var ok: Bool
}
struct Receipt: Codable {
  var version = 1
  var ok = false
  var episodeId: String
  var chatId = ""
  var participants: [String] = []
  var groupVerified = false
  var results: [SendResult]
  var error: String?
}
struct Journal: Codable {
  let episode: Episode
  var chatId: String?
  var sent = 0
}
func encodeNativeResponse(_ response: [String: Any]) throws -> Data {
  let data = try JSONSerialization.data(withJSONObject: response)
  if data.count <= 1_000_000 { return data }
  return try JSONSerialization.data(withJSONObject: [
    "version": 1, "ok": false, "error": "Native response exceeds 1 MB.",
  ])
}
func validPhone(_ phone: String) -> Bool {
  phone.range(of: #"^\+[1-9][0-9]{1,14}\z"#, options: .regularExpression) != nil
}
func validate(_ episode: Episode) throws {
  guard UUID(uuidString: episode.id) != nil else { throw HelperError("Invalid alert ID.") }
  guard (2...50).contains(episode.recipients.count),
    Set(episode.recipients.map(\.phone)).count == episode.recipients.count
  else {
    throw HelperError("A group needs 2 to 50 different phone numbers.")
  }
  for person in episode.recipients {
    guard validPhone(person.phone),
      !person.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      !person.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      person.message.utf8.count <= 4000
    else {
      throw HelperError(
        "Invalid recipient or message. Use international phone numbers and messages under 4 KB.")
    }
  }
}
protocol MessageTransport {
  func chats() throws -> [Chat]
  func bootstrap(phones: [String], message: String) throws
  func send(chat: Chat, message: String) throws
}
func verified(_ chat: Chat, phones: [String]) -> Bool {
  chat.participants.count > 1 && Set(chat.participants) == Set(phones)
    && chat.participants.count == phones.count
}
