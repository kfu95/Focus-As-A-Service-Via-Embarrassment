import Darwin
import Foundation

@main
struct Host {
  static func readExact(_ count: Int) throws -> Data {
    var result = Data()
    while result.count < count {
      let chunk = try FileHandle.standardInput.read(upToCount: count - result.count) ?? Data()
      guard !chunk.isEmpty else { throw HelperError("Truncated native message.") }
      result.append(chunk)
    }
    return result
  }
  static func handle(_ request: [String: Any], resources: URL) throws -> [String: Any] {
    guard request["version"] as? Int == 1 else {
      throw HelperError("Unsupported helper protocol version.")
    }
    let messages = MacMessages(resources: resources)
    switch request["type"] as? String {
    case "status":
      try messages.status()
      return ["version": 1, "ok": true]
    case "contacts":
      return ["version": 1, "ok": true, "contacts": try readContacts()]
    case "send-test":
      guard let phone = request["phone"] as? String, !phone.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw HelperError("Missing phone number.")
      }
      let message = (request["message"] as? String) ?? "Jail test: permissions enabled."
      do {
        _ = try messages.chats()
      } catch {
        throw HelperError(
          "Permission denied. Jail will not work without Messages automation. Allow Jail Helper in System Settings → Privacy & Security → Automation, then try sending again."
        )
      }
      do {
        try messages.bootstrap(phones: [phone], message: message)
      } catch {
        throw HelperError(
          "Shortcuts send failed. Jail will not work without permission to send messages. Allow Jail Group Start to send messages, then try sending again. \(error.localizedDescription)"
        )
      }
      _ = try messages.chats()
      return ["version": 1, "ok": true]
    case "send-group":
      guard let payload = request["episode"] as? [String: Any] else {
        throw HelperError("Missing alert.")
      }
      let episode = try JSONDecoder().decode(
        Episode.self, from: JSONSerialization.data(withJSONObject: payload))
      try validate(episode)
      let directory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(
        "Library/Application Support/DigitalJail/receipts")
      try FileManager.default.createDirectory(
        at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
      let lock = open(directory.appendingPathComponent("send.lock").path, O_CREAT | O_RDWR, 0o600)
      guard lock >= 0 else { throw HelperError("Cannot open the send lock.") }
      defer { close(lock) }
      guard flock(lock, LOCK_EX | LOCK_NB) == 0 else {
        throw HelperError("Another Jail alert is sending. Wait for it to finish, then retry.")
      }
      let receipt = try AlertEngine(transport: messages, directory: directory).send(episode)
      return try JSONSerialization.jsonObject(with: JSONEncoder().encode(receipt)) as! [String: Any]
    default: throw HelperError("Unknown helper request.")
    }
  }
  static func main() {
    umask(0o077)
    var response: [String: Any]
    do {
      guard let resources = Bundle.main.resourceURL else {
        throw HelperError("Run the installed Jail Helper app binary.")
      }
      let allowed = try String(
        contentsOf: resources.appendingPathComponent("extension-id"), encoding: .utf8
      ).trimmingCharacters(in: .whitespacesAndNewlines)
      guard CommandLine.arguments.count == 2,
        CommandLine.arguments[1] == "chrome-extension://\(allowed)/"
      else { throw HelperError("Unregistered extension origin.") }
      let header = try readExact(4)
      let size = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }
      guard size > 0 && size <= 1_000_000 else { throw HelperError("Native request exceeds 1 MB.") }
      guard
        let request = try JSONSerialization.jsonObject(with: readExact(Int(size))) as? [String: Any]
      else { throw HelperError("Expected a JSON object.") }
      response = try handle(request, resources: resources)
    } catch { response = ["version": 1, "ok": false, "error": error.localizedDescription] }
    do {
      let data = try encodeNativeResponse(response)
      var length = UInt32(data.count)
      try withUnsafeBytes(of: &length) { try FileHandle.standardOutput.write(contentsOf: Data($0)) }
      try FileHandle.standardOutput.write(contentsOf: data)
    } catch {
      fputs("Jail native protocol failed: \(error)\n", stderr)
      exit(1)
    }
  }
}
