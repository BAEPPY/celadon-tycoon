/* Live board for PowerPoint versions that show add-ins with Internet Explorer 11 (Office 2016/2019 without
   Microsoft 365). The site's own board needs a current browser engine, so this small board reads the same anonymous
   results and draws them with plain elements; 3D models are replaced by pictures taken every 15 degrees that turn when
   dragged. Written in ES5 on purpose and checked by tests/legacy-board.test.js: no let/const, arrow functions,
   template strings, Promise, fetch, URL or newer array and string helpers. */
(function () {
  'use strict';
  var LOCAL_KEY = 'celadon-ppt-addin-v1';
  var PANELS = ['follow', 'comparison', 'beauty', 'uses', 'works', 'game', 'model'];
  var PANEL_LABELS = {follow: '지금 활동 따라가기', comparison: '세 나라 비교 결과', beauty: '매병·아름다움', uses: '이름·쓰임 짐작', works: '완성작 모음', game: '청자 만들기 게임', model: '청자 돌려 보기'};
  var MODELS = ['beauty', 'comparison-1', 'comparison-2', 'comparison-3', 'observation-1', 'observation-2', 'observation-3', 'observation-4', 'observation-5'];
  var MODEL_LABELS = {'beauty': '청자 상감 운학문 매병 (아름다움 찾기)', 'comparison-1': '세 나라 비교 · 청자 1', 'comparison-2': '세 나라 비교 · 청자 2', 'comparison-3': '세 나라 비교 · 청자 3',
    'observation-1': '쓰임 짐작 · 청자 1', 'observation-2': '쓰임 짐작 · 청자 2', 'observation-3': '쓰임 짐작 · 청자 3', 'observation-4': '쓰임 짐작 · 청자 4', 'observation-5': '쓰임 짐작 · 청자 5'};
  var COUNTRIES = [{id: 'yuan', label: '원'}, {id: 'goryeo', label: '고려'}, {id: 'japan', label: '일본'}];
  var ACTIVITY_NAMES = {1: '세 나라 도자기 비교', 2: '쓰임과 이름 짐작하기', 3: '좋은 청자 위대한 청자'};
  var BEAUTY_NAME = '고려청자의 아름다움 찾기', BEAUTY_LABEL = '청자 상감 운학문 매병';
  var COMPARISON_IDS = ['1', '2', '3'], OBSERVATION_IDS = ['1', '2', '3', '4', '5'];
  var FRAMES = 24, COLUMNS = 6, ROWS = 4, POLL_MS = 3000;
  var WEBP_PROBE = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

  var office = false, editing = true, coverLifted = false, root = null, head = null, body = null;
  var data = null, receivedAt = 0, waiting = false, problem = '', connected = false, pollTimer = null, polling = false, lastRefresh = null, lastCode = '';
  var view = {object: '1', kind: 'name', exhibit: {1: false, 2: false}, exhibitObject: {1: '1', 2: '1'}, auto: true, setup: false};
  var turnFrames = {}, turnTimer = null, autoModel = 'beauty', lastBody = '', revealBusy = false;
  var canWebp = null, pictures = {}, picturePending = {};
  // Real 3D (legacy-3d.js) when this engine's WebGL works; the turning pictures otherwise.
  var threeD = null, VENDOR = '/ppt-addin/vendor/';

  // ---------- small helpers ----------
  function has(list, value) { for (var i = 0; i < list.length; i++) if (list[i] === value) return true; return false; }
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function number(value) { var n = Number(value); return isFinite(n) ? n : 0; }
  function find(list, test) { for (var i = 0; i < (list ? list.length : 0); i++) if (test(list[i])) return list[i]; return null; }
  function actionOf(node) {
    while (node && node !== root) { if (node.getAttribute && node.getAttribute('data-act')) return node; node = node.parentNode; }
    return null;
  }
  function localRead() { try { return JSON.parse(window.localStorage.getItem(LOCAL_KEY) || 'null') || {}; } catch (e) { return {}; } }
  function localWrite(values) {
    try { var all = localRead(); for (var key in values) if (Object.prototype.hasOwnProperty.call(values, key)) all[key] = values[key]; window.localStorage.setItem(LOCAL_KEY, JSON.stringify(all)); } catch (e) {}
  }
  function origin() { return window.location.protocol + '//' + window.location.host; }
  function queryValue(query, name) {
    var parts = String(query || '').split('&');
    for (var i = 0; i < parts.length; i++) {
      var at = parts[i].indexOf('='), key = at < 0 ? parts[i] : parts[i].slice(0, at);
      if (key === name) { try { return decodeURIComponent((at < 0 ? '' : parts[i].slice(at + 1)).replace(/\+/g, ' ')); } catch (e) { return ''; } }
    }
    return '';
  }
  // "PPT용 주소" or "참관 주소": https://site/observe?code=탑텐반#key=...
  function parseLink(text) {
    var match = /^(https?:\/\/[^\/?#]+)\/observe\?([^#]*)(?:#(.*))?$/.exec(String(text || '').replace(/^\s+|\s+$/g, ''));
    if (!match || match[1].toLowerCase() !== origin().toLowerCase()) return null;
    var code = queryValue(match[2], 'code'), key = queryValue(match[3], 'key') || queryValue(match[2], 'key');
    if (code.normalize) code = code.normalize('NFKC');
    code = code.replace(/^\s+|\s+$/g, '').toUpperCase();
    if (!/^(?:탑텐반|[A-Z2-9]{6})$/.test(code) || !/^[A-Za-z0-9_-]{30,100}$/.test(key)) return null;
    return {code: code, key: key};
  }

  // ---------- what this box shows (kept in the presentation; the link also on this computer) ----------
  function saved() {
    var mine = localRead(), doc = null;
    if (office) { try { doc = window.Office.context.document.settings; } catch (e) { doc = null; } }
    var panel = (doc ? doc.get('panel') : mine.panel) || null, link = (doc && doc.get('link')) || mine.link || null, model = (doc ? doc.get('model') : mine.model) || 'beauty';
    return {panel: has(PANELS, panel) ? panel : null, link: parseLink(link) ? link : null, model: has(MODELS, model) ? model : 'beauty', cover: !!(doc ? doc.get('cover') : mine.cover)};
  }
  function save(panel, link, model, cover, done) {
    var values = office ? {} : {panel: panel, model: model, cover: cover};
    if (link) values.link = link;
    localWrite(values);
    if (!office) return done();
    try {
      var settings = window.Office.context.document.settings;
      settings.set('panel', panel); settings.set('model', model); settings.set('cover', cover); if (link) settings.set('link', link);
      settings.saveAsync(function () { done(); });
    } catch (e) { done(); }
  }
  function needsLink(panel) { return panel !== 'game' && panel !== 'model'; }

  // ---------- reading the class ----------
  function request(method, query, payload, key, done, path) {
    var xhr = new XMLHttpRequest(), finished = false;
    function finish(status, value) { if (!finished) { finished = true; done(status, value); } }
    xhr.open(method, (path || '/api/classroom') + (query ? '?' + query : ''), true);
    if (key) xhr.setRequestHeader('Authorization', 'Bearer ' + key);
    if (payload) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var value = null; try { value = JSON.parse(xhr.responseText); } catch (e) { value = null; }
      finish(xhr.status, value);
    };
    xhr.onerror = function () { finish(0, null); };
    try { xhr.timeout = 15000; xhr.ontimeout = function () { finish(0, null); }; } catch (e) {}
    xhr.send(payload ? JSON.stringify(payload) : null);
  }
  function schedule(delay) { if (pollTimer) clearTimeout(pollTimer); pollTimer = setTimeout(poll, delay === undefined ? POLL_MS : delay); }
  function poll() {
    var now = saved(), link = now.link && parseLink(now.link);
    if (view.setup || !now.panel || !needsLink(now.panel) || !link) return;
    if (polling) return schedule();
    polling = true;
    // Internet Explorer keeps GET answers; the time makes every request new.
    request('GET', 'action=observe&code=' + encodeURIComponent(link.code) + '&_=' + new Date().getTime(), null, link.key, function (status, value) {
      polling = false;
      if (status === 200 && value && value.state) {
        if (lastCode === value.state.code && lastRefresh !== null && number(value.state.boardRefresh) !== lastRefresh) { window.location.reload(); return; }
        lastCode = value.state.code; lastRefresh = number(value.state.boardRefresh);
        data = value; receivedAt = new Date().getTime(); waiting = false; problem = ''; connected = true;
      } else if (status === 409 && value && value.code === 'observer-waiting') {
        data = null; waiting = true; problem = ''; connected = true; lastRefresh = null;
      } else if (status === 403 || status === 404) {
        data = null; waiting = false; connected = false; problem = (value && value.error) || 'PPT용 주소가 바뀌었어요. 선생님 화면에서 새 주소를 복사해 ‘화면 바꾸기’에 넣어 주세요.';
      } else connected = false;
      render(); schedule();
    });
  }

  // ---------- pictures that turn ----------
  function showFrame(node, frame) {
    frame = ((Math.round(frame) % FRAMES) + FRAMES) % FRAMES;
    node.style.backgroundPosition = (frame % COLUMNS) * (100 / (COLUMNS - 1)) + '% ' + Math.floor(frame / COLUMNS) * (100 / (ROWS - 1)) + '%';
    node.setAttribute('data-frame', String(frame));
    return frame;
  }
  function setFrame(id, frame) {
    var nodes = root.querySelectorAll('.lg-turn');
    frame = ((Math.round(frame) % FRAMES) + FRAMES) % FRAMES; turnFrames[id] = frame;
    for (var i = 0; i < nodes.length; i++) if (nodes[i].getAttribute('data-model') === id) showFrame(nodes[i], frame);
  }
  function turnMarkup(id, size, keys) {
    return '<div class="lg-turn-box" style="width:' + size + 'vh"><div class="lg-turn" data-model="' + esc(id) + '" role="img" aria-label="돌려 볼 수 있는 청자 사진"></div></div>' +
      (keys === false ? '' : '<div class="lg-turn-keys"><button type="button" data-act="turn" data-model="' + esc(id) + '" data-step="2" aria-label="왼쪽으로 돌리기">↶</button><button type="button" data-act="turn" data-model="' + esc(id) + '" data-step="-2" aria-label="오른쪽으로 돌리기">↷</button>' + zoomKeys(id) + '</div>');
  }
  // 확대·축소·처음 시점 exist only while the model is really drawn in 3D.
  function zoomKeys(id) {
    if (!threeD || !threeD.shown(id)) return '';
    return '<button type="button" data-act="zoom" data-model="' + esc(id) + '" data-factor="1.25" aria-label="확대">＋</button><button type="button" data-act="zoom" data-model="' + esc(id) + '" data-factor="0.8" aria-label="축소">－</button>' +
      '<button type="button" data-act="reset-view" data-model="' + esc(id) + '">처음 시점</button>';
  }
  function mountTurns() {
    var nodes = root.querySelectorAll('.lg-turn');
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-model'), solid = !!threeD && threeD.usable() && threeD.mount(nodes[i], id);
      // The pictures stay underneath until the 3D model has been drawn (and for good where 3D does not work).
      if (!solid || !threeD.shown(id)) { nodes[i].style.backgroundImage = 'url(/assets/lesson/turntable/' + id + '.jpg)'; showFrame(nodes[i], turnFrames[id] || 0); }
    }
    if (threeD) threeD.sweep();
  }
  var drag = null;
  function dragStart(node, x) { view.auto = false; drag = {id: node.getAttribute('data-model'), x: x, frame: turnFrames[node.getAttribute('data-model')] || 0, width: node.offsetWidth || 200}; syncAuto(); }
  function dragMove(x) { if (drag) setFrame(drag.id, drag.frame - (x - drag.x) / (drag.width / 12)); }
  function dragEnd() { drag = null; }
  function turnTarget(event) { var node = event.target || event.srcElement; return node && node.className && String(node.className).indexOf('lg-turn') === 0 && node.getAttribute('data-model') ? node : null; }
  function watchDragging() {
    if (window.PointerEvent) {
      root.addEventListener('pointerdown', function (event) { var node = turnTarget(event); if (node) { dragStart(node, event.clientX); event.preventDefault(); } });
      document.addEventListener('pointermove', function (event) { dragMove(event.clientX); });
      document.addEventListener('pointerup', dragEnd); document.addEventListener('pointercancel', dragEnd);
      return;
    }
    root.addEventListener('mousedown', function (event) { var node = turnTarget(event); if (node) { dragStart(node, event.clientX); event.preventDefault(); } });
    document.addEventListener('mousemove', function (event) { dragMove(event.clientX); });
    document.addEventListener('mouseup', dragEnd);
    root.addEventListener('touchstart', function (event) { var node = turnTarget(event); if (node && event.touches.length === 1) dragStart(node, event.touches[0].clientX); });
    root.addEventListener('touchmove', function (event) { if (drag && event.touches.length === 1) { dragMove(event.touches[0].clientX); event.preventDefault(); } });
    root.addEventListener('touchend', dragEnd);
  }
  // Only the "청자 돌려 보기" box turns by itself, until someone drags it or presses 멈추기.
  function syncAuto() {
    var now = saved(), wanted = !view.setup && now.panel === 'model' && view.auto, solid = !!threeD && threeD.shown(now.model);
    autoModel = now.model;
    if (threeD) threeD.auto(wanted && solid ? now.model : null);
    if (wanted && !solid && !turnTimer) turnTimer = setInterval(function () { if (!drag) setFrame(autoModel, (turnFrames[autoModel] || 0) + 1); }, 160);
    if ((!wanted || solid) && turnTimer) { clearInterval(turnTimer); turnTimer = null; }
    var button = root.querySelector('[data-act=auto]');
    if (button) button.innerHTML = view.auto ? '■ 멈추기' : '▶ 천천히 돌리기';
  }

  // ---------- real 3D, when the engine can ----------
  function webglLikely() {
    try { var canvas = document.createElement('canvas'); return !!window.WebGLRenderingContext && !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl')); } catch (e) { return false; }
  }
  function loadScripts(list, done) {
    if (!list.length) return done(true);
    var script = document.createElement('script'), finished = false;
    function next(ok) { if (finished) return; finished = true; if (ok) loadScripts(list.slice(1), done); else done(false); }
    script.charset = 'utf-8'; script.src = list[0];
    script.onload = function () { next(true); }; script.onerror = function () { next(false); };
    document.getElementsByTagName('head')[0].appendChild(script);
  }
  function loadThree() {
    if (localRead().three === false || !webglLikely()) return;
    var list = (window.Promise ? [] : [VENDOR + 'promise-polyfill.min.js']).concat([VENDOR + 'three-r116.min.js', VENDOR + 'GLTFLoader-r116.js', '/ppt-addin/legacy-3d.js']);
    loadScripts(list, function (ok) {
      if (!ok || !window.__legacy3d || !window.__legacy3d.usable()) return;
      threeD = window.__legacy3d;
      // A model became visible in 3D, or 3D turned out not to work: draw the boxes again either way.
      threeD.onChange = function () { lastBody = ''; render(); };
      threeD.onHold = function () { if (view.auto) { view.auto = false; syncAuto(); } };
      lastBody = ''; render();
    });
  }

  // ---------- finished works' pictures ----------
  function pictureKey(work) { return [work.participantId, work.id, work.submittedAt || 0].join(':'); }
  function loadPictures() {
    var link = saved().link && parseLink(saved().link), works = (data && data.works) || [];
    if (!link || canWebp === null) return;
    for (var i = 0; i < works.length; i++) (function (work) {
      var key = pictureKey(work);
      if (pictures[key] !== undefined || picturePending[key]) return;
      picturePending[key] = true;
      // The pictures are stored as WebP. An engine that cannot draw WebP asks the server for the same picture as
      // JPEG (api/work-picture.js); the others take the stored picture from the classroom API.
      var query = 'code=' + encodeURIComponent(link.code) + '&participantId=' + encodeURIComponent(work.participantId) + '&workId=' + encodeURIComponent(work.id) + '&_=' + new Date().getTime();
      request('GET', canWebp ? 'action=artwork&' + query : query, null, link.key, function (status, value) {
        delete picturePending[key];
        var preview = status === 200 && value && typeof value.preview === 'string' ? value.preview : '';
        // If the server could not convert it the work keeps its text card. A work that is gone is not asked for again.
        if (status === 200 || status === 404) pictures[key] = /^data:image\/(png|jpeg);base64,/.test(preview) || (canWebp && /^data:image\/webp;base64,/.test(preview)) ? preview : '';
        render();
      }, canWebp ? '' : '/api/work-picture');
    })(works[i]);
  }

  // ---------- drawing ----------
  function panelNow() {
    var panel = saved().panel;
    if (panel !== 'follow') return panel;
    var state = data && data.state;
    if (!state) return 'comparison';
    if (state.activity === 3) return 'works';
    if (state.activity === 2) return 'uses';
    return state.activity === 1 && state.activity1Stage === 'beauty' ? 'beauty' : 'comparison';
  }
  function activityOf(panel) { return panel === 'works' ? 3 : panel === 'uses' ? 2 : 1; }
  function cloud(words, empty) {
    if (!words || !words.length) return '<p class="lg-empty">' + esc(empty || '아직 모인 생각이 없어요.') + '</p>';
    var most = 1, html = '', i;
    for (i = 0; i < words.length; i++) most = Math.max(most, number(words[i].count));
    for (i = 0; i < words.length && i < 40; i++) {
      var count = number(words[i].count), size = 0.95 + 1.5 * (most > 1 ? (count - 1) / (most - 1) : 0);
      html += '<span class="lg-word" style="font-size:' + size.toFixed(2) + 'rem">' + esc(words[i].text) + (count > 1 ? '<small>' + count + '명</small>' : '') + '</span>';
    }
    return '<div class="lg-cloud">' + html + '</div>';
  }
  function resultTabs(activity) {
    var state = data && data.state, revealed = !!(state && state.revealed && state.revealed[activity]);
    var running = !!state && state.activity === activity && state.status === 'active';
    var canReveal = !!data && data.presenter === true && !revealed && !!(state.runs && state.runs[activity]) && !running;
    var note = revealed || canReveal ? '' : data && data.presenter === true ? (running ? '활동을 마치면 열 수 있어요' : '활동을 진행한 뒤 열 수 있어요') : '선생님이 정답을 공개하면 열려요';
    var showing = revealed && view.exhibit[activity];
    return '<div class="lg-bar"><button type="button" data-act="responses" data-activity="' + activity + '"' + (showing ? '' : ' class="lg-on"') + '>학생 응답 보기</button>' +
      '<button type="button" data-act="exhibit" data-activity="' + activity + '"' + (showing ? ' class="lg-on"' : '') + (revealed || canReveal ? '' : ' disabled') + '>청자 설명 보기</button>' + (note ? '<span>' + note + '</span>' : '') + '</div>';
  }
  function exhibit(activity) {
    var ids = activity === 1 ? COMPARISON_IDS : OBSERVATION_IDS, id = has(ids, view.exhibitObject[activity]) ? view.exhibitObject[activity] : ids[0], index = 0, i;
    for (i = 0; i < ids.length; i++) if (ids[i] === id) index = i;
    var group = data.reveal && data.reveal[activity === 1 ? 'comparison' : 'observations'], answer = group && group[id];
    if (!answer) return '<p class="lg-empty">청자 설명을 불러오고 있어요.</p>';
    var pages = '';
    for (i = 0; i < ids.length; i++) pages += '<button type="button" data-act="exhibit-object" data-activity="' + activity + '" data-id="' + ids[i] + '"' + (ids[i] === id ? ' class="lg-on"' : '') + '>' + ids[i] + '</button>';
    return '<div class="lg-colwrap"><div class="lg-cols"><div class="lg-col lg-wide"><span class="lg-label">청자 ' + esc(id) + ' · 함께 살펴보기</span>' + turnMarkup((activity === 1 ? 'comparison-' : 'observation-') + id, 54) + '</div>' +
      '<div class="lg-col"><div class="lg-meta">' + (answer.countryLabel ? '<span>' + esc(answer.countryLabel) + '</span>' : '') + (answer.date && answer.date !== answer.countryLabel ? '<span>' + esc(answer.date) + '</span>' : '') + '</div>' +
      '<h2 class="lg-exhibit-name">' + esc(answer.name) + '</h2>' + (answer.use ? '<p class="lg-exhibit-text"><b>쓰임</b>' + esc(answer.use) + '</p>' : '') + '<p class="lg-exhibit-text">' + esc(answer.note || '') + '</p>' +
      '<div class="lg-tabs"><button type="button" data-act="exhibit-object" data-activity="' + activity + '" data-id="' + ids[Math.max(0, index - 1)] + '"' + (index === 0 ? ' disabled' : '') + '>← 이전</button>' + pages +
      '<button type="button" data-act="exhibit-object" data-activity="' + activity + '" data-id="' + ids[Math.min(ids.length - 1, index + 1)] + '"' + (index === ids.length - 1 ? ' disabled' : '') + '>다음 →</button></div></div></div></div>';
  }
  function comparisonPanel() {
    var html = resultTabs(1), state = data && data.state;
    if (state && state.revealed && state.revealed[1] && view.exhibit[1]) return html + exhibit(1);
    html += '<div class="lg-colwrap"><div class="lg-cols">';
    for (var i = 0; i < COMPARISON_IDS.length; i++) {
      var id = COMPARISON_IDS[i], item = find(data && data.comparison, function (entry) { return String(entry.id) === id; }) || {respondents: 0, unanswered: 0, choices: []};
      html += '<div class="lg-col" data-comparison="' + id + '"><h2>청자 ' + id + '<span class="lg-count">' + number(item.respondents) + '명 응답</span></h2>' + turnMarkup('comparison-' + id, 30);
      for (var c = 0; c < COUNTRIES.length; c++) {
        var country = COUNTRIES[c], choice = find(item.choices, function (entry) { return entry.country === country.id; }) || {count: 0, percent: 0};
        var percent = Math.min(100, Math.max(0, number(choice.percent)));
        html += '<div class="lg-row" data-country="' + country.id + '"><div class="lg-row-text"><b>' + number(choice.percent) + '%</b>' + esc(country.label) + '<small>' + number(choice.count) + '명</small></div>' +
          '<div class="lg-track"><div class="lg-fill lg-' + country.id + '" style="width:' + percent + '%"></div></div></div>';
      }
      html += '<p class="lg-small">아직 고르지 않은 학생 ' + number(item.unanswered) + '명</p></div>';
    }
    return html + '</div></div>';
  }
  function beautyPanel() {
    var item = (data && data.beauty) || {words: [], respondents: 0};
    return '<div class="lg-colwrap"><div class="lg-cols"><div class="lg-col lg-side lg-center"><span class="lg-label">아름다움 찾아보기</span><h2>' + BEAUTY_LABEL + '</h2>' + turnMarkup('beauty', 46) + '<p class="lg-small">빛깔은 어떤가요? 무늬는 어떤가요?</p></div>' +
      '<div class="lg-col"><h2>우리가 찾은 아름다움<span class="lg-count">' + number(item.respondents) + '명 응답</span></h2><p class="lg-question">고려청자에서는 어떤 아름다움을 찾을 수 있나요?</p>' + cloud(item.words) +
      '<p class="lg-small">많이 나온 생각은 크게, 적게 나온 생각은 작게 보여요. 이름 없이 모아요.</p></div></div></div>';
  }
  function usesPanel() {
    var html = resultTabs(2), state = data && data.state;
    if (state && state.revealed && state.revealed[2] && view.exhibit[2]) return html + exhibit(2);
    var id = has(OBSERVATION_IDS, view.object) ? view.object : '1', item = find(data && data.observations, function (entry) { return String(entry.id) === id; }) || {responses: [], nameWords: [], useWords: []};
    var tabs = '';
    for (var i = 0; i < OBSERVATION_IDS.length; i++) tabs += '<button type="button" data-act="object" data-id="' + OBSERVATION_IDS[i] + '"' + (OBSERVATION_IDS[i] === id ? ' class="lg-on"' : '') + ' aria-label="청자 ' + OBSERVATION_IDS[i] + ' 응답 보기">' + OBSERVATION_IDS[i] + '</button>';
    return html + '<div class="lg-colwrap"><div class="lg-cols"><div class="lg-col lg-side lg-center"><span class="lg-label">관찰할 청자</span><h2>청자 ' + id + ' <small>(' + id + ' / 5)</small></h2>' + turnMarkup('observation-' + id, 40) + '<div class="lg-tabs">' + tabs + '</div></div>' +
      '<div class="lg-col"><div class="lg-bar"><button type="button" data-act="kind" data-kind="name"' + (view.kind === 'name' ? ' class="lg-on"' : '') + '>예상한 이름</button><button type="button" data-act="kind" data-kind="use"' + (view.kind === 'use' ? ' class="lg-on"' : '') + '>예상한 쓰임</button>' +
      '<span>' + (item.responses ? item.responses.length : 0) + '개 생각</span></div><p class="lg-question">' + (view.kind === 'name' ? '어떤 이름을 붙였나요?' : '어디에 썼을까요?') + '</p>' + cloud(view.kind === 'name' ? item.nameWords : item.useWords) +
      '<p class="lg-small">많이 나온 생각은 크게, 적게 나온 생각은 작게 보여요. 이름 없이 모아요.</p></div></div></div>';
  }
  function score(work) { return number(work.score && typeof work.score === 'object' ? work.score.total : work.score); }
  function worksPanel() {
    var works = ((data && data.works) || []).slice(0);
    works.sort(function (a, b) { return score(b) - score(a) || number(a.submittedAt) - number(b.submittedAt); });
    if (!works.length) return '<p class="lg-empty"><b>손님의 주문에 맞는 청자를 만들어요.</b><br>학생들이 완성한 청자와 설명이 이곳에 모입니다.</p>';
    var html = '<h2>완성한 청자 <span class="lg-count">' + works.length + '점</span></h2><div class="lg-works">';
    for (var i = 0; i < works.length; i++) {
      var work = works[i], picture = pictures[pictureKey(work)];
      html += '<div class="lg-work" data-work="' + esc(work.id) + '"><div class="lg-work-inner"><div class="lg-work-picture">' +
        (picture ? '<img src="' + esc(picture) + '" alt="학생이 완성한 청자">' : '<span>' + (picture === '' ? '그림을 불러오지 못했어요. 인터넷 창의 선생님 화면에서 볼 수 있어요' : '완성한 청자를 불러오고 있어요') + '</span>') +
        '<b class="lg-score">' + score(work) + '점</b></div><h2>' + esc(work.title || '나의 청자') + '</h2><p>' + esc(work.explanationUse || '') + '</p></div></div>';
    }
    return html + '</div>';
  }
  function modelPanel() {
    var model = saved().model;
    return '<div class="lg-center">' + turnMarkup(model, 68, false) + '<p class="lg-model-name">' + esc(model === 'beauty' ? BEAUTY_LABEL : '청자 ' + model.split('-')[1]) + '</p>' +
      '<div class="lg-turn-keys"><button type="button" data-act="turn" data-model="' + model + '" data-step="2" aria-label="왼쪽으로 돌리기">↶</button><button type="button" data-act="auto">■ 멈추기</button>' +
      '<button type="button" data-act="turn" data-model="' + model + '" data-step="-2" aria-label="오른쪽으로 돌리기">↷</button>' + zoomKeys(model) + '</div>' +
      '<p class="lg-turn-hint">' + (threeD && threeD.shown(model) ? '청자를 끌어서 돌리고 기울여 보세요.' : '사진을 좌우로 끌어도 돌아가요.') + '</p></div>';
  }
  // The game needs a current browser engine, so it cannot run inside this box. The button opens it in a browser
  // window where this PowerPoint allows that; the address is shown too, for a hyperlink on the slide (Ctrl+K),
  // which always opens the computer's own browser.
  function gamePanel() {
    return '<div class="lg-empty"><b>청자 만들기 게임은 이 PowerPoint 상자 안에서는 열 수 없어요.</b><br>게임은 최신 인터넷 창에서만 돌아가요. 아래 버튼을 누르거나, 슬라이드의 글자·도형에 하이퍼링크(Ctrl+K)로 이 주소를 넣어 여세요.<br>' +
      '<input type="text" readonly class="lg-address" value="' + esc(origin() + '/game') + '" aria-label="청자 만들기 게임 주소"><br>' +
      '<a class="lg-open" data-act="open-game" href="/game" target="_blank" rel="noopener">청자 만들기 게임 열기 →</a></div>';
  }
  function remaining() {
    var state = data && data.state;
    if (!state || state.status !== 'active' || typeof state.endsAt !== 'number' || !isFinite(state.endsAt)) return '';
    var seconds = Math.max(0, Math.ceil((state.endsAt - (number(state.serverNow) + (new Date().getTime() - receivedAt))) / 1000));
    return Math.floor(seconds / 60) + ':' + (seconds % 60 < 10 ? '0' : '') + seconds % 60;
  }
  function headMarkup(panel) {
    var buttons = '<span class="lg-head-right">' + (needsLink(panel) ? '<span class="lg-pill' + (connected ? '' : ' lg-bad') + '" data-connection>' + (connected ? '연결됨' : '연결 중…') + '</span><button type="button" data-act="reload" aria-label="이 화면 새로고침" title="이 화면 새로고침">↻</button>' : '') +
      (editing ? '<button type="button" data-act="setup">화면 바꾸기</button>' : '') + '</span>';
    if (!needsLink(panel)) return '<span class="lg-head-cell lg-title"><b>' + PANEL_LABELS[panel] + '</b></span>' + buttons;
    var state = data && data.state, activity = activityOf(panel), status = state ? state.status : '';
    var live = !!state && state.activity === activity && status === 'active' && (activity !== 1 || (state.activity1Stage === 'beauty') === (panel === 'beauty'));
    var label = !state ? '수업 전' : live ? '진행 중' : status === 'ended' ? '수업 끝' : state.activity === activity && status === 'paused' ? '활동을 마쳤어요' : '준비 중';
    var done = panel === 'works' ? ((data && data.works) || []).length : panel === 'beauty' ? number(data && data.beauty && data.beauty.respondents) : number(data && data.completionCounts && data.completionCounts[activity]);
    var time = remaining();
    return '<span class="lg-head-cell lg-title">활동 ' + activity + ' · ' + label + '<b>' + esc(panel === 'beauty' ? BEAUTY_NAME : ACTIVITY_NAMES[activity]) + '</b></span>' +
      '<span class="lg-head-cell">참여 <b>' + number(data && data.participantCount) + '</b>명</span><span class="lg-head-cell">' + (panel === 'works' ? '완성작' : '모두 작성') + ' <b>' + done + '</b>' + (panel === 'works' ? '점' : '명') + '</span>' +
      '<span class="lg-head-cell lg-timer" data-timer>' + (time ? '남은 시간 <b>' + time + '</b>' : '') + '</span>' + buttons;
  }
  function setupMarkup(message) {
    var now = saved(), panel = now.panel || 'follow', choices = '', options = '', i;
    for (i = 0; i < PANELS.length; i++) choices += '<label class="lg-choice"><input type="radio" name="lg-panel" value="' + PANELS[i] + '"' + (PANELS[i] === panel ? ' checked' : '') + '> ' + PANEL_LABELS[PANELS[i]] + '</label>';
    for (i = 0; i < MODELS.length; i++) options += '<option value="' + MODELS[i] + '"' + (MODELS[i] === now.model ? ' selected' : '') + '>' + MODEL_LABELS[MODELS[i]] + '</option>';
    return '<form class="lg-form" id="lg-form"><h1>이 자리에 띄울 실시간 화면</h1>' + choices +
      '<label class="lg-field" id="lg-model-field">돌려 볼 청자<select id="lg-model">' + options + '</select></label>' +
      (office ? '<label class="lg-field"><input type="checkbox" id="lg-cover"' + (now.cover ? ' checked' : '') + '> 슬라이드 쇼에서는 가려 두었다가 클릭하면 나타나기</label>' : '') +
      '<label class="lg-field" id="lg-link-field">PPT용 주소<input type="text" id="lg-link" autocomplete="off" spellcheck="false" value="' + esc(now.link || localRead().link || '') + '" placeholder="선생님 화면 → 수업 관리 → PPT용 주소 복사"></label>' +
      '<label class="lg-field"><input type="checkbox" id="lg-three"' + (localRead().three === false ? '' : ' checked') + '> 청자를 3D로 보기 (안 보이거나 느리면 꺼 주세요)</label>' +
      '<p>이 PowerPoint는 추가 기능을 옛 웹 엔진으로 열어요. 청자는 3D로 보여 주고, 3D가 안 되는 컴퓨터에서는 좌우로 끌어 돌려 보는 사진으로 바꿔 보여 줘요. 학생 이름은 보이지 않아요.</p>' +
      '<p class="lg-error" id="lg-error" role="alert">' + esc(message || '') + '</p><button type="submit" class="lg-submit">이 화면 띄우기</button></form>';
  }
  function syncSetupFields() {
    var chosen = root.querySelector('input[name=lg-panel]:checked'), panel = chosen ? chosen.value : 'follow';
    var link = document.getElementById('lg-link-field'), model = document.getElementById('lg-model-field');
    if (link) link.style.display = needsLink(panel) ? '' : 'none';
    if (model) model.style.display = panel === 'model' ? '' : 'none';
  }
  function render() {
    if (!root) return;
    var now = saved(), link = now.link && parseLink(now.link);
    if (view.setup || !now.panel || (needsLink(now.panel) && !link)) {
      if (!view.setup) { view.setup = true; lastBody = ''; }
      if (head.style.display !== 'none') { head.style.display = 'none'; body.style.top = '0'; }
      if (lastBody !== 'setup') { lastBody = 'setup'; body.innerHTML = setupMarkup(''); syncSetupFields(); }
      syncAuto(); syncCover(); return;
    }
    var panel = panelNow(), html = '';
    head.style.display = ''; body.style.top = '';
    head.innerHTML = headMarkup(panel);
    if (problem) html = '<p class="lg-empty"><b>실시간 화면을 열지 못했어요.</b><br>' + esc(problem) + '</p>';
    else {
      if (needsLink(panel) && waiting) html += '<p class="lg-note" data-waiting><b>지금은 열린 수업이 없어요.</b> 수업이 열리면 이 화면에 실시간 결과가 나타나요.</p>';
      else if (needsLink(panel) && !data) html += '<p class="lg-note">수업에 연결하고 있어요…</p>';
      html += panel === 'comparison' ? comparisonPanel() : panel === 'beauty' ? beautyPanel() : panel === 'uses' ? usesPanel() : panel === 'works' ? worksPanel() : panel === 'model' ? modelPanel() : gamePanel();
    }
    if (html !== lastBody) { lastBody = html; body.innerHTML = html; body.setAttribute('data-panel', panel); mountTurns(); }
    if (panel === 'works') loadPictures();
    syncAuto(); syncCover();
  }
  function tick() {
    var cell = root && root.querySelector('[data-timer]');
    if (cell) { var time = remaining(); cell.innerHTML = time ? '남은 시간 <b>' + time + '</b>' : ''; }
  }
  function resize() {
    var width = window.innerWidth || document.documentElement.clientWidth || 960;
    document.documentElement.style.fontSize = Math.max(10, Math.min(30, width / 64)) + 'px';
  }

  // ---------- clicks ----------
  function reveal(activity) {
    var link = saved().link && parseLink(saved().link);
    if (!link || revealBusy) return;
    revealBusy = true;
    request('POST', '', {action: 'control', code: link.code, command: 'reveal', activity: activity}, link.key, function (status) {
      revealBusy = false;
      if (status === 200) view.exhibit[activity] = true;
      schedule(0);
    });
  }
  function click(event) {
    var node = actionOf(event.target || event.srcElement);
    if (!node || node.disabled) return;
    var act = node.getAttribute('data-act'), activity = Number(node.getAttribute('data-activity'));
    if (act === 'setup') { view.setup = true; lastBody = ''; render(); return; }
    if (act === 'open-game') {
      // Newer PowerPoint can hand the address to the computer's own browser; otherwise the link opens as usual.
      try {
        if (office && window.Office.context.ui && window.Office.context.ui.openBrowserWindow) { window.Office.context.ui.openBrowserWindow(origin() + '/game'); if (event.preventDefault) event.preventDefault(); }
      } catch (e) {}
      return;
    }
    if (act === 'reload') { window.location.reload(); return; }
    if (act === 'turn') {
      var turned = node.getAttribute('data-model'), steps = Number(node.getAttribute('data-step'));
      view.auto = false;
      if (threeD && threeD.shown(turned)) threeD.turn(turned, -steps * Math.PI / 12); else setFrame(turned, (turnFrames[turned] || 0) + steps);
      syncAuto(); return;
    }
    if (act === 'zoom') { if (threeD) threeD.zoom(node.getAttribute('data-model'), Number(node.getAttribute('data-factor'))); return; }
    if (act === 'reset-view') { view.auto = false; if (threeD) threeD.reset(node.getAttribute('data-model')); syncAuto(); return; }
    if (act === 'auto') { view.auto = !view.auto; syncAuto(); return; }
    if (act === 'object') view.object = node.getAttribute('data-id');
    else if (act === 'kind') view.kind = node.getAttribute('data-kind') === 'use' ? 'use' : 'name';
    else if (act === 'responses') view.exhibit[activity] = false;
    else if (act === 'exhibit') {
      if (!(data && data.state && data.state.revealed && data.state.revealed[activity])) { reveal(activity); return; }
      view.exhibit[activity] = true;
    } else if (act === 'exhibit-object') view.exhibitObject[activity] = node.getAttribute('data-id');
    else if (act === 'cover') { coverLifted = true; syncCover(); return; }
    else return;
    render();
  }
  function submit(event) {
    if (event.preventDefault) event.preventDefault(); else event.returnValue = false;
    var chosen = root.querySelector('input[name=lg-panel]:checked'), panel = chosen ? chosen.value : '', field = document.getElementById('lg-link');
    var text = field ? field.value.replace(/^\s+|\s+$/g, '') : '', select = document.getElementById('lg-model'), cover = document.getElementById('lg-cover');
    if (!has(PANELS, panel)) return;
    if (needsLink(panel) && !parseLink(text)) { document.getElementById('lg-error').innerHTML = 'PPT용 주소를 확인해 주세요. 선생님 화면 → 수업 관리 → “PPT용 주소 복사”로 복사한 주소를 붙여 넣어 주세요.'; return; }
    var three = document.getElementById('lg-three'), wasThree = localRead().three !== false, wantThree = !three || three.checked;
    localWrite({three: wantThree});
    save(panel, parseLink(text) ? text : saved().link, select && has(MODELS, select.value) ? select.value : 'beauty', !!(cover && cover.checked), function () {
      // Switching 3D on or off starts the box again so the choice applies cleanly.
      if (wasThree !== wantThree) { window.location.reload(); return; }
      view.setup = false; view.auto = true; lastBody = ''; data = null; waiting = false; problem = ''; connected = false; lastRefresh = null;
      render(); schedule(0);
    });
  }

  // ---------- inside PowerPoint ----------
  // "클릭하면 나타나기": in a slide show the board waits behind a cover until it is clicked.
  function syncCover() {
    var cover = document.getElementById('lg-cover-screen'), show = office && !editing && !coverLifted && !view.setup && saved().cover;
    if (cover) cover.style.display = show ? '' : 'none';
  }
  function watchView() {
    function apply(mode) {
      var was = editing; editing = mode !== 'read';
      if (was && !editing) coverLifted = false;
      lastBody = ''; render();
    }
    try {
      window.Office.context.document.getActiveViewAsync(function (result) { apply(result && result.value); });
      window.Office.context.document.addHandlerAsync(window.Office.EventType.ActiveViewChanged, function (event) { apply(event.activeView); });
    } catch (e) { apply('edit'); }  // without the view the box must still be changeable
  }
  // A presenter remote sends PageDown/PageUp; once this box has been clicked those keys stay in it, so pass them on.
  function forwardKeys(event) {
    if (!office || editing) return;
    var code = event.keyCode, tag = ((event.target || event.srcElement || {}).tagName || '').toUpperCase(), typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    var next = code === 34 || (!typing && (code === 39 || code === 40)), previous = code === 33 || (!typing && (code === 37 || code === 38));
    if (!next && !previous) return;
    if (event.preventDefault) event.preventDefault();
    try { window.Office.context.document.goToByIdAsync(next ? window.Office.Index.Next : window.Office.Index.Previous, window.Office.GoToType.Index, function () {}); } catch (e) {}
  }
  function start(inOffice) {
    office = inOffice; editing = !office;
    // The page's own styles and form belong to the usual board (they use features this engine lacks); set them aside.
    var styles = document.getElementsByTagName('style'), usual = ['setup', 'board', 'change', 'cover-screen'], i, node;
    try { if (styles[0] && styles[0].sheet) styles[0].sheet.disabled = true; } catch (e) {}
    for (i = 0; i < usual.length; i++) { node = document.getElementById(usual[i]); if (node) node.style.display = 'none'; }
    node = document.getElementById('lg-loading'); if (node && node.parentNode) node.parentNode.removeChild(node);
    root = document.createElement('div'); root.id = 'lg-root';
    root.innerHTML = '<div class="lg-head"></div><div class="lg-body"></div><div class="lg-cover" id="lg-cover-screen" data-act="cover" style="display:none"><b>▶ 클릭하면 실시간 화면이 나타나요</b></div>';
    document.body.appendChild(root);
    head = root.children[0]; body = root.children[1];
    root.addEventListener('click', click);
    root.addEventListener('submit', submit);
    root.addEventListener('change', function () { if (view.setup) syncSetupFields(); });
    document.addEventListener('keydown', forwardKeys);
    window.addEventListener('resize', resize);
    watchDragging(); resize();
    // "nowebp=1" in the address makes any browser behave like the engine that cannot draw WebP (for checking).
    if (/[?&]nowebp=1(&|$)/.test(window.location.search)) canWebp = false;
    else {
      var probe = new Image();
      probe.onload = function () { canWebp = probe.width > 0; render(); };
      probe.onerror = function () { canWebp = false; render(); };
      probe.src = WEBP_PROBE;
    }
    setInterval(tick, 1000);
    loadThree();
    if (office) watchView();
    view.setup = !saved().panel;
    render(); schedule(0);
    window.__legacyBoard = {ready: true, office: office};
  }
  // Office.js only matters inside PowerPoint; elsewhere (or if it cannot load) the board runs on its own.
  function boot() {
    var done = false;
    function finish(inOffice) { if (!done) { done = true; start(inOffice); } }
    // Office.js can take a few seconds to answer; say so instead of leaving the box empty.
    var loading = document.createElement('div'); loading.id = 'lg-loading';
    loading.style.cssText = 'padding:18px;font-family:Malgun Gothic,sans-serif;font-size:15px;color:#687783';
    loading.innerHTML = '실시간 화면을 준비하고 있어요…';
    document.body.appendChild(loading);
    var script = document.createElement('script');
    script.src = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js';
    script.onload = function () {
      try {
        if (window.Office && window.Office.onReady) window.Office.onReady(function (info) { finish(!!(info && info.host)); });
        else finish(false);
      } catch (e) { finish(false); }
    };
    script.onerror = function () { finish(false); };
    document.getElementsByTagName('head')[0].appendChild(script);
    setTimeout(function () { finish(false); }, 6000);
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
