#!/bin/bash
set -euo pipefail
if [[ "${1:-}" != '--confirm' ]]; then
  echo 'This removes Jail Helper and local send receipts. Pending alerts stay locked. Run with --confirm to uninstall.' >&2
  exit 1
fi
rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.digitaljail.helper.json"
rm -rf "$HOME/Library/Application Support/DigitalJail"
echo 'Helper removed. Delete Jail Group Start in Shortcuts manually. No Chrome settings were changed.'
