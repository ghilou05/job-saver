const api = typeof browser !== 'undefined' ? browser : chrome;

// ---------------------------------------------------------------------------
// Site-specific scrapers.
// Add one entry per site you want "fully supported" — key is the hostname
// (window.location.hostname), value is a function returning
// { jobTitle, company } or null if it can't find what it's looking for.
//
// Runs INSIDE the job listing page itself (via scripting.executeScript),
// so it can only reference things defined within this function — no
// closures over anything else in this file.
// ---------------------------------------------------------------------------

function extractJobInfo() {
  function slugToTitleCase(slug) {
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  console.log("start of function")
  const SITE_SCRAPERS = {
    "www.gradcracker.com": () => {
      console.log("GRADCRACKER")
      const segments = window.location.pathname.split("/").filter(Boolean);

      const titleEl = document.querySelector("h1.tw-text-employer-500");

      const companyEl = slugToTitleCase(segments[2]);

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,

        company: companyEl?.trim() || null,
      };
    },
    "targetjobs.co.uk": () => {
      const titleEl = document.querySelector(".main-content h1")
      const companyEl = document.querySelector('[data-cy="organisation-name]');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent?.trim() || null,
      };
    },
    "careerconnect.manchester.ac.uk": () => {
      const titleEl = document.querySelector('.inferno-job-details .mb-3');
      const companyEl = document.querySelector('.inferno-job-details .job-employer');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent?.trim() || null,
      };
    },
    "www.totaljobs.com": () => {
      const titleEl = document.querySelector('.js-listing-header h1')
      const companyEl = document.querySelector('.at-listing__list-icons_company-name span')

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent?.trim() || null,
      };
    },
    "www.cv-library.co.uk": () => {
      const titleEl = document.querySelector('[data-qa="job-title"]');
      const companyEl = document.querySelector('[data-qa="company-name-link"]');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent.trim() || null,
      };
    },
    "www.brightnetwork.co.uk": () => {
      const titleEl = document.querySelector('#main-content h1');
      const companyEl = document.querySelector('#main-content .banner-container a span');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent.trim() || null,
      };    
    },
    "uk.indeed.com": () => {
      const titleEl = document.querySelector('.jobsearch-JobInfoHeader-title span');
      const companyEl = document.querySelector('[data-testid="inlineHeader-companyName"]');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.replace('- job post', '').trim() || null,
        company: companyEl?.textContent.trim() || null,
      };    
    },
    "www.prospects.ac.uk": () => {
      const titleEl = document.querySelector('.section-job-details-meta h1');
      const companyEl = document.querySelector('.section-job-details-meta-data li a');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent.trim() || null,
      };    
    },    
    "www.graduate-jobs.com": () => {
      const titleEl = document.querySelector('.c-job-listing__title');
      const companyEl = document.querySelector('.c-job-listing__employer');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent.trim() || null,
      };    
    },        
    "debut.careers": () => {
      const titleEl = document.querySelector('.jobs_post h1');
      const companyEl = document.querySelector('.card-body h3');

      if (!titleEl && !companyEl) return null;

      return {
        jobTitle: titleEl?.textContent?.trim() || null,
        company: companyEl?.textContent.replace('Employer: ', '').trim() || null,
      };    
    },        
  };

  const hostname = window.location.hostname;

  // 1. Site-specific scraper, if we've built one for this exact site
  console.log("site", SITE_SCRAPERS[hostname]);
  if (SITE_SCRAPERS[hostname]) {
    const result = SITE_SCRAPERS[hostname]();
    if (result && (result.jobTitle || result.company)) {
      return {
        jobTitle: result.jobTitle || '',
        company: result.company || '',
        source: 'site-specific',
      };
    }
  }

  // 2. Generic fallback: JSON-LD JobPosting structured data
  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of ldScripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item['@type'] === 'JobPosting') {
          return {
            jobTitle: item.title || '',
            company: item.hiringOrganization?.name || '',
            source: 'jsonld',
          };
        }
      }
    } catch (e) {
      // malformed JSON-LD on the page, skip it
    }
  }

  // 3. Generic fallback: Microdata
  const scope = document.querySelector('[itemtype*="schema.org/JobPosting"]');
  if (scope) {
    const titleEl = scope.querySelector('[itemprop="title"]');
    const orgEl = scope.querySelector('[itemprop="hiringOrganization"] [itemprop="name"]');
    if (titleEl || orgEl) {
      return {
        jobTitle: titleEl?.textContent?.trim() || '',
        company: orgEl?.textContent?.trim() || '',
        source: 'microdata',
      };
    }
  }

  // 4. Nothing found — caller falls back to tab.title, company stays blank
  return { jobTitle: '', company: '', source: 'none' };
}

async function init() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  document.getElementById('url').value = tab.url;

  // Default to the tab's own title/blank company, then try to improve on it
  document.getElementById('jobTitle').value = tab.title;
  document.getElementById('company').value = '';

  try {
    const [{ result }] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJobInfo,
    });

    // Only override the tab title if the scraper actually found one —
    // otherwise keep the tab title, which is still better than nothing.
    if (result.jobTitle) {
      document.getElementById('jobTitle').value = result.jobTitle;
    }
    document.getElementById('company').value = result.company;

    console.log('Extraction source:', result.source); // remove once confirmed working well
  } catch (e) {
    // Some pages (chrome:// pages, PDF viewers, etc.) block script injection —
    // tab title / blank company (already set above) is the safe fallback.
  }

  // Render the destination checkboxes
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

  // Fire all saves in parallel; track which succeed and which fail independently
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