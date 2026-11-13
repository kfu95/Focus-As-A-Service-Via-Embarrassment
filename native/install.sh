#!/bin/bash
set -euo pipefail
umask 077
if [[ "$(uname -s)" != Darwin ]]; then echo 'Jail Helper requires macOS.' >&2; exit 1; fi
if [[ ! "${1:-}" =~ ^[a-p]{32}$ ]]; then echo 'Usage: bash native/install.sh EXTENSION_ID (32 letters a-p from chrome://extensions)' >&2; exit 1; fi
if ! xcrun --find swiftc >/dev/null 2>&1; then echo 'Install Apple Command Line Tools with xcode-select --install, then retry.' >&2; exit 1; fi
source_dir="$(cd "$(dirname "$0")" && pwd -P)"
install_dir="$HOME/Library/Application Support/DigitalJail"
app="$install_dir/Jail Helper.app"
manifest_dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/Jail Helper.app/Contents/MacOS" "$stage/Jail Helper.app/Contents/Resources"
xcrun swiftc "$source_dir/Model.swift" "$source_dir/AlertEngine.swift" "$source_dir/Messages.swift" "$source_dir/Contacts.swift" "$source_dir/Host.swift" -o "$stage/Jail Helper.app/Contents/MacOS/JailHelper"
xcrun swiftc -parse-as-library "$source_dir/Shortcut.swift" -o "$stage/make-shortcut"
"$stage/make-shortcut" "$stage/Jail Group Start.unsigned.shortcut"
/usr/bin/shortcuts sign --mode anyone --input "$stage/Jail Group Start.unsigned.shortcut" --output "$stage/Jail Group Start.shortcut"
cp "$source_dir/messages.js" "$stage/Jail Helper.app/Contents/Resources/"
printf '%s\n' "$1" > "$stage/Jail Helper.app/Contents/Resources/extension-id"
cat > "$stage/Jail Helper.app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.digitaljail.helper</string>
<key>CFBundleName</key><string>Jail Helper</string>
<key>CFBundleExecutable</key><string>JailHelper</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
<key>NSContactsUsageDescription</key><string>Choose contacts for Jail group texts. Contacts are only read when you request the picker.</string>
<key>NSAppleEventsUsageDescription</key><string>Jail sends your chosen group alerts and verifies group membership in Messages.</string>
</dict></plist>
PLIST
codesign --force --sign - "$stage/Jail Helper.app"
mkdir -p "$install_dir" "$manifest_dir"
# Ditto replaces the installed bundle while preserving receipts alongside it.
ditto "$stage/Jail Helper.app" "$app"
cp "$stage/Jail Group Start.shortcut" "$install_dir/Jail Group Start.shortcut"
/usr/bin/plutil -create xml1 "$stage/host.plist"
/usr/bin/plutil -insert name -string com.digitaljail.helper "$stage/host.plist"
/usr/bin/plutil -insert description -string 'Jail Messages helper' "$stage/host.plist"
/usr/bin/plutil -insert path -string "$app/Contents/MacOS/JailHelper" "$stage/host.plist"
/usr/bin/plutil -insert type -string stdio "$stage/host.plist"
/usr/bin/plutil -insert allowed_origins -json "[\"chrome-extension://$1/\"]" "$stage/host.plist"
/usr/bin/plutil -convert json -o "$manifest_dir/com.digitaljail.helper.json" "$stage/host.plist"
open "$install_dir/Jail Group Start.shortcut"
echo 'Helper installed permanently. Click Add Shortcut in Shortcuts, then Check installation in Jail. No text was sent.'
