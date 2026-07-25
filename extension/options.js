const api = typeof browser !== 'undefined' ? browser : chrome;

const NOTION_CLIENT_ID = '3a7d872b-594c-81cb-b8b5-00375e6e7a63';
const WORKER_URL = 'https://backend.job-saver.workers.dev';

async function getDestinations() {
  const data = await api.storage.sync.get(['destinations']);
  return data.destinations || [];
}

async function render() {
  const destinations = await getDestinations();
  const list = document.getElementById('list');

  if (destinations.length === 0) {
    list.innerHTML = '<p style="color:#888; font-size:13px;">No destinations yet.</p>';
    return;
  }

  list.innerHTML = destinations.map(d => `
    <div style="border:1px solid #ddd; border-radius:6px; padding:8px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <strong>${d.label}</strong><br/>
        <span style="font-size:11px; color:#888;">
          ${d.databaseId ? `DB: ${d.databaseId.slice(0, 8)}...` : 'No database selected yet'}
        </span>
      </div>
      <button data-id="${d.id}" class="remove">Remove</button>
    </div>
  `).join('');

  document.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const current = await getDestinations();
      const updated = current.filter(d => d.id !== id);
      await api.storage.sync.set({ destinations: updated });
      render();
    });
  });
}

// Manual add (token/database ID flow)
document.getElementById('add').addEventListener('click', async () => {
  const label = document.getElementById('newLabel').value.trim();
  const token = document.getElementById('newToken').value.trim();
  const databaseId = document.getElementById('newDbId').value.trim();

  if (!label || !token || !databaseId) {
    document.getElementById('status').textContent = 'Fill in all three fields.';
    document.getElementById('status').style.color = '#c0392b';
    return;
  }

  const destinations = await getDestinations();
  destinations.push({ id: crypto.randomUUID(), label, token, databaseId });
  await api.storage.sync.set({ destinations });

  document.getElementById('newLabel').value = '';
  document.getElementById('newToken').value = '';
  document.getElementById('newDbId').value = '';
  document.getElementById('status').textContent = 'Added ✅';
  document.getElementById('status').style.color = '#1e824c';

  render();
});

// OAuth login flow
document.getElementById('loginWithNotion').addEventListener('click', async () => {
  const loginStatus = document.getElementById('loginStatus');
  const redirectUrl = api.identity.getRedirectURL();

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('redirect_uri', redirectUrl); // Firefox's own URL now, not the Worker's

  loginStatus.textContent = 'Opening Notion login...';

  try {
    // Step 1: get Notion to hand us back an authorization code
    const resultUrl = await api.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    const code = new URL(resultUrl).searchParams.get('code');
    if (!code) {
      loginStatus.textContent = 'Login failed — no code returned.';
      return;
    }

    loginStatus.textContent = 'Exchanging code for access...';

    // Step 2: trade that code for a real access token, via our Worker (holds the secret)
    const tokenRes = await fetch(`${WORKER_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUrl }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      loginStatus.textContent = `Login failed: ${tokenData.error || 'unknown error'}`;
      return;
    }

    const destinations = await getDestinations();
    destinations.push({
      id: crypto.randomUUID(),
      label: tokenData.workspace_name || 'Notion workspace',
      token: tokenData.access_token,
      databaseId: null,
    });
    await api.storage.sync.set({ destinations });

    loginStatus.textContent = `Connected to ${tokenData.workspace_name}!`;
    render();
  } catch (e) {
    loginStatus.textContent = `Login failed: ${e.message}`;
  }
});

render();