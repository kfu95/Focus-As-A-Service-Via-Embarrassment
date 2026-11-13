export async function sendTelegramMessage({ token, chatId, message }) {
  if (!token.trim() || !chatId.trim()) {
    throw new Error('Enter both a Telegram bot token and group chat ID.');
  }

  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
  } catch (error) {
    throw new Error(`Telegram could not be reached: ${error.message}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      `Telegram returned an invalid response (${response.status}).`,
    );
  }
  if (!response.ok || !payload.ok) {
    throw new Error(
      payload.description ||
        `Telegram rejected the request (${response.status}).`,
    );
  }
  return payload.result;
}
