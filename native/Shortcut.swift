import Foundation

@main
struct Shortcut {
  static func main() throws {
    let input: [String: Any] = [
      "Value": ["Type": "ExtensionInput"], "WFSerializationType": "WFTextTokenAttachment",
    ]
    func output(_ id: String, _ name: String) -> [String: Any] {
      [
        "Value": ["Type": "ActionOutput", "OutputUUID": id, "OutputName": name],
        "WFSerializationType": "WFTextTokenAttachment",
      ]
    }
    func action(_ name: String, _ parameters: [String: Any]) -> [String: Any] {
      [
        "WFWorkflowActionIdentifier": "is.workflow.actions." + name,
        "WFWorkflowActionParameters": parameters,
      ]
    }
    let dictionary = UUID().uuidString
    let recipients = UUID().uuidString
    let message = UUID().uuidString
    let workflow: [String: Any] = [
      "WFWorkflowName": "Jail Group Start",
      "WFWorkflowClientVersion": "2600",
      "WFWorkflowMinimumClientVersion": 900,
      "WFWorkflowMinimumClientVersionString": "900",
      "WFWorkflowIcon": [
        "WFWorkflowIconStartColor": 4_282_601_983, "WFWorkflowIconGlyphNumber": 59511,
      ],
      "WFWorkflowTypes": [],
      "WFWorkflowInputContentItemClasses": ["WFStringContentItem", "WFGenericFileContentItem"],
      "WFWorkflowActions": [
        action("getdictionaryfrominput", ["WFInput": input, "UUID": dictionary]),
        action(
          "getvalueforkey",
          [
            "WFInput": output(dictionary, "Dictionary"), "WFDictionaryKey": "recipients",
            "WFGetDictionaryValueType": "Value", "UUID": recipients,
          ]),
        action(
          "getvalueforkey",
          [
            "WFInput": output(dictionary, "Dictionary"), "WFDictionaryKey": "message",
            "WFGetDictionaryValueType": "Value", "UUID": message,
          ]),
        action(
          "sendmessage",
          [
            "WFSendMessageActionRecipients": output(recipients, "Dictionary Value"),
            "WFSendMessageContent": output(message, "Dictionary Value"), "ShowWhenRun": false,
            "IntentAppIdentifier": "com.apple.MobileSMS",
          ]),
      ],
    ]
    let data = try PropertyListSerialization.data(
      fromPropertyList: workflow, format: .xml, options: 0)
    try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
  }
}
