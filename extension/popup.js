const api = typeof browser !== 'undefined' ? browser : chrome;

async function init() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  document.getElementById('jobTitle').value = tab.title;
  document.getElementById('url').value = tab.url;

  const { destinations } = await api.storage.sync.get(['destinations']);
  const container = document.getElementById('destinations');

  if (!destinations || destinations.length === 0) {
    container.innerHTML = '<p style="font-size:12px; color:#888;">No destinations set up — check Options.</p>';
    document.getElementById('save').disabled = true;
    return;
  }

  container.innerHTML = destinations.map((d, i) => `
    <label style="display:flex; align-items:center; gap:6px; font-weight:normal;">
      <input type="checkbox" class="dest-check" value="${d.id}" ${i === 0 ? 'checked' : ''} />
      ${d.label}
    </label>
  `).join('');
}
init();

document.getElementById('save').addEventListener('click', async () => {
  const statusMsg = document.getElementById('status-msg');

  const { destinations } = await api.storage.sync.get(['destinations']);
  const selectedIds = Array.from(document.querySelectorAll('.dest-check:checked')).map(cb => cb.value);

  if (selectedIds.length === 0) {
    statusMsg.textContent = 'Pick at least one destination.';
    return;
  }

  const selectedDestinations = destinations.filter(d => selectedIds.includes(d.id));

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

  statusMsg.textContent = `Saving to ${selectedDestinations.length} destination(s)...`;

  // Fire all saves in parallel, track which succeed and which fail
  const results = await Promise.allSettled(
    selectedDestinations.map(dest =>
      fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${dest.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: dest.databaseId },
          properties,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || `Error ${res.status}`);
        }
        return dest.label;
      })
    )
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? { label: selectedDestinations[i].label, reason: r.reason.message } : null))
    .filter(Boolean);

  if (failed.length === 0) {
    statusMsg.textContent = `Saved to ${succeeded.join(', ')} ✅`;
    setTimeout(() => window.close(), 1000);
  } else {
    statusMsg.textContent = `Saved to ${succeeded.join(', ') || 'none'}. Failed: ${failed.map(f => f.label).join(', ')}`;
  }
});