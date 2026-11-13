export const HOST = 'com.digitaljail.helper';
const MAX_NATIVE_MESSAGE_BYTES = 1_000_000;

export function validateNativeRequest(request) {
  const message = { version: 1, ...request };
  if (
    new TextEncoder().encode(JSON.stringify(message)).length >
    MAX_NATIVE_MESSAGE_BYTES
  )
    throw new Error(
      'Native request exceeds 1 MB. Shorten contact names before retrying.',
    );
  return message;
}

export async function helperRequest(request) {
  const message = validateNativeRequest(request);
  let response;
  try {
    response = await new Promise((resolve, reject) => {
      // A native port keeps the MV3 worker alive while Mac permission prompts are open.
      const port = chrome.runtime.connectNative(HOST);
      let received = false;
      port.onMessage.addListener((message) => {
        received = true;
        port.disconnect();
        resolve(message);
      });
      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (!received)
          reject(
            new Error(
              error?.message ||
                'Native helper disconnected before confirming the send.',
            ),
          );
      });
      port.postMessage(message);
    });
  } catch (error) {
    throw new Error(
      `Mac helper unavailable. Install or repair it using the setup instructions, then retry. ${error.message}`,
    );
  }
  if (response?.version !== 1 || !response.ok)
    throw new Error(
      response?.error || 'The Mac helper returned an invalid response.',
    );
  return response;
}

export function verifySend(response, episode) {
  const expected = episode.recipients.map(({ phone }) => phone).sort();
  const actual = response.participants?.slice().sort();
  if (
    response.episodeId !== episode.id ||
    !response.chatId ||
    !response.groupVerified ||
    expected.length < 2 ||
    JSON.stringify(expected) !== JSON.stringify(actual) ||
    response.results?.length !== expected.length ||
    !episode.recipients.every(
      ({ phone }, index) =>
        response.results[index]?.phone === phone &&
        response.results[index]?.ok === true,
    )
  )
    throw new Error(
      'Group send could not be verified. Jail remains locked. Retry after checking Messages.',
    );
}
