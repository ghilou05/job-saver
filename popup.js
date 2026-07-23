const api = typeof browser !== 'undefined' ? browser : chrome;

async function init() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  document.getElementById('jobTitle').value = tab.title;
  document.getElementById('url').value = tab.url;
}
init();

document.getElementById('save').addEventListener('click', async () => {
  const statusMsg = document.getElementById('status-msg');
  statusMsg.textContent = 'Saving...';

  const { notionToken, notionDatabaseId } = await api.storage.sync.get([
    'notionToken', 'notionDatabaseId'
  ]);

  if (!notionToken || !notionDatabaseId) {
    statusMsg.textContent = 'Set up your Notion token in Options first.';
    return;
  }

  const company = document.getElementById('company').value.trim();
  const jobTitle = document.getElementById('jobTitle').value.trim();
  const url = document.getElementById('url').value.trim();
  const notes = document.getElementById('notes').value.trim();

  const properties = {
    'Company': { title: [{ text: { content: company || 'Unknown company' } }] },
    'Job Title': { rich_text: [{ text: { content: jobTitle } }] },
    'Link': { url: url || null },
    'Status': { status: { name: 'Not Applied Yet' } },  
  };

  if (notes) {
    properties['Notes'] = { rich_text: [{ text: { content: notes } }] };
  }

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: notionDatabaseId },
        properties,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `Error ${res.status}`);
    }

    statusMsg.textContent = 'Saved ✅';
    setTimeout(() => window.close(), 800);
  } catch (e) {
    statusMsg.textContent = e.message;
  }
});