import { parseVCards } from './vcard.js';

export function setupContactImport(addContacts, showError) {
  const drop = document.querySelector('#contact-drop');
  const picker = document.querySelector('#mac-picker');
  const search = document.querySelector('#contact-search');
  let available = [];
  const render = () => {
    picker.replaceChildren();
    for (const contact of available
      .filter((c) =>
        `${c.name} ${c.phone}`
          .toLowerCase()
          .includes(search.value.toLowerCase()),
      )
      .slice(0, 100)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Add ${contact.name} (${contact.phone})`;
      button.addEventListener('click', () => addContacts([contact]));
      picker.append(button);
    }
  };
  search.addEventListener('input', render);
  document
    .querySelector('#load-mac-contacts')
    .addEventListener('click', async () => {
      try {
        showError('Requesting Contacts access…');
        const response = await chrome.runtime.sendMessage({
          type: 'read-contacts',
        });
        if (!response?.ok)
          throw new Error(response?.error || 'Could not read Contacts.');
        available = response.contacts;
        render();
        showError(
          available.length ? '' : 'No named contacts with phone numbers found.',
        );
      } catch (error) {
        showError(error.message);
      }
    });
  const importFiles = async (files) => {
    try {
      const imported = [];
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.vcf') || file.size > 1_000_000)
          throw new Error('Choose .vcf contact cards smaller than 1 MB.');
        imported.push(...parseVCards(await file.text()));
      }
      addContacts(imported);
      showError('');
    } catch (error) {
      showError(error.message);
    }
  };
  if (drop) {
    drop.addEventListener('dragover', (event) => event.preventDefault());
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      importFiles(event.dataTransfer.files);
    });
  }
  const fileInput = document.querySelector('#contact-files');
  if (fileInput) {
    fileInput.addEventListener('change', (event) =>
      importFiles(event.target.files),
    );
  }
}
