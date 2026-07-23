const api = typeof browser !== 'undefined' ? browser : chrome;

async function load() {
  const data = await api.storage.sync.get(['notionToken', 'notionDatabaseId']);
  if (data.notionToken) document.getElementById('token').value = data.notionToken;
  if (data.notionDatabaseId) document.getElementById('dbId').value = data.notionDatabaseId;
}
load();

document.getElementById('save').addEventListener('click', async () => {
  await api.storage.sync.set({
    notionToken: document.getElementById('token').value.trim(),
    notionDatabaseId: document.getElementById('dbId').value.trim(),
  });

  const status = document.getElementById('status') || document.createElement('div');
  status.textContent = 'Saved';
});