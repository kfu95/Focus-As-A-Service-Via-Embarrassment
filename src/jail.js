const retry = document.querySelector('#retry');
const graceBanner = document.querySelector('#grace-period-banner');
const graceText = document.querySelector('#grace-period-text');
const endGraceButton = document.querySelector('#end-grace-period');
const bottomText = document.querySelector('#bottom-helper-text');
const popup = document.querySelector('#alert-popup');
const popupTitle = document.querySelector('#popup-title');
const popupBody = document.querySelector('#popup-body');
const popupOkBtn = document.querySelector('#popup-ok-btn');

let previousLockdown = undefined;
let sendingPopupShown = false;
let sentPopupShown = false;

function showPopup(title, body) {
  if (!popup) return;
  if (popupTitle) popupTitle.textContent = title;
  if (popupBody) popupBody.textContent = body;
  try {
    if (!popup.open && popup.showModal) {
      popup.showModal();
    } else {
      popup.setAttribute('open', '');
    }
  } catch {
    popup.setAttribute('open', '');
  }
}

if (popupOkBtn && popup) {
  popupOkBtn.addEventListener('click', () => {
    try {
      popup.close();
    } catch {
      popup.removeAttribute('open');
    }
  });
}

async function render() {
  const { lockdown, lastSendError, gracePeriodUntil } =
    await chrome.storage.local.get({
      lockdown: null,
      lastSendError: '',
      gracePeriodUntil: 0,
    });
  const inGrace =
    !lockdown && gracePeriodUntil && Date.now() < gracePeriodUntil;

  if (lockdown) {
    document.querySelector('#heading').textContent =
      'Your browsing is locked.';
    document.querySelector('#explanation').textContent =
      'A tab broke your rules. Violating tabs stay here until Messages accepts all your group messages.';
    document.querySelector('#delivery').textContent =
      lastSendError ||
      'Sending the alert in the background. Allow the requested Mac permissions.';
    retry.hidden = false;
    if (bottomText) bottomText.hidden = false;

    if (!sendingPopupShown) {
      sendingPopupShown = true;
      showPopup(
        'Alert sending',
        'A browsing rule was broken. Your emergency group alert is sending in the background.',
      );
    }
  } else {
    const consoling = "So you messed up, and it's been sent. Good luck.";
    document.querySelector('#heading').textContent = consoling;
    document.querySelector('#explanation').textContent = inGrace
      ? `Browsing rules are paused until ${new Date(gracePeriodUntil).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
      : 'Browsing is unlocked. The damage has been done.';
    document.querySelector('#delivery').textContent = '';
    retry.hidden = true;
    if (bottomText) bottomText.hidden = true;

    if (!sentPopupShown && (previousLockdown !== undefined || inGrace)) {
      sentPopupShown = true;
      showPopup('Alert sent', consoling);
    }
  }

  previousLockdown = lockdown;

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
