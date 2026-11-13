const retry = document.querySelector('#retry');
async function render() {
  const { lockdown, lastSendError } = await chrome.storage.local.get({
    lockdown: null,
    lastSendError: '',
  });
  document.querySelector('#heading').textContent = lockdown
    ? 'Your browsing is locked.'
    : 'Your alert was sent.';
  document.querySelector('#explanation').textContent = lockdown
    ? 'A tab broke your rules. Violating tabs stay here until Messages accepts all your group messages.'
    : 'Jail is unlocked. Open an allowed site to continue. The helper stays installed for next time.';
  document.querySelector('#delivery').textContent = lockdown
    ? lastSendError || 'Sending the alert. Allow the requested Mac permissions.'
    : 'All messages accepted by Messages. This does not confirm delivery to each phone.';
  retry.hidden = !lockdown;
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
