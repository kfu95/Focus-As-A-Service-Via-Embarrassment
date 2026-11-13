document.querySelector('#command').textContent =
  `bash native/install.sh ${chrome.runtime.id}`;
document.querySelector('#check-helper').addEventListener('click', async () => {
  const status = document.querySelector('#helper-status');
  status.textContent = 'Checking…';
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'helper-status',
    });
    status.textContent = response?.ok
      ? 'Helper and group shortcut are installed. No text was sent.'
      : response?.error || 'No response from helper.';
  } catch (error) {
    status.textContent = error.message;
  }
});
