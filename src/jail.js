const retry = document.querySelector('#retry');
const graceBanner = document.querySelector('#grace-period-banner');
const graceText = document.querySelector('#grace-period-text');
const endGraceButton = document.querySelector('#end-grace-period');

async function render() {
  const { lockdown, lastSendError, gracePeriodUntil } =
    await chrome.storage.local.get({
      lockdown: null,
      lastSendError: '',
      gracePeriodUntil: 0,
    });
  const inGrace =
    !lockdown && gracePeriodUntil && Date.now() < gracePeriodUntil;
  document.querySelector('#heading').textContent = lockdown
    ? 'Your browsing is locked.'
    : inGrace
      ? 'Grace period active.'
      : 'Your alert was sent.';
  document.querySelector('#explanation').textContent = lockdown
    ? 'A tab broke your rules. Violating tabs stay here until Messages accepts all your group messages.'
    : inGrace
      ? `Browsing rules are paused until ${new Date(gracePeriodUntil).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
      : 'Jail is unlocked. Open an allowed site to continue. The helper stays installed for next time.';
  document.querySelector('#delivery').textContent = lockdown
    ? lastSendError || 'Sending the alert. Allow the requested Mac permissions.'
    : 'All messages accepted by Messages. This does not confirm delivery to each phone.';
  retry.hidden = !lockdown;
  if (graceBanner) {
    graceBanner.hidden = !inGrace;
    if (inGrace && graceText) {
      graceText.textContent =
        'Your alert was sent and browsing is temporarily unlocked. You can override and re-arm rules immediately.';
    }
  }
}

if (endGraceButton) {
  endGraceButton.addEventListener('click', async () => {
    endGraceButton.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'end-grace-period' });
    } finally {
      endGraceButton.disabled = false;
      await render();
    }
  });
}
retry.addEventListener('click', async () => {
  retry.disabled = true;
  document.querySelector('#result').textContent = 'Retrying…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'retry-alert' });
    if (!response?.ok)
      throw new Error(response?.error || 'No response from Jail.');
    document.querySelector('#result').textContent = '';
  } catch (error) {
    await render();
    document.querySelector('#result').textContent =
      error.message === document.querySelector('#delivery').textContent
        ? 'Retry failed. Resolve the error above before trying again.'
        : error.message;
  } finally {
    retry.disabled = false;
    await render();
  }
});
chrome.storage.onChanged.addListener(() => render().catch(console.error));
render().catch((error) => {
  document.querySelector('#result').textContent = error.message;
});
chrome.runtime
  .sendMessage({ type: 'helper-status' })
  .then((response) => {
    document.querySelector('#helper-status').textContent = response?.ok
      ? 'Mac helper installed.'
      : 'Helper setup needs attention. Open the installation instructions below.';
  })
  .catch((error) => {
    document.querySelector('#helper-status').textContent = error.message;
  });
