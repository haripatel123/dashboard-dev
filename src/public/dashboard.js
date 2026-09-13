/* Dashboard Client Controller — Clean Black & White on White Background */

document.addEventListener('DOMContentLoaded', () => {
  setupChartDefaults();
  initCharts();
  initSyncButton();
  initRelativeTimeTicker();
});

let charts = {
  prTrends: null,
  contributors: null,
  repoActivity: null
};

/**
 * Configure clean black and white defaults for Chart.js on white background.
 */
function setupChartDefaults() {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.color = '#4b5563';
  Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  Chart.defaults.font.size = 12;

  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.legend.labels.color = '#000000';

  Chart.defaults.plugins.tooltip.backgroundColor = '#000000';
  Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
  Chart.defaults.plugins.tooltip.bodyColor = '#e5e7eb';
  Chart.defaults.plugins.tooltip.borderColor = '#000000';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 8;
  Chart.defaults.plugins.tooltip.cornerRadius = 4;
}

/**
 * Loads metric endpoints and renders the 3 Chart.js graphs.
 */
async function initCharts() {
  await Promise.all([
    renderPRTrendsChart(),
    renderContributorsChart(),
    renderRepoActivityChart()
  ]);
}

/**
 * Chart 1: PR Trends (Opened vs Merged line chart in black & white)
 */
