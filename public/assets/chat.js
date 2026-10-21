/* Kit, the Caterkwik product expert: the chat panel, shared by the product
   page and the two ovens pages. Pacing and nudge rules are the ones from
   services/ea-demo: a humanised pause before the dots, a nudge only for an
   engaged visitor, and at most one panel-opening interruption per visit.

   A page configures him before this loads:
     window.CK_CHAT = { page: '6-burner', greeting: '...', nudge: '...' }
   `page` is sent with every message so the server can ground him in that
   page's data. Conversations are kept per page. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- chat ---------- */
  var CFG = window.CK_CHAT || {};
  var PAGE = CFG.page || 'product';
  var GREETING = CFG.greeting || "Hi, I'm Kit. Ask me anything about this range: the gas and phase question, what it takes to install, or what it costs to run.";
  var NUDGE = CFG.nudge || "Still weighing it up? The two things worth checking before you order are the gas supply, propane or mains, and whether the board has a spare 30A way. Ask me, or I'll get the team to call you.";
  var STORE = 'ck-demo-chat-' + PAGE, NUDGED = 'ck-demo-nudged', EXIT = 'ck-demo-exit', SID = 'ck-demo-sid';
  var DWELL = 60000, SCROLL_MIN = 20000, SCROLL_RATIO = 0.5;

  var msgs = [];      // {role, content} — greeting is client furniture, not sent
  var open = false, busy = false, unread = 0;

  function sess(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function setSess(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  // One id per browser session, so the transcripts view can group a
  // conversation instead of showing loose questions.
  function sessionId() {
    var id = sess(SID);
    if (id) return id;
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '')
      : String(Date.now()) + Math.random().toString(36).slice(2, 10);
    setSess(SID, id);
    return id;
  }

  function load() {
    try {
      var raw = sess(STORE);
      if (raw) msgs = JSON.parse(raw).filter(function (m) { return m && m.role && m.content; });
    } catch (e) { msgs = []; }
  }
  function save() { setSess(STORE, JSON.stringify(msgs.slice(-24))); }

  function bubble(role, text) {
    var d = document.createElement('div');
    d.className = 'msg ' + (role === 'user' ? 'me' : role === 'error' ? 'err' : 'bot');
    d.textContent = text;
    $('#log').appendChild(d);
    scrollLog();
    return d;
  }
  function scrollLog() { var l = $('#log'); l.scrollTop = l.scrollHeight; }

  function paintLog() {
    $('#log').innerHTML = '';
    bubble('assistant', GREETING);
    msgs.forEach(function (m) { bubble(m.role, m.content); });
    $('#suggest').style.display = msgs.some(function (m) { return m.role === 'user'; }) ? 'none' : 'flex';
  }

  function setUnread(n) { unread = n; $('#unread').hidden = n === 0; }

  function openChat() {
    open = true; setUnread(0); setSess(NUDGED, '1');
    $('#chat').classList.add('open');
    setTimeout(function () { $('#chat-input').focus(); scrollLog(); }, 60);
  }
  function closeChat() { open = false; $('#chat').classList.remove('open'); }

  $('#launch').addEventListener('click', function () { open ? closeChat() : openChat(); });
  $('#chat-close').addEventListener('click', closeChat);
  $$('[data-open-chat]').forEach(function (b) { b.addEventListener('click', openChat); });
  $$('#suggest button').forEach(function (b) {
    b.addEventListener('click', function () { send(b.textContent); });
  });
  $('#composer').addEventListener('submit', function (e) { e.preventDefault(); send(); });

  var pauseMs = function () { return 1000 + Math.random() * 2000; };
  var holdMs = function (t) { return Math.min(1500 + t.length * 30, 5000); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function dots() {
    var d = document.createElement('div');
    d.className = 'msg bot';
    d.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    $('#log').appendChild(d); scrollLog();
    return d;
  }

  async function ask(history) {
    var res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, sessionId: sessionId(), page: PAGE })
    });
    if (!res.ok || !res.body) {
      if (res.status === 401) return { error: 'The preview session has expired. Reload the page to sign back in.' };
      var j = null; try { j = await res.json(); } catch (e) {}
      return { error: (j && j.error) || 'I could not reach the server just now. Please call 01229 480001.' };
    }
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', text = '', err = null;
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      var parts = buf.split('\n\n'); buf = parts.pop();
      for (var i = 0; i < parts.length; i++) {
        var line = parts[i].replace(/^data: /, '').trim();
        if (!line) continue;
        try {
          var ev = JSON.parse(line);
          if (ev.type === 'delta') text += ev.text;
          else if (ev.type === 'error') err = ev.error;
        } catch (e) {}
      }
    }
    return err && !text ? { error: err } : { text: text.trim() };
  }

  async function send(preset) {
    var text = (preset || $('#chat-input').value).trim();
    if (!text || busy) return;
    busy = true; $('#chat-send').disabled = true;
    if (!preset) $('#chat-input').value = '';
    $('#suggest').style.display = 'none';

    msgs.push({ role: 'user', content: text }); save();
    bubble('user', text);

    var started = Date.now(), pause = pauseMs();
    var request = ask(msgs.slice(-16));

    await sleep(pause);
    var typing = dots();
    var out = await request;
    var reply = out.text || '';
    if (reply) await sleep(Math.max(0, started + pause + holdMs(reply) - Date.now()));
    typing.remove();

    if (out.error && !reply) {
      bubble('error', out.error);
    } else {
      msgs.push({ role: 'assistant', content: reply }); save();
      bubble('assistant', reply);
      if (!open) setUnread(unread + 1);
    }
    busy = false; $('#chat-send').disabled = false;
    if (open) $('#chat-input').focus();
  }

  function nudge() {
    if (sess(NUDGED) || msgs.length) return;
    setSess(NUDGED, '1');
    msgs.push({ role: 'assistant', content: NUDGE }); save();
    if (open) bubble('assistant', NUDGE); else setUnread(unread + 1);
  }
  var landed = Date.now();
  setTimeout(nudge, DWELL);
  window.addEventListener('scroll', function () {
    if (Date.now() - landed < SCROLL_MIN) return;
    var ratio = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
    if (ratio > SCROLL_RATIO) nudge();
  }, { passive: true });

  document.addEventListener('mouseout', function (e) {
    if (open || sess(EXIT) || e.relatedTarget || e.clientY > 12) return;
    if (window.innerWidth < 900) return;
    setSess(EXIT, '1');
    nudge();
    openChat();
  });


  // A page can hand Kit a question: the hub finder's "ask Kit" and the
  // category verdict's do. Opens the panel, types it, sends it.
  window.CK_CHAT_API = {
    ask: function (text) {
      openChat();
      var inp = $('#chat-input'); inp.value = text;
      $('#composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    },
  };

  /* ---------- go ---------- */
  load(); paintLog(); setUnread(0);
})();
