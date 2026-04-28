(function () {
  // ── State ────────────────────────────────────────────────────
  var state = {
    year: 'all',
    quarter: 'all',
    category: 'all',
    search: '',
    expanded: {}
  };

  // ── Helpers ──────────────────────────────────────────────────
  function getYear(dateStr) { return dateStr.slice(0, 4); }
  function getMonth(dateStr) { return parseInt(dateStr.slice(5, 7), 10); }
  function getQuarter(dateStr) { return Math.ceil(getMonth(dateStr) / 3); }

  function formatDate(dateStr) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var parts = dateStr.split('-');
    return parseInt(parts[2], 10) + '-' + months[parseInt(parts[1], 10) - 1] + '-' + parts[0];
  }

  function getAvatarColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
    }
    var hue = Math.abs(hash) % 360;
    return 'hsl(' + hue + ', 55%, 38%)';
  }

  function getInitials(name) {
    var parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Filter logic ─────────────────────────────────────────────
  function filterActivities(activities) {
    return activities.filter(function (a) {
      if (state.year !== 'all' && getYear(a.date) !== state.year) return false;
      if (state.quarter !== 'all' && getQuarter(a.date) !== parseInt(state.quarter, 10)) return false;
      if (state.category !== 'all' && a.category !== state.category) return false;
      return true;
    });
  }

  function computeScore(activities) {
    return activities.reduce(function (sum, a) { return sum + a.points; }, 0);
  }

  function getFilteredEmployees() {
    var result = window.EMPLOYEES.map(function (emp) {
      var filtered = filterActivities(emp.activities);
      return { emp: emp, activities: filtered, score: computeScore(filtered) };
    });

    // Hide employees with 0 score when any filter is active
    var anyFilterActive = state.year !== 'all' || state.quarter !== 'all' || state.category !== 'all';
    if (anyFilterActive) {
      result = result.filter(function (r) { return r.score > 0; });
    }

    // Apply search
    if (state.search.trim()) {
      var q = state.search.trim().toLowerCase();
      result = result.filter(function (r) {
        return r.emp.name.toLowerCase().indexOf(q) !== -1;
      });
    }

    result.sort(function (a, b) { return b.score - a.score; });
    return result;
  }

  function getCategoryStats(activities) {
    var stats = {};
    activities.forEach(function (a) {
      stats[a.category] = (stats[a.category] || 0) + 1;
    });
    return stats;
  }


  // ── Icons (Fluent MDL2 Hybrid Icons font) ────────────────────
  var ICONS = {
    star: '<i class="fluent-icon icon-star" aria-hidden="true"></i>',
    chevronDown: '<i class="fluent-icon icon-chevron-down" aria-hidden="true"></i>'
  };

  function categoryIcon(cat) {
    if (cat === 'Education') return '<i class="fluent-icon category-stat-icon icon-education" aria-hidden="true"></i>';
    if (cat === 'Public Speaking') return '<i class="fluent-icon category-stat-icon icon-presentation" aria-hidden="true"></i>';
    return '<i class="fluent-icon category-stat-icon icon-emoji2" aria-hidden="true"></i>';
  }

  // ── Podium ───────────────────────────────────────────────────
  function renderPodium(items) {
    var container = document.getElementById('podium');
    if (items.length === 0) {
      container.innerHTML = '';
      return;
    }

    // Natural DOM order: rank1, rank2, rank3 — CSS order property handles visual reordering
    var ordered = [];
    ordered.push({ data: items[0], rank: 1, cls: 'podium-rank1' });
    if (items[1]) ordered.push({ data: items[1], rank: 2, cls: 'podium-rank2' });
    if (items[2]) ordered.push({ data: items[2], rank: 3, cls: 'podium-rank3' });

    var html = '';
    ordered.forEach(function (item) {
      var emp = item.data.emp;
      var score = item.data.score;
      var initials = getInitials(emp.name);
      var color = getAvatarColor(emp.name);

      html += '<div class="podium-column ' + item.cls + '">';
      html += '<div class="podium-user">';
      html += '<div class="podium-avatar-container">';
      html += '<div class="podium-avatar" style="background-color:' + escapeHtml(color) + '">' + escapeHtml(initials) + '</div>';
      html += '<div class="podium-rank-badge">' + item.rank + '</div>';
      html += '</div>';
      html += '<h3 class="podium-name">' + escapeHtml(emp.name) + '</h3>';
      html += '<p class="podium-role">' + escapeHtml(emp.role) + '</p>';
      html += '<div class="podium-score">' + ICONS.star + '<span>' + score + '</span></div>';
      html += '</div>';
      html += '<div class="podium-block"><span class="podium-block-number">' + item.rank + '</span></div>';
      html += '</div>';
    });

    container.innerHTML = html;
  }

  // ── List ─────────────────────────────────────────────────────
  function renderList(items) {
    var container = document.getElementById('list');

    if (items.length === 0) {
      container.innerHTML = '<div class="empty-state">No employees match the current filters.</div>';
      return;
    }

    var html = '';
    items.forEach(function (item, idx) {
      var rank = idx + 1;
      var emp = item.emp;
      var filteredActs = item.activities;
      var score = item.score;
      var stats = getCategoryStats(filteredActs);
      var initials = getInitials(emp.name);
      var color = getAvatarColor(emp.name);
      var isExpanded = !!state.expanded[emp.id];

      html += '<div class="user-row-container' + (isExpanded ? ' row-expanded' : '') + '" data-id="' + emp.id + '">';
      html += '<div class="row"><div class="row-main">';
      html += '<div class="row-left">';
      html += '<span class="rank">' + rank + '</span>';
      html += '<div class="avatar" style="background-color:' + escapeHtml(color) + '">' + escapeHtml(initials) + '</div>';
      html += '<div class="info">';
      html += '<h3 class="name">' + escapeHtml(emp.name) + '</h3>';
      html += '<span class="role">' + escapeHtml(emp.role) + ' (' + escapeHtml(emp.dept) + ')</span>';
      html += '</div>';
      html += '</div>';

      html += '<div class="row-right">';
      html += '<div class="category-stats">';
      Object.keys(stats).forEach(function (cat) {
        html += '<div class="category-stat">';
        html += categoryIcon(cat);
        html += '<span class="category-stat-count">' + stats[cat] + '</span>';
        html += '<span class="tooltip">' + escapeHtml(cat) + '</span>';
        html += '</div>';
      });
      html += '</div>';

      html += '<div class="total-section">';
      html += '<span class="total-label">TOTAL</span>';
      html += '<div class="score">' + ICONS.star + '<span>' + score + '</span></div>';
      html += '</div>';

      html += '<button class="expand-button' + (isExpanded ? ' expanded' : '') + '" aria-label="' + (isExpanded ? 'Collapse' : 'Expand') + '" data-id="' + emp.id + '">' + ICONS.chevronDown + '</button>';
      html += '</div></div>';
      html += '</div>';

      if (isExpanded) {
        html += '<div class="activity-section">';
        html += '<div class="activity-section-title">Recent Activity</div>';
        if (filteredActs.length === 0) {
          html += '<p style="font-size:13px;color:#A19F9D">No activities match the current filters.</p>';
        } else {
          html += '<div class="table-wrapper">';
          html += '<table class="activity-table">';
          html += '<thead><tr><th>Activity</th><th>Category</th><th>Date</th><th>Points</th></tr></thead>';
          html += '<tbody>';
          var sorted = filteredActs.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
          sorted.forEach(function (act) {
            html += '<tr>';
            html += '<td class="activity-title">' + escapeHtml(act.title) + '</td>';
            html += '<td><span class="category-badge">' + escapeHtml(act.category) + '</span></td>';
            html += '<td class="activity-date">' + escapeHtml(formatDate(act.date)) + '</td>';
            html += '<td class="activity-points">+' + act.points + '</td>';
            html += '</tr>';
          });
          html += '</tbody></table>';
          html += '</div>';
        }
        html += '</div>';
      }

      html += '</div>';
    });

    container.innerHTML = html;

    // Attach expand button events
    container.querySelectorAll('.expand-button').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = parseInt(this.getAttribute('data-id'), 10);
        state.expanded[id] = !state.expanded[id];
        render();
      });
    });
  }

  // ── Main render ──────────────────────────────────────────────
  function render() {
    var items = getFilteredEmployees();
    renderPodium(items.slice(0, 3));
    renderList(items);
  }

  // ── Event listeners ──────────────────────────────────────────
  document.getElementById('filter-year').addEventListener('change', function () {
    state.year = this.value;
    state.expanded = {};
    render();
  });

  document.getElementById('filter-quarter').addEventListener('change', function () {
    state.quarter = this.value;
    state.expanded = {};
    render();
  });

  document.getElementById('filter-category').addEventListener('change', function () {
    state.category = this.value;
    state.expanded = {};
    render();
  });

  var searchTimeout;
  document.getElementById('search-input').addEventListener('input', function () {
    var val = this.value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function () {
      state.search = val;
      render();
    }, 120);
  });

  // ── Boot ─────────────────────────────────────────────────────
  render();
})();