async function renderPRTrendsChart() {
  const canvas = document.getElementById('prTrendsChart');
  if (!canvas) return;

  try {
    const res = await fetch('/api/metrics/prs-per-day?days=14');
    const json = await res.json();
    const data = json.data || [];

    const labels = data.map(d => {
      const parts = d.day.split('-');
      return `${parts[1]}/${parts[2]}`;
    });
    const openedData = data.map(d => d.opened);
    const mergedData = data.map(d => d.merged);

    const ctx = canvas.getContext('2d');
    const gridColor = '#f3f4f6';

    if (charts.prTrends) charts.prTrends.destroy();

    charts.prTrends = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [
          {
            label: 'PRs Opened',
            data: openedData.length ? openedData : [0],
            borderColor: '#000000',
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#000000',
            pointRadius: 3,
            pointHoverRadius: 5
          },
          {
            label: 'PRs Merged',
            data: mergedData.length ? mergedData : [0],
            borderColor: '#6b7280',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#6b7280',
            pointRadius: 3,
            pointHoverRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: '#6b7280' }
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { precision: 0, color: '#6b7280' }
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to load PR trends chart:', err);
  }
}

/**
 * Chart 2: Top Contributors (Horizontal bar chart)
 */
async function renderContributorsChart() {
  const canvas = document.getElementById('contributorsChart');
  if (!canvas) return;

  try {
    const res = await fetch('/api/metrics/top-contributors?days=7&limit=10');
    const json = await res.json();
    const data = json.data || [];

    const labels = data.map(d => `@${d.actor}`);
    const counts = data.map(d => d.events);

    const ctx = canvas.getContext('2d');
    const gridColor = '#f3f4f6';

    if (charts.contributors) charts.contributors.destroy();

    charts.contributors = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['No Activity'],
        datasets: [{
          label: 'Total Actions (7d)',
          data: counts.length ? counts : [0],
          backgroundColor: '#000000',
          borderRadius: 3,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { precision: 0, color: '#6b7280' }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: '#000000',
              font: { family: "'JetBrains Mono', monospace", size: 11 }
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to load contributors chart:', err);
  }
}

/**
 * Chart 3: Activity by Repository (Stacked bar chart in black and grayscale)
 */
async function renderRepoActivityChart() {
  const canvas = document.getElementById('repoActivityChart');
  if (!canvas) return;

  try {
    const res = await fetch('/api/metrics/activity-by-repo?days=14');
    const json = await res.json();
    const rawData = json.data || [];

    const repoMap = new Map();
    for (const item of rawData) {
      if (!repoMap.has(item.repo)) {
        repoMap.set(item.repo, { prs: 0, commits: 0, issues: 0 });
      }
      const existing = repoMap.get(item.repo);
      existing.prs += item.prs || 0;
      existing.commits += item.commits || 0;
      existing.issues += item.issues || 0;
    }

    const repos = Array.from(repoMap.keys());
    const prs = repos.map(r => repoMap.get(r).prs);
    const commits = repos.map(r => repoMap.get(r).commits);
    const issues = repos.map(r => repoMap.get(r).issues);

    const ctx = canvas.getContext('2d');
    const gridColor = '#f3f4f6';

    if (charts.repoActivity) charts.repoActivity.destroy();

    charts.repoActivity = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: repos.length ? repos : ['No Tracked Repos'],
        datasets: [
          {
            label: 'Pull Requests',
            data: prs.length ? prs : [0],
            backgroundColor: '#000000',
            borderRadius: 2
          },
          {
            label: 'Commits',
            data: commits.length ? commits : [0],
            backgroundColor: '#6b7280',
            borderRadius: 2
          },
          {
            label: 'Issues',
            data: issues.length ? issues : [0],
            backgroundColor: '#d1d5db',
            borderRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: { color: gridColor },
            ticks: {
              color: '#000000',
              font: { family: "'JetBrains Mono', monospace", size: 11 }
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { precision: 0, color: '#6b7280' }
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to load repo activity chart:', err);
  }
}

/**
 * Handle "Sync Now" button clicks and UI states.
 */
function initSyncButton() {
  const syncBtn = document.getElementById('syncNowBtn');
  const syncBtnText = document.getElementById('syncBtnText');
  const syncIcon = document.getElementById('syncIcon');
  const liveStatusDot = document.getElementById('liveStatusDot');

  if (!syncBtn) return;

  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtnText.textContent = 'Syncing...';
    if (liveStatusDot) liveStatusDot.classList.add('syncing');

    const originalIcon = syncIcon.innerHTML;
    syncIcon.innerHTML = '<span class="sync-spinner"></span>';

    try {
      const res = await fetch('/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(`Sync completed! ${data.data?.eventsIngested || 0} new events ingested in ${data.data?.durationMs || 0}ms.`, 'success');
        updateLastSynced(new Date().toISOString());
        await refreshDashboardData();
      } else {
        const errorMsg = data.message || data.error || 'Failed to sync with GitHub';
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtnText.textContent = 'Sync Now';
      syncIcon.innerHTML = originalIcon;
      if (liveStatusDot) liveStatusDot.classList.remove('syncing');
    }
  });
}

/**
 * Refresh stats, charts, and activity table in place.
 */
async function refreshDashboardData() {
  try {
    const statsRes = await fetch('/api/metrics/stats');
    if (statsRes.ok) {
      const statsJson = await statsRes.json();
      const s = statsJson.data || {};
      const prEl = document.getElementById('statPrsMerged');
      const comEl = document.getElementById('statCommits');
      const issEl = document.getElementById('statOpenIssues');
      if (prEl) prEl.textContent = s.prs_merged_7d || 0;
      if (comEl) comEl.textContent = s.commits_7d || 0;
      if (issEl) issEl.textContent = s.open_issues_now !== undefined ? s.open_issues_now : (s.open_issues_recent || 0);
    }

    await initCharts();

    const eventsRes = await fetch('/api/metrics/recent-events?limit=15');
    if (eventsRes.ok) {
      const eventsJson = await eventsRes.json();
      renderActivityRows(eventsJson.data || []);
    }
  } catch (err) {
    console.error('Error refreshing dashboard data:', err);
  }
}

/**
 * Re-render activity table rows with latest events.
 */
function renderActivityRows(events) {
  const tbody = document.getElementById('activityTableBody');
  if (!tbody) return;

  if (!events || events.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          No events ingested yet. Click "Sync Now" to trigger the first integration pull!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = events.map(event => {
    const detail = event.payload?.title || event.payload?.message || ('#' + (event.payload?.number || event.source_id));
    const link = event.payload?.html_url;
    const detailHtml = link
      ? `<a href="${link}" target="_blank" rel="noopener noreferrer" class="event-link">${escapeHtml(detail)}</a>`
      : `<span>${escapeHtml(detail)}</span>`;

    return `
      <tr>
        <td>
          <span class="badge">
            ${escapeHtml(event.event_type.replace('_', ' '))}
          </span>
        </td>
        <td>${detailHtml}</td>
        <td><span class="actor-pill">@${escapeHtml(event.actor || 'system')}</span></td>
        <td><span class="target-pill">${escapeHtml(event.target)}</span></td>
        <td><span class="time-pill">${new Date(event.occurred_at).toLocaleString()}</span></td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Relative time ticker ("Last synced: X minutes ago").
 */
function initRelativeTimeTicker() {
  updateRelativeTimeDisplay();
  setInterval(updateRelativeTimeDisplay, 30000);
}

function updateRelativeTimeDisplay() {
  const textEl = document.getElementById('lastSyncedText');
  if (!textEl) return;

  const lastSyncedIso = textEl.getAttribute('data-last-synced');
  if (!lastSyncedIso) {
    textEl.textContent = 'Not synced yet';
    return;
  }

  const date = new Date(lastSyncedIso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) {
    textEl.textContent = 'Synced just now';
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    textEl.textContent = `Synced ${mins} min${mins === 1 ? '' : 's'} ago`;
  } else {
    const hours = Math.floor(diffSec / 3600);
    textEl.textContent = `Synced ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
}

function updateLastSynced(isoDate) {
  const textEl = document.getElementById('lastSyncedText');
  if (textEl) {
    textEl.setAttribute('data-last-synced', isoDate);
    updateRelativeTimeDisplay();
  }
}

/**
 * Toast Notification Helper.
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
