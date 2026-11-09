// The page of a share link: /s#<token>. Written by hand (not generated); the page itself is made by tools/build_web.py.
// The token is in the address FRAGMENT, which the browser never sends to a server, so it is in no log and no Referer.
// It is sent once, in the body of a POST, to the database function get_shared(), with the publishable key the app also
// embeds (not a secret). What comes back is drawn with textContent only: nothing the person wrote is ever parsed as HTML.
// No cookies, no storage, no analytics. Tested by tools/web-smoke/share-link.mjs.
(function () {
  'use strict';
  var root = document.getElementById('share');
  if (!root) return;
  var api = root.getAttribute('data-api');
  var key = root.getAttribute('data-key');
  var TOKEN = /^[A-Za-z0-9_-]{43}$/;
  var STATUS = { planned: 'Planned', in_progress: 'Walking', done: 'Walked', skipped: 'Skipped', rest: 'Rest day' };

  function tokenOf() {
    var h = (window.location.hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* keep it as it is */ }
    return h.trim();
  }

  function fill(node, name, text) {
    var els = node.querySelectorAll('[data-f="' + name + '"]');
    for (var i = 0; i < els.length; i++) els[i].textContent = text == null ? '' : String(text);
  }

  function from(id) {
    return document.getElementById(id).content.cloneNode(true);
  }

  function show(fragment, title) {
    root.textContent = '';
    root.appendChild(fragment);
    root.setAttribute('aria-busy', 'false');
    if (title) document.title = title + ' · CaminoPlus';
  }

  function text(v, max) {
    if (typeof v !== 'string') return '';
    v = v.trim();
    return v.length > max ? v.slice(0, max) : v;
  }

  function num(v) {
    var n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return isFinite(n) && n >= 0 ? n : null;
  }

  function km(n) {
    return (Math.round(n * 10) / 10).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + ' km';
  }

  // A plan date is a day without a time: shown as written, never shifted by the reader's time zone.
  function day(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
    var d = new Date(v + 'T00:00:00Z');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function when(v) {
    if (typeof v !== 'string') return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function li(textValue) {
    var el = document.createElement('li');
    el.textContent = textValue;
    return el;
  }

  function unavailable() {
    show(from('t-unavailable'), 'Link not available');
  }

  function failed() {
    var f = from('t-failed');
    show(f, 'Could not open the link');
    var b = root.querySelector('[data-retry]');
    if (b) b.addEventListener('click', load);
  }

  function plan(s) {
    var p = s.plan || {};
    var owner = text(s.owner && s.owner.display_name, 80) || 'A pilgrim';
    var f = from('t-plan');
    var route = text(p.route_name, 120) || 'A Camino plan';
    fill(f, 'route', route);
    fill(f, 'owner', owner);
    var days = Array.isArray(p.days) ? p.days.slice(0, 400) : [];
    var facts = f.querySelector('[data-f="facts"]');
    var start = day(p.start_date);
    if (start) facts.appendChild(li('Starts ' + start));
    facts.appendChild(li(days.length === 1 ? '1 day' : days.length + ' days'));
    var total = num(p.total_km);
    if (total !== null && total > 0) facts.appendChild(li(km(total)));
    var stays = p.stays_included === true;
    fill(f, 'shows', stays
      ? 'The route, the dates, where each day starts and ends, its distance, and the name of the place to sleep.'
      : 'The route, the dates, where each day starts and ends, and its distance.');
    var list = f.querySelector('[data-f="days"]');
    days.forEach(function (d) {
      if (!d || typeof d !== 'object') return;
      var row = from('t-day');
      var n = num(d.day_number);
      fill(row, 'n', n !== null ? 'Day ' + n : 'Day');
      fill(row, 'date', day(d.planned_date));
      var st = STATUS[d.status] || '';
      fill(row, 'status', st);
      if (!st) row.querySelector('[data-f="status"]').remove();
      var a = text(d.from_name, 120), b = text(d.to_name, 120);
      fill(row, 'way', a && b ? a + ' to ' + b : a || b || (d.status === 'rest' ? 'A day of rest' : 'Stage to be decided'));
      var meta = [];
      var dk = num(d.planned_distance_km);
      if (dk !== null && dk > 0) meta.push(km(dk));
      var stay = stays ? text(d.stay_name, 120) : '';
      if (stay) meta.push('Sleeps at ' + stay);
      fill(row, 'meta', meta.join(' · '));
      if (!meta.length) row.querySelector('[data-f="meta"]').remove();
      list.appendChild(row);
    });
    if (!days.length) list.appendChild(li('No days in this plan yet.'));
    show(f, route);
  }

  function note(s) {
    var n = s.note || {};
    var owner = text(s.owner && s.owner.display_name, 80) || 'A pilgrim';
    var f = from('t-note');
    var title = text(n.title, 200) || 'A note';
    fill(f, 'title', title);
    fill(f, 'owner', owner);
    var meta = [when(n.written_at), text(n.place, 200)].filter(Boolean);
    fill(f, 'meta', meta.join(' · '));
    if (!meta.length) f.querySelector('[data-f="meta"]').remove();
    var body = typeof n.body === 'string' ? n.body.slice(0, 20000) : '';
    fill(f, 'body', body);
    show(f, title);
  }

  function load() {
    root.setAttribute('aria-busy', 'true');
    var token = tokenOf();
    if (!TOKEN.test(token) || !api || !key) { unavailable(); return; }
    var req;
    try {
      req = fetch(api + '/rest/v1/rpc/get_shared', {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ p_token: token }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
    } catch (e) { failed(); return; }
    req.then(function (res) {
      if (!res.ok) {
        // 4xx: the database said no (a bad token is answered with null, so this is rare): the link is not available.
        if (res.status >= 400 && res.status < 500) { unavailable(); return null; }
        throw new Error('status ' + res.status);
      }
      return res.json().then(function (s) {
        if (!s || typeof s !== 'object') unavailable();
        else if (s.kind === 'plan' && s.plan && typeof s.plan === 'object') plan(s);
        else if (s.kind === 'note' && s.note && typeof s.note === 'object') note(s);
        else unavailable();
      });
    }).catch(failed);
  }

  window.addEventListener('hashchange', load);
  load();
})();
