#!/bin/bash
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd -P)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
xcrun swiftc "$source_dir/Model.swift" "$source_dir/AlertEngine.swift" "$source_dir/Contacts.swift" "$source_dir/EngineTests.swift" -o "$stage/tests"
"$stage/tests"
xcrun swiftc "$source_dir/Model.swift" "$source_dir/AlertEngine.swift" "$source_dir/Messages.swift" "$source_dir/Contacts.swift" "$source_dir/Host.swift" -o "$stage/helper"
xcrun swiftc -parse-as-library "$source_dir/Shortcut.swift" -o "$stage/shortcut"
"$stage/shortcut" "$stage/group.shortcut"
plutil -lint "$stage/group.shortcut"
osacompile -l JavaScript -o "$stage/messages.scpt" "$source_dir/messages.js"
bash -n "$source_dir/install.sh" "$source_dir/uninstall.sh"
mkdir -p "$stage/Test.app/Contents/MacOS" "$stage/Test.app/Contents/Resources"
cp "$stage/helper" "$stage/Test.app/Contents/MacOS/JailHelper"
printf '%s' abcdefghijklmnopabcdefghijklmnop > "$stage/Test.app/Contents/Resources/extension-id"
cat > "$stage/Test.app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.digitaljail.protocoltest</string><key>CFBundleExecutable</key><string>JailHelper</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>
PLIST
node --input-type=module - "$stage/Test.app/Contents/MacOS/JailHelper" <<'JS'
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const binary=process.argv[2];
function exchange(data,origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop/') {
  const result=spawnSync(binary,[origin],{input:data,timeout:5000});
  assert.equal(result.status,0,result.stderr?.toString());
  const length=result.stdout.readUInt32LE(0);
  assert.equal(result.stdout.length,length+4);
  return JSON.parse(result.stdout.subarray(4).toString());
}
function frame(body) {
  const data=Buffer.from(JSON.stringify(body));const header=Buffer.alloc(4);header.writeUInt32LE(data.length);return Buffer.concat([header,data]);
}
assert.match(exchange(frame({version:2})).error,/protocol version/);
assert.match(exchange(frame({version:1,type:'unknown'})).error,/Unknown/);
assert.match(exchange(frame({version:1,type:'send-group',episode:{id:'bad',recipients:[]}})).error,/Invalid alert/);
assert.match(exchange(frame({}), 'chrome-extension://wrong/').error,/origin/);
const oversized=Buffer.alloc(4);oversized.writeUInt32LE(1000001);
assert.match(exchange(oversized).error,/exceeds/);
assert.match(exchange(Buffer.from([20,0,0,0,123])).error,/Truncated/);
console.log('Native framing: version, origin, invalid payload, oversized and truncated request checks passed.');
JS
