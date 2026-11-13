# Jail

Jail is a macOS Chrome extension that redirects open and new web tabs to a jail page when a browsing rule is broken. Browsing stays locked until a local Mac helper reports that Messages accepted every personalized message into one verified group containing exactly the selected contacts.

The default is one message per contact: `Hi Ada, I miss you`, then `Hi Grace, I miss you`, both in the same group. Only first names appear in `{name}`. Messages may reuse an existing group with exactly those members. Jail never deliberately falls back to individual texts for an alert. A failed or unverifiable group send keeps Jail locked.

![iMessage group text alert example](docs/images/group-text.png)

## Install and configure

1. Download this repository. Install dependencies with `npm ci`. Run `npm test`, `npm run lint`, and `npm run format:check` on macOS with Apple Command Line Tools installed.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this folder. Turn on **Allow in Incognito** in the extension's Details if you use private browsing.
3. Open Jail settings and read the informational helper notice. Valid saved rules are always enforced; there is no unarmed opt-out. The helper supports the texting workflow, including the optional Contacts picker, and stays installed after every send.
4. Click **Install helper and review permissions**. In Terminal, from this repository folder, run the displayed command with your extension ID:

   ```sh
   bash native/install.sh abcdefghijklmnopabcdefghijklmnop
   ```

   Replace the example ID with the 32-letter ID on your extension card. The installer compiles a small Swift app using Apple's Command Line Tools, signs the bundled shortcut using Apple's `shortcuts sign`, and registers Chrome's native messaging host for that ID only. If needed, install the tools with `xcode-select --install` and retry. Shortcut signing needs access to Apple's signing service. No text is sent during installation.

5. When Shortcuts opens, click **Add Shortcut** for **Jail Group Start**. Leave its name and actions unchanged. Click **Check installation** back in Jail. Re-running the installer repairs the helper without deleting send receipts; avoid duplicate shortcut names when re-importing.
6. Add 2 to 50 contacts with different phone numbers. Use **Pick from Mac Contacts**, drag `.vcf` cards from Contacts, or choose contact-card files. Search the Mac picker and click each person to add them. CSV and manual entry also remain available. Use international E.164 phone numbers, such as `+14155552671`; local numbers imported from Mac Contacts must be corrected before saving. Contact cards support UTF-8 vCard 3.0/4.0 and require country codes. Cards with multiple numbers add one entry per number; remove any number you do not want in the group.
7. Add allowed domains using the domain field and **Add**. Entries include subdomains. An empty allow list permits any site not blocked; the block list takes precedence. Review the message previews and save. Valid settings are enforced immediately, so saving may trigger an alert if an open tab violates the rules.

A one-time manual trial with **two consenting people** is recommended before relying on group alerts. Do this with only those test contacts selected. Confirm both messages arrive in one group and that the jail page unlocks. Then replace the test contacts with the intended contacts. Automated validation never sends real texts.

## Messages and permissions

Sign in to Messages on the Mac. Allow Jail Helper (or the requesting process macOS identifies, such as Chrome/osascript) to control Messages under **System Settings → Privacy & Security → Automation**. Shortcuts may separately request permission to send messages. A cancelled or denied prompt produces an error and keeps Jail locked.

**Non-iMessage / green-bubble recipients:** enable **Text Message Forwarding** on your iPhone for this Mac. Your iPhone and carrier must support group MMS/RCS for those recipients. A recipient who cannot join a verifiable group causes the alert to fail. Check Messages, your iPhone forwarding settings, and carrier support before retrying. Messages accepting a send does not prove carrier delivery or that someone read it; delivery receipts are not required to unlock.

Contacts permission is requested only after clicking **Pick from Mac Contacts**. Allow Jail Helper under **Privacy & Security → Contacts**. The helper reads given names and phone numbers only. Permission denial is visible; contact-card import is available without Contacts access.

The first message in a new group is sent through the bundled Shortcuts **Send Message** action with all recipients at once. The helper requires a newly visible Messages group with exactly those participants before continuing. Existing exact-member groups can be used directly. All subsequent messages target that verified chat ID through Messages scripting, checking membership before and after. An individual thread, extra participant, missing participant, or changed group is a failure.

## Lockdown and retry

Lockdown and its original recipients/messages are saved before any send starts. Existing and newly opened HTTP/HTTPS tabs, including allowed sites, and Chrome's new-tab page are redirected. Extension setup pages remain accessible so the helper can be installed or repaired. Other internal Chrome pages and other applications are outside the extension's control. Disabling or removing the extension bypasses its enforcement; this is a browsing deterrent, not an OS security boundary.

Declining helper installation does not dismiss a pending alert. Closing the jail tab, restarting Chrome, editing rules, or changing contacts does not clear it. Install or repair the helper, resolve the displayed permission or Messages error, and click **Retry group alert**. Completed messages are recorded locally, so normal retries resume the remaining messages in the same chat. If the group membership changed, restore its original members before retrying.

If the helper crashes or times out between Messages accepting a send and saving the receipt, retrying may duplicate that last message. A failed first-group verification may also have sent its first message; inspect Messages before retrying. No automatic individual-text fallback occurs. Group verification intentionally fails when Messages exposes a recipient as an email alias rather than the selected phone number.

After success, Jail pages show that browsing is unlocked. Open an allowed site to continue; old violating URLs are not restored. Another violation starts another alert. The Mac helper stays installed.

## Local files and uninstall

Persistent installer files live under your user Library:

- `~/Library/Application Support/DigitalJail/Jail Helper.app`
- `~/Library/Application Support/DigitalJail/Jail Group Start.shortcut`
- `~/Library/Application Support/DigitalJail/receipts/` for alert IDs, frozen recipients/messages, and accepted-send progress
- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.digitaljail.helper.json`

Extension settings and contacts stay in Chrome local storage. Nothing is uploaded by Jail to a separate service; Messages uses Apple's/carrier messaging services and shortcut signing uses Apple's service. The native host accepts only the registered extension origin. Files use private user permissions. Receipts are retained for retry safety until uninstall.

To uninstall explicitly:

```sh
bash native/uninstall.sh --confirm
```

Then delete **Jail Group Start** in Shortcuts. Uninstalling never clears a pending Chrome lockdown; reinstalling is necessary to retry it. No automatic uninstall occurs after sending.

## Development and validation

Plain JavaScript MV3, no bundler. `npm run format` uses Prettier; `npm run lint` uses ESLint. `npm test` runs Vitest and `native/test.sh`, which compiles Swift, tests group orchestration using a fake Messages boundary, compiles the JXA script without executing it, and checks the generated shortcut plist and shell syntax. No test invokes a real Messages send, Contacts request, or installer.

Tests cover missing helpers, all-tab confinement while a send waits, worker restart, frozen recipients, exact group membership, partial retries, repeated alert IDs, first-name rendering, and vCards. Manual group delivery and macOS permission prompts remain device checks; passing mocks is not proof of live Messages delivery. This repository has no CI.

`src/telegram.js` and legacy Telegram storage keys are retained for compatibility but are not called by the Messages workflow. There are no donation or payment features.
