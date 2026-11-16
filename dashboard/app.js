// Token Radar's page. It reads window.RADAR — the board, the live set and the model constants that
// main.ts wrote beside dashboard/ — and renders the ranked board, its filters, a detail sheet for
// every protocol and the farm plan the model generated for it. No network, no framework: every byte
// on screen is in data.js, and every number is the one board.json carries.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var app = document.getElementById('app');
  var mast = document.getElementById('mast-meta');
  var foot = document.getElementById('foot-meta');
  var MAX = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; }));
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'board', sort: 'rank', dir: 1, selected: null };

  // ---------------------------------------------------------------- formatting

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(n < 1e10 ? 2 : 1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n < 1e8 ? 2 : 1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n;
  }
  function fmtExact(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 730) return (days / 365).toFixed(1) + 'y';
    if (days >= 365) return (days / 365).toFixed(2) + 'y';
    return Math.round(days) + 'd';
  }
  function pctClass(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'num flat';
    return 'num ' + (n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat');
  }

  // ---------------------------------------------------------------- tiny DOM helper

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid === null || kid === undefined) continue;
      if (Array.isArray(kid)) kid.forEach(function (k) { if (k !== null && k !== undefined) node.appendChild(k); });
      else if (typeof kid === 'string' || typeof kid === 'number') node.appendChild(document.createTextNode(String(kid)));
      else node.appendChild(kid);
    }
    return node;
  }

  // ---------------------------------------------------------------- data views

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var count = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { count[c] = (count[c] || 0) + 1; }); });
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a] || (a < b ? -1 : 1); });
  }
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  // ---------------------------------------------------------------- masthead, hero, controls

  function renderMast() {
    mast.textContent = '';
    mast.appendChild(h('span', { class: 'pill' }, h('span', { class: 'live-dot' }), 'Snapshot ', h('b', { text: DATA.as_of })));
    mast.appendChild(h('span', { class: 'pill' }, 'DefiLlama protocol index'));
    mast.appendChild(h('span', { class: 'pill' }, h('b', { text: DATA.model.version }), ' model'));
    foot.textContent = DATA.rows.length + ' ranked rows · ' + DATA.watchlist_size + ' watchlist slugs covered · ' + DATA.live_size + ' live-token protocols set aside · source snapshot ' + DATA.as_of;
  }

  function hero() {
    return h('section', { class: 'hero' },
      h('div', null,
        h('div', { class: 'eyebrow', text: 'Pre-token radar · snapshot ' + DATA.as_of }),
        h('h1', null, DATA.board_size + ' protocols with no token, ranked by ', h('em', { text: 'implied value' }), '.'),
        h('p', { class: 'lede' },
          'Every protocol in the snapshot that records no token and is not a wrapped or staked product, scored from three facts: ',
          h('b', { text: 'TVL' }), ', ', h('b', { text: 'seven-day growth' }), ', and ', h('b', { text: 'how long it has run without a token' }),
          '. The house watchlist is the floor — all ', h('b', { text: String(DATA.watchlist_size) }), ' of its slugs are on the board — and the radar carries ',
          h('b', { text: String(DATA.early_size) }), ' more protocols below it. Protocols whose token already trades are kept in their own tab, out of the ranking.'
        )
      ),
      h('div', { class: 'scorecard' },
        h('div', { class: 'stat' }, h('span', { text: 'Watchlist covered' }), h('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), h('small', { text: 'every slug on the board' })),
        h('div', { class: 'stat' }, h('span', { text: 'Rows ranked' }), h('b', { text: String(DATA.board_size) }), h('small', { text: DATA.early_size + ' below the floor' })),
        h('div', { class: 'stat' }, h('span', { text: 'Watchlist TVL' }), h('b', { text: fmtUsd(DATA.watchlist_tvl_usd) }), h('small', { text: 'sum of the 40 covered' })),
        h('div', { class: 'stat' }, h('span', { text: 'Median run' }), h('b', { text: fmtAge(DATA.median_age_days) }), h('small', { text: 'without a token' }))
      )
    );
  }

  var countEl;
  var tableSlot;

  function controls() {
    var search = h('input', { id: 'radar-search', type: 'search', placeholder: 'Search protocol, category or chain', 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; update(); });

    var cat = h('select', { id: 'radar-category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories().map(function (c) { return h('option', { value: c, text: c }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; update(); });

    var chain = h('select', { id: 'radar-chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains().map(function (c) { return h('option', { value: c, text: c }); })
    );
    chain.addEventListener('change', function () { state.chain = chain.value; update(); });

    var box = h('input', { id: 'radar-watch', type: 'checkbox', 'aria-label': 'Watchlist only' });
    box.addEventListener('change', function () { state.watchOnly = box.checked; update(); });
    var watch = h('label', { class: 'switch' }, box, h('span', { class: 'track' }), 'Watchlist only');

    var reset = h('button', { class: 'reset', type: 'button', text: 'Reset' });
    reset.addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false;
      search.value = ''; cat.value = 'all'; chain.value = 'all'; box.checked = false;
      update();
    });

    var boardTab = h('button', { type: 'button', role: 'tab', text: 'Board' });
    var liveTab = h('button', { type: 'button', role: 'tab', text: 'Live tokens' });
    boardTab.addEventListener('click', function () { state.tab = 'board'; update(); });
    liveTab.addEventListener('click', function () { state.tab = 'live'; update(); });
    boardTab.setAttribute('aria-selected', 'true');
    liveTab.setAttribute('aria-selected', 'false');

    countEl = h('span', { class: 'count' });

    var bar = h('div', { class: 'controls' },
      h('div', { class: 'search' },
        h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
          h('circle', { cx: '7', cy: '7', r: '5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4' }),
          h('path', { d: 'M10.8 10.8 L14 14', stroke: 'currentColor', 'stroke-width': '1.4' })
        ),
        search
      ),
      h('span', { class: 'select-wrap' }, cat),
      h('span', { class: 'select-wrap' }, chain),
      watch,
      reset,
      h('div', { class: 'tabs', role: 'tablist' }, boardTab, liveTab)
    );
    bar._tabs = { board: boardTab, live: liveTab };
    bar._count = countEl;
    return bar;
  }

  // ---------------------------------------------------------------- board table

  function sortHead(key, label, extra) {
    var active = state.sort === key;
    var arrow = active ? h('span', { class: 'arrow', text: state.dir < 0 ? '▼' : '▲' }) : null;
    var th = h('th', { scope: 'col', class: extra }, h('button', { type: 'button', onClick: function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'rank' || key === 'name' ? 1 : -1; }
      update();
    } }, label, arrow));
    return th;
  }

  function chainText(r) {
    var ch = r.chains || [];
    if (ch.length === 0) return 'unnamed chain';
    if (ch.length <= 2) return ch.join(', ');
    return ch.slice(0, 2).join(', ') + ' +' + (ch.length - 2);
  }

  function rowEl(r, i) {
    var tr = h('tr', {
      class: state.selected === r.slug ? 'is-selected' : '',
      tabindex: '0',
      onClick: function () { openSheet(r.slug); },
      onKeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(r.slug); } }
    },
      h('td', { class: 'rank' + (r.rank <= 3 ? ' lead' : ''), text: String(r.rank) }),
      h('td', { class: 'proto' },
        h('div', { class: 'name' }, r.name, r.watchlist ? h('span', { class: 'chip watch', text: 'watchlist' }) : h('span', { class: 'chip early', text: 'early' })),
        h('div', { class: 'meta' }, (r.category || 'Other') + ' · ' + chainText(r))
      ),
      h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      h('td', { class: pctClass(r.change_7d), text: fmtPct(r.change_7d) }),
      h('td', { class: 'num age', text: fmtAge(r.age_days) }),
      h('td', null,
        h('div', { class: 'implied' },
          h('span', { class: 'value', text: fmtUsd(r.implied_value_usd) }),
          h('span', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / MAX) * 100)) + '%' }))
        )
      )
    );
    return tr;
  }

  function boardPanel() {
    var list = sorted(visibleRows());
    var panel = h('section', { class: 'panel' });
    panel.appendChild(h('div', { class: 'panel-head' },
      h('h2', { text: 'Pre-token board' }),
      h('span', { class: 'count', text: list.length + ' of ' + DATA.board_size + ' rows · ranked by implied value' })
    ));
    if (list.length === 0) {
      panel.appendChild(h('div', { class: 'empty' },
        h('strong', { text: 'No protocol matches those filters.' }),
        h('p', { text: 'Clear the search, the category and the chain to see the board again.' }),
        h('button', { class: 'button primary', type: 'button', text: 'Clear filters', onClick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; update();
        } })
      ));
      return panel;
    }
    var tbody = h('tbody');
    list.forEach(function (r, i) { tbody.appendChild(rowEl(r, i)); });
    panel.appendChild(h('div', { class: 'table-wrap' },
      h('table', null,
        h('caption', { class: 'visually-hidden', text: 'Pre-token protocols ranked by implied value' }),
        h('thead', null, h('tr', null,
          sortHead('rank', 'Rank'),
          sortHead('name', 'Protocol', 'proto'),
          sortHead('tvl', 'TVL'),
          sortHead('growth', '7-day'),
          sortHead('age', 'No token'),
          sortHead('implied', 'Implied value')
        )),
        tbody
      )
    ));
    return panel;
  }

  function livePanel() {
    var tbody = h('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(h('tr', { tabindex: '0' },
        h('td', { class: 'proto' },
          h('div', { class: 'name' }, r.name, h('span', { class: 'chip', text: 'trades' })),
          h('div', { class: 'meta' }, (r.category || 'Other') + ' · ' + chainText(r))
        ),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: pctClass(r.change_7d), text: fmtPct(r.change_7d) }),
        h('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        h('td', { class: 'num age', text: fmtAge(r.age_days) })
      ));
    });
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h2', { text: 'Live tokens — set aside' }),
        h('span', { class: 'count', text: DATA.live_size + ' protocols · market cap is a fact, not a model' })
      ),
      h('p', { class: 'live-note' }, 'These protocols', h('b', { text: ' already trade ' }), 'a token, so a market cap exists and no launch value is claimed for them. They stay out of the ranking; the board above never mixes the two.'),
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null,
            h('th', { scope: 'col', text: 'Protocol' }),
            h('th', { scope: 'col', text: 'TVL' }),
            h('th', { scope: 'col', text: '7-day' }),
            h('th', { scope: 'col', text: 'Market cap' }),
            h('th', { scope: 'col', text: 'Tracked' })
          )),
          tbody
        )
      )
    );
  }

  // ---------------------------------------------------------------- model panel

  function modelPanel() {
    var m = DATA.model;
    var mults = Object.keys(m.category_multiple).sort(function (a, b) { return m.category_multiple[b] - m.category_multiple[a]; });
    var top = mults.slice(0, 7);
    var rows = [h('div', { class: 'row term-head' }, h('span', { text: 'Category' }), h('b', { text: 'Multiple' }))];
    top.forEach(function (c) { rows.push(h('div', { class: 'row' }, h('span', { text: c }), h('b', { text: '×' + m.category_multiple[c].toFixed(2) }))); });
    rows.push(h('div', { class: 'row' }, h('span', { text: 'Other categories (default)' }), h('b', { text: '×' + m.default_multiple.toFixed(2) })));

    return h('section', { class: 'panel model' },
      h('div', null,
        h('h2', { text: 'How implied value is made' }),
        h('p', { text: 'One function scores every protocol. It reads only the snapshot: TVL, the seven-day change, and the days DefiLlama has tracked the protocol with no token on record. The category multiple is the single structural term — a DEX keeps a fee on every swap, a bridge keeps a thin route fee — and it is applied by the category the snapshot names, never by protocol name.' }),
        h('div', { class: 'formula' },
          'implied = round( ', h('b', { text: 'tvl_usd' }), ' × category_multiple × (1 + clamp(', h('b', { text: 'change_7d' }), ', ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + ')',
          h('br'),
          '          × (' + m.maturity_floor + ' + min(', h('b', { text: 'age_days' }), ', ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + ') × (1 + (min(chains, ' + m.reach_cap + ') − 1) × ' + m.reach_weight + ') )'
        ),
        h('p', { style: 'margin-top:12px', text: 'Growth is clamped to ±' + m.growth_floor + '/' + m.growth_cap + ' per cent so one week cannot decide the board. A protocol with no listed date takes a neutral maturity of 1.00. Values are rounded down by one dollar where two ranks would otherwise tie, so every rank is a distinct claim.' })
      ),
      h('div', null,
        h('div', { class: 'eyebrow', style: 'margin-bottom:8px', text: 'A dollar of TVL, by category' }),
        h('div', { class: 'coefs' }, rows),
        h('p', { style: 'margin-top:12px', text: 'The multipliers follow the business: fee-taking venues and credit desks at the top, commodity bridges and staking wrappers at the bottom. They are fixed constants of model ' + m.version + ', published here and applied identically to all ' + DATA.board_size + ' rows.' })
      )
    );
  }

  // ---------------------------------------------------------------- detail sheet

  var scrim;
  var sheet;

  function ensureSheet() {
    if (sheet) return;
    scrim = h('div', { class: 'scrim', onClick: function () { closeSheet(); } });
    sheet = h('aside', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Protocol detail' });
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);
  }

  function closeSheet() {
    state.selected = null;
    if (sheet) sheet.classList.remove('on');
    if (scrim) scrim.classList.remove('on');
    update();
  }

  function splitStep(text) {
    var at = text.lastIndexOf(' — costs ');
    if (at < 0) return { action: text, cost: '', time: '' };
    var action = text.slice(0, at);
    var rest = text.slice(at + 9);
    var takes = rest.lastIndexOf('; takes ');
    var cost = takes < 0 ? rest : rest.slice(0, takes);
    var time = takes < 0 ? '' : rest.slice(takes + 8).replace(/\.$/, '');
    return { action: action, cost: cost, time: time };
  }

  function openSheet(slug) {
    var r = DATA.rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    ensureSheet();
    state.selected = slug;
    sheet.textContent = '';
    sheet.scrollTop = 0;

    var chips = [h('span', { class: 'chip', text: r.category || 'Other' })];
    (r.chains || []).slice(0, 4).forEach(function (c) { chips.push(h('span', { class: 'chip', text: c })); });
    if ((r.chains || []).length > 4) chips.push(h('span', { class: 'chip', text: '+' + (r.chains.length - 4) }));
    chips.push(h('span', { class: r.watchlist ? 'chip watch' : 'chip early', text: r.watchlist ? 'on the watchlist' : 'early radar' }));

    sheet.appendChild(h('div', { class: 'sheet-head' },
      h('div', null,
        h('div', { class: 'eyebrow', text: 'Rank ' + r.rank + ' of ' + DATA.board_size + ' · pre-token' }),
        h('h2', { id: 'sheet-title', text: r.name }),
        h('div', { class: 'sub' }, chips)
      ),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close detail', text: '×', onClick: closeSheet })
    ));

    var months = r.age_days === null ? 'no listing date' : fmtAge(r.age_days) + ' without a token';
    var afterGrowth = Math.round(r.model.base_usd * r.model.growth_multiplier);
    var afterMaturity = Math.round(afterGrowth * r.model.maturity_multiplier);
    var body = h('div', { class: 'sheet-body' },
      h('div', { class: 'big-value' },
        h('div', null, h('div', { class: 'amount', text: fmtExact(r.implied_value_usd) }), h('div', { class: 'footnote', style: 'margin-top:6px', text: 'implied value if the record held at launch' })),
        h('div', { class: 'label' },
          h('div', null, h('span', { text: 'TVL' }), h('b', { text: fmtUsd(r.tvl_usd) })),
          h('div', null, h('span', { text: 'No token for' }), h('b', { text: r.age_days === null ? 'unlisted' : fmtAge(r.age_days) }))
        )
      ),
      h('div', null,
        h('div', { class: 'section-title' }, h('h3', { text: 'How the number is made' }), h('span', { text: 'model ' + DATA.model.version })),
        h('div', { class: 'terms' },
          h('div', { class: 'term term-head' }, h('span', { text: 'Input' }), h('b', { text: 'Value' }), h('i', { text: 'Factor' })),
          h('div', { class: 'term' }, h('span', { text: 'TVL × ' + (r.category || 'default') + ' multiple' }), h('b', { text: fmtUsd(r.model.base_usd) }), h('i', { text: '×' + r.model.base_multiple.toFixed(2) })),
          h('div', { class: 'term' }, h('span', { text: 'Seven-day TVL change ' + fmtPct(r.change_7d) }), h('b', { text: fmtUsd(afterGrowth) }), h('i', { text: '×' + r.model.growth_multiplier.toFixed(3) })),
          h('div', { class: 'term' }, h('span', { text: 'Time without a token' }), h('b', { text: fmtUsd(afterMaturity) }), h('i', { text: '×' + r.model.maturity_multiplier.toFixed(3) })),
          h('div', { class: 'term' }, h('span', { text: 'Chains the protocol runs on (' + r.chains.length + ')' }), h('b', { text: fmtUsd(r.implied_value_usd) }), h('i', { text: '×' + r.model.reach_multiplier.toFixed(3) })),
          h('div', { class: 'term total' }, h('span', { text: 'Implied value' }), h('b', { text: fmtExact(r.implied_value_usd) }), h('i', { text: 'rank ' + r.rank }))
        )
      ),
      h('div', null,
        h('div', { class: 'section-title' }, h('h3', { text: 'Farm plan' }), h('span', { text: r.farm_steps.length + ' steps · ' + fmtUsd(r.tvl_usd) + ' TVL' })),
        h('ol', { class: 'steps' }, r.farm_steps.map(function (text) {
          var s = splitStep(text);
          return h('li', null,
            h('div', null,
              h('div', { class: 'action', text: s.action }),
              h('div', { class: 'tags' },
                s.cost ? h('span', { class: 'tag' }, h('b', { text: 'cost' }), s.cost) : null,
                s.time ? h('span', { class: 'tag' }, h('b', { text: 'time' }), s.time) : null
              )
            )
          );
        }))
      ),
      h('p', { class: 'footnote' },
        'Why the plan fits: the steps follow the category the snapshot names (' + (r.category || 'none') + '), the chains it runs on, and its TVL. ' +
        'Capital and hold time scale with the protocol; gas follows the first chain’s fee market. Implied value is a model of a launch value, not a price and not a promise that a token is issued.'
      )
    );
    sheet.appendChild(body);
    sheet.setAttribute('aria-labelledby', 'sheet-title');
    sheet.classList.add('on');
    scrim.classList.add('on');
    update();
  }

  // ---------------------------------------------------------------- render

  var shellReady = false;

  function update() {
    if (!shellReady) {
      renderMast();
      app.textContent = '';
      app.appendChild(hero());
      app.appendChild(controls());
      tableSlot = h('div');
      app.appendChild(tableSlot);
      app.appendChild(modelPanel());
      app.setAttribute('aria-busy', 'false');
      shellReady = true;
    }
    var tabs = app.querySelector('.controls')._tabs;
    tabs.board.setAttribute('aria-selected', state.tab === 'board' ? 'true' : 'false');
    tabs.live.setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    tableSlot.textContent = '';
    tableSlot.appendChild(state.tab === 'board' ? boardPanel() : livePanel());
    var q = state.q.trim();
    app.querySelector('.controls')._count.textContent = state.tab === 'board' ? (q || state.category !== 'all' || state.chain !== 'all' || state.watchOnly ? 'filtered' : '') : '';
  }

  // A small interface so the page can be put in a named state for a screenshot without a click
  // sequence: set({q, category, chain, watchOnly, tab}) and open(slug).
  window.RADAR_UI = {
    set: function (next) {
      if (!next) return;
      if (typeof next.q === 'string') state.q = next.q;
      if (typeof next.category === 'string') state.category = next.category || 'all';
      if (typeof next.chain === 'string') state.chain = next.chain || 'all';
      if (typeof next.watchOnly === 'boolean') state.watchOnly = next.watchOnly;
      if (next.tab) state.tab = next.tab;
      var bar = app.querySelector('.controls');
      if (bar) {
        var input = bar.querySelector('input[type="search"]');
        if (input) input.value = state.q;
        var sels = bar.querySelectorAll('select');
        if (sels[0]) sels[0].value = state.category;
        if (sels[1]) sels[1].value = state.chain;
        var cb = bar.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = state.watchOnly;
      }
      update();
    },
    open: openSheet,
    close: closeSheet
  };

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet && sheet.classList.contains('on')) closeSheet();
  });

  update();
})();
