import Foundation

func command(_ executable: String, _ arguments: [String], timeout: TimeInterval = 120) throws
  -> Data
{
  let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  try FileManager.default.createDirectory(
    at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
  defer {
    do { try FileManager.default.removeItem(at: dir) } catch {
      fputs("Jail could not remove temporary process output: \(error)\n", stderr)
    }
  }
  let out = dir.appendingPathComponent("out")
  let err = dir.appendingPathComponent("err")
  FileManager.default.createFile(
    atPath: out.path, contents: nil, attributes: [.posixPermissions: 0o600])
  FileManager.default.createFile(
    atPath: err.path, contents: nil, attributes: [.posixPermissions: 0o600])
  let stdout = try FileHandle(forWritingTo: out)
  let stderrHandle = try FileHandle(forWritingTo: err)
  defer {
    try? stdout.close()
    try? stderrHandle.close()
  }
  let process = Process()
  process.executableURL = URL(fileURLWithPath: executable)
  process.arguments = arguments
  process.standardOutput = stdout
  process.standardError = stderrHandle
  try process.run()
  let deadline = Date().addingTimeInterval(timeout)
  while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
  if process.isRunning {
    process.terminate()
    throw HelperError(
      "Mac operation timed out. Check permission prompts and Messages before retrying; a text may already have been accepted."
    )
  }
  let error = String(decoding: try Data(contentsOf: err), as: UTF8.self)
  guard process.terminationStatus == 0 else {
    throw HelperError(
      "Messages/Shortcuts failed. Allow Automation in System Settings, sign in to Messages, and check iPhone Text Message Forwarding for green bubbles. \(error)"
    )
  }
  return try Data(contentsOf: out)
}

final class MacMessages: MessageTransport {
  let resources: URL
  init(resources: URL) { self.resources = resources }
  func inputFile<T>(_ value: [String: Any], perform: (URL) throws -> T) throws -> T {
    let file = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".json")
    try JSONSerialization.data(withJSONObject: value).write(to: file, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    defer {
      do { try FileManager.default.removeItem(at: file) } catch {
        fputs("Jail could not remove temporary input: \(error)\n", stderr)
      }
    }
    return try perform(file)
  }
  func script(_ input: [String: Any]) throws -> Data {
    try inputFile(input) { file in
      try command(
        "/usr/bin/osascript",
        ["-l", "JavaScript", resources.appendingPathComponent("messages.js").path, file.path])
    }
  }
  func chats() throws -> [Chat] {
    try JSONDecoder().decode([Chat].self, from: script(["type": "chats"]))
  }
  func bootstrap(phones: [String], message: String) throws {
    try inputFile(["recipients": phones, "message": message]) { file in
      _ = try command("/usr/bin/shortcuts", ["run", "Jail Group Start", "--input-path", file.path])
    }
  }
  func send(chat: Chat, message: String) throws {
    _ = try script([
      "type": "send", "chat": ["id": chat.id, "participants": chat.participants],
      "message": message,
    ])
  }
  func status() throws {
    let names = String(
      decoding: try command("/usr/bin/shortcuts", ["list"], timeout: 15), as: UTF8.self
    ).split(separator: "\n")
    guard names.contains("Jail Group Start") else {
      throw HelperError(
        "Add the bundled Jail Group Start shortcut. Run the installer again and click Add Shortcut."
      )
    }
  }
}
