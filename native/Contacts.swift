import Contacts
import Foundation

func normalizeContactPhone(_ phone: String) -> String {
  phone.filter { !$0.isWhitespace && !"().-".contains($0) }
}

func readContacts() throws -> [[String: String]] {
  let store = CNContactStore()
  let done = DispatchSemaphore(value: 0)
  var granted = false
  var permissionError: Error?
  store.requestAccess(for: .contacts) { allowed, error in
    granted = allowed
    permissionError = error
    done.signal()
  }
  guard done.wait(timeout: .now() + 120) == .success else {
    throw HelperError(
      "Contacts permission timed out. Allow Jail Helper in System Settings → Privacy & Security → Contacts."
    )
  }
  guard granted else {
    throw HelperError(
      "Contacts access denied. Allow Jail Helper in System Settings → Privacy & Security → Contacts or import .vcf cards. \(permissionError?.localizedDescription ?? "")"
    )
  }
  var rows: [[String: String]] = []
  let request = CNContactFetchRequest(keysToFetch: [
    CNContactGivenNameKey as CNKeyDescriptor, CNContactPhoneNumbersKey as CNKeyDescriptor,
  ])
  try store.enumerateContacts(with: request) { person, _ in
    guard !person.givenName.isEmpty else { return }
    for number in person.phoneNumbers {
      let phone = normalizeContactPhone(number.value.stringValue)
      rows.append(["name": person.givenName, "phone": phone])
    }
  }
  guard rows.count <= 5000 else {
    throw HelperError(
      "More than 5,000 phone entries. Export selected .vcf cards from Contacts instead.")
  }
  return rows.sorted { $0["name", default: ""] < $1["name", default: ""] }
}
