const api = typeof browser !== 'undefined' ? browser : chrome;

const NOTION_CLIENT_ID = '3a7d872b-594c-81cb-b8b5-00375e6e7a63';
const WORKER_URL = 'https://backend.job-saver.workers.dev';

// ---------- storage helpers ----------

async function getConnections() {
  const data = await api.storage.sync.get(['workspaceConnections']);
  return data.workspaceConnections || [];
}

async function getDestinations() {
  const data = await api.storage.sync.get(['destinations']);
  return data.destinations || [];
}

// ---------- rendering: destinations list ----------

async function renderDestinations() {
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
        <span style="font-size:11px; color:#888;">DB: ${d.databaseId.slice(0, 8)}...</span>
      </div>
      <button data-id="${d.id}" class="remove-dest">Remove</button>
    </div>
  `).join('');

  document.querySelectorAll('.remove-dest').forEach(btn => {
    btn.addEventListener('click', async () => {
      const current = await getDestinations();
      const updated = current.filter(d => d.id !== btn.dataset.id);
      await api.storage.sync.set({ destinations: updated });
      renderDestinations();
      renderConnections(); // checkbox states depend on this too
    });
  });
}

// ---------- rendering: connected workspaces ----------

async function renderConnections() {
  const connections = await getConnections();
  const container = document.getElementById('connections');

  if (connections.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<h4>Connected workspaces</h4>' + connections.map(c => `
    <div style="border:1px solid #ddd; border-radius:6px; padding:8px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
      <strong>${c.workspaceName}</strong>
      <div>
        <button data-id="${c.id}" class="browse">Browse pages &amp; databases</button>
        <button data-id="${c.id}" class="remove-conn">Disconnect</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.browse').forEach(btn => {
    btn.addEventListener('click', async () => {
      const conn = (await getConnections()).find(c => c.id === btn.dataset.id);
      if (conn) renderBrowser(conn);
    });
  });

  document.querySelectorAll('.remove-conn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const current = await getConnections();
      const updated = current.filter(c => c.id !== btn.dataset.id);
      await api.storage.sync.set({ workspaceConnections: updated });
      document.getElementById('browser').innerHTML = '';
      renderConnections();
    });
  });
}

// ---------- the page/database browser ----------

function extractTitle(item) {
  if (item.object === 'database') {
    return (item.title || []).map(t => t.plain_text).join('') || 'Untitled database';
  }
  const titleProp = item.properties?.title?.title;
  return (titleProp || []).map(t => t.plain_text).join('') || 'Untitled page';
}

async function notionSearch(token, filterValue) {
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ filter: { property: 'object', value: filterValue } }),
  });
  const data = await res.json();
  return data.results || [];
}

async function renderBrowser(conn) {
  const browser_el = document.getElementById('browser');
  browser_el.innerHTML = '<p style="font-size:13px; color:#888;">Loading pages &amp; databases...</p>';

  const [pages, databases] = await Promise.all([
    notionSearch(conn.token, 'page'),
    notionSearch(conn.token, 'database'),
  ]);

  const pageTitleById = {};
  pages.forEach(p => { pageTitleById[p.id] = extractTitle(p); });

  // group databases by their parent page (or "Workspace" if top-level)
  const groups = {};
  databases.forEach(db => {
    const parent = db.parent;
    const key = parent?.type === 'page_id'
      ? (pageTitleById[parent.page_id] || 'Untitled page')
      : 'Workspace (top level)';
    if (!groups[key]) groups[key] = [];
    groups[key].push(db);
  });

  const existingDestinations = await getDestinations();
  const selectedDbIds = new Set(existingDestinations.map(d => d.databaseId));

  if (Object.keys(groups).length === 0) {
    browser_el.innerHTML = `
      <p style="font-size:13px; color:#888;">
        No databases found. In Notion, make sure you shared the right pages with "Job Saver" —
        you can adjust this anytime under Notion Settings → Connections.
      </p>`;
    return;
  }

  browser_el.innerHTML = '<h4>Select databases to use</h4>' + Object.entries(groups).map(([pageTitle, dbs]) => `
    <div style="margin-bottom:14px;">
      <strong style="font-size:13px;">📄 ${pageTitle}</strong>
      ${dbs.map(db => {
        const title = extractTitle(db);
        const checked = selectedDbIds.has(db.id) ? 'checked' : '';
        return `
          <label style="display:block; font-size:13px; margin:4px 0 4px 16px;">
            <input type="checkbox" class="db-toggle" data-db-id="${db.id}" data-db-title="${title}" data-token="${conn.token}" ${checked} />
            ${title}
          </label>`;
      }).join('')}
    </div>
  `).join('');

  document.querySelectorAll('.db-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      const destinations = await getDestinations();

      if (cb.checked) {
        destinations.push({
          id: crypto.randomUUID(),
          label: cb.dataset.dbTitle,
          token: cb.dataset.token,
          databaseId: cb.dataset.dbId,
        });
      } else {
        const idx = destinations.findIndex(d => d.databaseId === cb.dataset.dbId);
        if (idx !== -1) destinations.splice(idx, 1);
      }

      await api.storage.sync.set({ destinations });
      renderDestinations();
    });
  });
}

// ---------- manual add ----------

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

  renderDestinations();
});

// ---------- OAuth login ----------

document.getElementById('loginWithNotion').addEventListener('click', async () => {
  const loginStatus = document.getElementById('loginStatus');
  const redirectUrl = api.identity.getRedirectURL();

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('redirect_uri', redirectUrl);

  loginStatus.textContent = 'Opening Notion login...';

  try {
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

    const connections = await getConnections();
    connections.push({
      id: crypto.randomUUID(),
      token: tokenData.access_token,
      workspaceName: tokenData.workspace_name || 'Notion workspace',
    });
    await api.storage.sync.set({ workspaceConnections: connections });

    loginStatus.textContent = `Connected to ${tokenData.workspace_name}! Choose databases below.`;
    renderConnections();
  } catch (e) {
    loginStatus.textContent = `Login failed: ${e.message}`;
  }
});

renderDestinations();
renderConnections();