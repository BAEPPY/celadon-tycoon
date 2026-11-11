/* Real 3D for the old-engine board (PowerPoint 2016/2019, Internet Explorer 11). That engine has WebGL, and the
   three.js of its time (r116, vendor/) still ran in it, so the lesson models can be turned, tilted and enlarged
   as on the site. One renderer draws every model and copies the picture into each box, so many boxes never need
   many WebGL contexts. After the first drawing the result is looked at: if nothing (or only an untextured shape)
   came out, 3D is switched off and the board keeps the turning pictures. Written in ES5; see legacy-board.test.js. */
(function () {
  'use strict';
  var THREE = window.THREE;
  var FOV = 30, START_PITCH = 0.14, TURN_MS = 320, AUTO_TURN_MS = 16000, ZOOM_MS = 260, ZOOM_LEAST = 0.6, ZOOM_MOST = 4;
  var renderer = null, broken = false, records = {}, views = [], frame = null, autoId = null, lastTime = 0;
  var api = {onChange: null, onHold: null, reason: ''};

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  // Told a moment later, never in the middle of the board drawing itself.
  var telling = null;
  function notify() { if (!telling) telling = setTimeout(function () { telling = null; if (api.onChange) api.onChange(); }, 0); }
  function now() { return new Date().getTime(); }
  function inPage(node) { return !!node && document.documentElement.contains(node); }

  // 3D does not work here: take every canvas away so the pictures show again.
  function fail(reason) {
    if (broken) return;
    broken = true; autoId = null; api.reason = reason || 'unknown';
    for (var i = 0; i < views.length; i++) if (views[i].canvas.parentNode) views[i].canvas.parentNode.removeChild(views[i].canvas);
    views = [];
    try { if (renderer) renderer.dispose(); } catch (e) {}
    renderer = null;
    notify();
  }
  function ensureRenderer() {
    if (renderer || broken) return renderer;
    try {
      renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.addEventListener('webglcontextlost', function (event) { if (event.preventDefault) event.preventDefault(); fail('context lost'); });
    } catch (e) { renderer = null; fail('no renderer: ' + (e && e.message)); }
    return renderer;
  }
  // This three.js reads only the first set of texture coordinates. A model whose colour picture uses another set
  // (TEXCOORD_2, ...) gets that set moved to the first place. Meshes and glTF primitives come in the same order.
  function primitivesInOrder(json) {
    var list = [], scene = json.scenes && json.scenes[json.scene || 0], roots = (scene && scene.nodes) || [];
    function visit(index) {
      var node = json.nodes && json.nodes[index], i;
      if (!node) return;
      var parts = node.mesh !== undefined && json.meshes && json.meshes[node.mesh] ? json.meshes[node.mesh].primitives || [] : [];
      for (i = 0; i < parts.length; i++) list.push(parts[i]);
      for (i = 0; i < (node.children || []).length; i++) visit(node.children[i]);
    }
    for (var r = 0; r < roots.length; r++) visit(roots[r]);
    return list;
  }
  function useTextureCoordinates(gltf) {
    var json = gltf.parser && gltf.parser.json, parts = json ? primitivesInOrder(json) : [], meshes = [];
    gltf.scene.traverse(function (object) { if (object.isMesh) meshes.push(object); });
    if (!json || meshes.length !== parts.length) return;
    for (var i = 0; i < meshes.length; i++) {
      var material = json.materials && json.materials[parts[i].material];
      var base = material && material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorTexture, set = base && base.texCoord;
      if (!set) continue;
      var attribute = meshes[i].geometry.attributes[set === 1 ? 'uv2' : 'texcoord_' + set];
      if (attribute) meshes[i].geometry.setAttribute('uv', attribute);
    }
  }
  // The size of the model in the scene. This three.js measures packed (normalized integer) positions as if they
  // were plain numbers, which would put the camera far too far away, so the points are measured here.
  function boundsOf(root) {
    var box = new THREE.Box3(), point = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.traverse(function (object) {
      var position = object.geometry && object.geometry.attributes && object.geometry.attributes.position;
      if (!position) return;
      var values = position.data ? position.data.array : position.array, scale = 1;
      if (position.normalized) scale = values instanceof Int16Array ? 1 / 32767 : values instanceof Uint16Array ? 1 / 65535 : values instanceof Int8Array ? 1 / 127 : values instanceof Uint8Array ? 1 / 255 : 1;
      var step = Math.max(1, Math.floor(position.count / 100000));
      for (var i = 0; i < position.count; i += step) {
        point.set(position.getX(i) * scale, position.getY(i) * scale, position.getZ(i) * scale).applyMatrix4(object.matrixWorld);
        box.expandByPoint(point);
      }
    });
    return box;
  }
  function record(id) {
    if (records[id]) return records[id];
    var item = records[id] = {id: id, state: 'loading', yaw: 0, pitch: START_PITCH, zoom: 1, velocity: 0, turn: null, dirty: false, checked: false};
    try {
      new THREE.GLTFLoader().load('/assets/lesson/' + id + '.glb', function (gltf) {
        try {
          useTextureCoordinates(gltf);
          var scene = new THREE.Scene(), pivot = new THREE.Group(), box = boundsOf(gltf.scene);
          var center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
          gltf.scene.position.sub(center); pivot.add(gltf.scene); scene.add(pivot);
          // Neutral lights: an untextured shape then stays grey, which the first look at the drawing can tell apart.
          scene.add(new THREE.HemisphereLight(0xffffff, 0x9c9c9c, 0.95));
          var key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(-1.5, 2.5, 3); scene.add(key);
          var fill = new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(2.5, 1, 2); scene.add(fill);
          item.radius = Math.max(size.length() / 2, 0.0001);
          item.camera = new THREE.PerspectiveCamera(FOV, 1, item.radius / 50, item.radius * 50);
          item.scene = scene; item.pivot = pivot; item.state = 'ready'; item.dirty = true;
          schedule();
        } catch (e) { item.state = 'error'; release(id); }
      }, undefined, function () { item.state = 'error'; release(id); });
    } catch (e) { item.state = 'error'; }
    return item;
  }
  // This model cannot be shown in 3D: its boxes go back to the pictures.
  function release(id) {
    var kept = [];
    for (var i = 0; i < views.length; i++) {
      if (views[i].id !== id) { kept.push(views[i]); continue; }
      if (views[i].canvas.parentNode) views[i].canvas.parentNode.removeChild(views[i].canvas);
    }
    views = kept; notify();
  }
  function place(item, aspect) {
    var distance = item.radius / Math.sin(FOV * Math.PI / 360) * 1.06 / item.zoom, camera = item.camera;
    camera.aspect = aspect;
    camera.position.set(0, Math.sin(item.pitch) * distance, Math.cos(item.pitch) * distance);
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    item.pivot.rotation.y = item.yaw;
  }
  // Did a textured model really come out? Looks at the middle of the copied picture.
  function looksRight(view) {
    try {
      var w = view.canvas.width, h = view.canvas.height;
      var data = view.context.getImageData(Math.floor(w * 0.3), Math.floor(h * 0.3), Math.max(1, Math.floor(w * 0.4)), Math.max(1, Math.floor(h * 0.4))).data;
      var seen = 0, colour = 0;
      for (var i = 0; i < data.length; i += 28) {
        if (data[i + 3] < 200) continue;
        seen++; colour += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      }
      view.look = seen + ' solid samples, colour ' + (seen ? Math.round(colour / seen * 10) / 10 : 0);
      return seen > 8 && colour / seen >= 4;
    } catch (e) { view.look = 'could not read the picture: ' + (e && e.message); return false; }
  }
  function draw(view) {
    var item = records[view.id];
    if (!item || item.state !== 'ready' || !ensureRenderer() || !inPage(view.node)) return;
    var ratio = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(view.box.offsetWidth * ratio)), h = Math.max(1, Math.round(view.box.offsetHeight * ratio));
    try {
      if (view.canvas.width !== w || view.canvas.height !== h) { view.canvas.width = w; view.canvas.height = h; }
      renderer.setSize(w, h, false); place(item, w / h); renderer.render(item.scene, item.camera);
      view.context.clearRect(0, 0, w, h); view.context.drawImage(renderer.domElement, 0, 0, w, h);
    } catch (e) { fail('drawing failed: ' + (e && e.message)); return; }
    if (!item.checked) {
      if (!looksRight(view)) { fail('nothing recognisable was drawn for ' + view.id + ' (' + view.look + ')'); return; }
      item.checked = true; notify();   // once per model: the board adds the 3D buttons
    }
    if (!view.shown) {
      view.shown = true; view.canvas.style.display = 'block';
      view.node.style.backgroundImage = 'none'; view.node.setAttribute('data-3d', 'ready');
    }
  }
  function drawModel(id) { for (var i = 0; i < views.length && !broken; i++) if (views[i].id === id) draw(views[i]); }
  function schedule() { if (!frame && !broken) frame = window.requestAnimationFrame(tick); }
  function tick() {
    frame = null;
    var time = now(), elapsed = lastTime ? Math.min(100, time - lastTime) : 16, busy = false, id, item;
    lastTime = time;
    for (id in records) {
      if (!Object.prototype.hasOwnProperty.call(records, id)) continue;
      item = records[id];
      if (item.state !== 'ready') continue;
      if (item.glide) {
        // Coming closer or going back after a double tap.
        var gone = clamp((time - item.glide.start) / ZOOM_MS, 0, 1);
        item.zoom = item.glide.from + (item.glide.to - item.glide.from) * gone * gone * (3 - 2 * gone); item.dirty = true;
        if (gone >= 1) item.glide = null; else busy = true;
      }
      if (item.turn) {
        var part = clamp((time - item.turn.start) / TURN_MS, 0, 1), eased = part * part * (3 - 2 * part);
        item.yaw = item.turn.from + (item.turn.to - item.turn.from) * eased; item.dirty = true;
        if (part >= 1) item.turn = null; else busy = true;
      } else if (!item.held && Math.abs(item.velocity) > 0.00008) {
        // Keeps turning a little after the finger lets go.
        item.yaw += item.velocity * elapsed; item.velocity *= Math.pow(0.93, elapsed / 16); item.dirty = true; busy = true;
      } else if (autoId === id && !item.held) { item.yaw += elapsed / AUTO_TURN_MS * Math.PI * 2; item.dirty = true; busy = true; }
      if (item.dirty) { item.dirty = false; drawModel(id); }
    }
    if (!busy) lastTime = 0;
    if (busy && !broken) schedule();
  }
  function hold(view, x, y) {
    var item = records[view.id];
    if (!item || item.state !== 'ready') return null;
    item.held = true; item.velocity = 0; item.turn = null; if (api.onHold) api.onHold(view.id);
    return {view: view, x: x, y: y, time: now()};
  }
  function move(grip, x, y) {
    var item = records[grip.view.id], width = Math.min(grip.view.box.offsetWidth, grip.view.box.offsetHeight) || 200, time = now(), turned = (x - grip.x) / width * Math.PI;
    item.yaw += turned; item.pitch = clamp(item.pitch + (y - grip.y) / width * 1.4, -0.35, 1.15);
    item.velocity = time > grip.time ? clamp(turned / (time - grip.time), -0.012, 0.012) : 0;
    grip.x = x; grip.y = y; grip.time = time; item.dirty = true; schedule();
  }
  function letGo(grip) {
    var item = records[grip.view.id];
    item.held = false; if (now() - grip.time > 120) item.velocity = 0;
    schedule();
  }
  // Fingers on a model (the tracker of legacy.js): one turns and tilts it, two spread apart bring it closer, a double
  // tap brings it twice as close (or back). Each model has its own tracker, kept while the board redraws its boxes, so
  // several children can each handle a model. The page-wide listeners are added once.
  function fingersOf(item) {
    if (item.fingers) return item.fingers;
    var grip = null, base = 1;
    item.fingers = window.__legacyFingers({
      start: function (x, y, view) { grip = hold(view, x, y); return !!grip; },
      drag: function (x, y) { if (grip) move(grip, x, y); },
      end: function () { if (grip) { letGo(grip); grip = null; } },
      pinchStart: function () { base = item.zoom; item.held = true; item.velocity = 0; item.turn = null; item.glide = null; if (api.onHold) api.onHold(item.id); },
      pinch: function (scale) { item.zoom = clamp(base * scale, ZOOM_LEAST, ZOOM_MOST); item.dirty = true; schedule(); },
      pinchEnd: function () { item.held = false; schedule(); },
      doubleTap: function () { api.zoomTo(item.id, item.zoom > 1.4 ? 1 : 2); }
    });
    return item.fingers;
  }
  function everyModel(act) { for (var id in records) if (Object.prototype.hasOwnProperty.call(records, id) && records[id].fingers) act(records[id].fingers); }
  var watching = false;
  function watchPage() {
    if (watching) return;
    watching = true;
    var i;
    if (window.PointerEvent) {
      var lifted = function (event) { everyModel(function (fingers) { fingers.up('p' + event.pointerId); }); };
      document.addEventListener('pointermove', function (event) {
        // A mouse button let go outside the box: the drag ends as soon as the mouse is back.
        if (event.pointerType === 'mouse' && event.buttons === 0) lifted(event);
        else everyModel(function (fingers) { fingers.move('p' + event.pointerId, event.clientX, event.clientY); });
      });
      document.addEventListener('pointerup', lifted); document.addEventListener('pointercancel', lifted);
      return;
    }
    document.addEventListener('mousemove', function (event) { everyModel(function (fingers) { fingers.move('mouse', event.clientX, event.clientY); }); });
    document.addEventListener('mouseup', function () { everyModel(function (fingers) { fingers.up('mouse'); }); });
    document.addEventListener('touchmove', function (event) {
      for (i = 0; i < event.changedTouches.length; i++) (function (touch) { everyModel(function (fingers) { fingers.move('t' + touch.identifier, touch.clientX, touch.clientY); }); })(event.changedTouches[i]);
    });
    var touchEnd = function (event) { for (i = 0; i < event.changedTouches.length; i++) (function (touch) { everyModel(function (fingers) { fingers.up('t' + touch.identifier); }); })(event.changedTouches[i]); };
    document.addEventListener('touchend', touchEnd); document.addEventListener('touchcancel', touchEnd);
  }
  function listen(view) {
    var canvas = view.canvas, i;
    function down(key, x, y) { var item = records[view.id]; return !!item && item.state === 'ready' && fingersOf(item).down(key, x, y, view); }
    watchPage();
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', function (event) { if (down('p' + event.pointerId, event.clientX, event.clientY) && event.preventDefault) event.preventDefault(); });
      return;
    }
    canvas.addEventListener('mousedown', function (event) { if (down('mouse', event.clientX, event.clientY) && event.preventDefault) event.preventDefault(); });
    canvas.addEventListener('touchstart', function (event) {
      var taken = false;
      for (i = 0; i < event.changedTouches.length; i++) taken = down('t' + event.changedTouches[i].identifier, event.changedTouches[i].clientX, event.changedTouches[i].clientY) || taken;
      if (taken) event.preventDefault();
    });
    canvas.addEventListener('touchmove', function (event) { if (records[view.id] && records[view.id].fingers && records[view.id].fingers.count()) event.preventDefault(); });
  }

  api.usable = function () { return !broken && !!THREE && !!THREE.GLTFLoader; };
  // Is this model on screen in 3D (so the pictures are not needed)?
  api.shown = function (id) { return !broken && !!records[id] && records[id].state === 'ready' && records[id].checked === true; };
  // `frame` (optional) is a larger element the drawing should fill instead of the model's own square, so an
  // enlarged model is not cut off at the square's edges.
  api.mount = function (node, id, frame) {
    if (!api.usable() || (records[id] && records[id].state === 'error')) return false;
    var canvas = document.createElement('canvas'), context = null;
    try { context = canvas.getContext('2d'); } catch (e) { context = null; }
    if (!context) return false;
    canvas.className = 'lg-3d'; canvas.setAttribute('aria-hidden', 'true'); canvas.setAttribute('data-model', id); canvas.style.display = 'none';
    var box = frame || node;
    box.appendChild(canvas);
    var view = {node: node, box: box, id: id, canvas: canvas, context: context, shown: false};
    views.push(view); listen(view);
    var item = record(id);
    if (item.state === 'ready') draw(view);
    return true;
  };
  // Boxes that left the page are forgotten.
  api.sweep = function () {
    var kept = [];
    for (var i = 0; i < views.length; i++) if (inPage(views[i].canvas)) kept.push(views[i]);
    views = kept;
  };
  api.turn = function (id, radians) {
    var item = records[id]; if (!item || item.state !== 'ready') return;
    item.velocity = 0; item.turn = {from: item.yaw, to: (item.turn ? item.turn.to : item.yaw) + radians, start: now()}; schedule();
  };
  api.zoom = function (id, factor) { var item = records[id]; if (!item || item.state !== 'ready') return; item.glide = null; item.zoom = clamp(item.zoom * factor, ZOOM_LEAST, ZOOM_MOST); item.dirty = true; schedule(); };
  // Glides to a zoom (the double tap).
  api.zoomTo = function (id, zoom) { var item = records[id]; if (!item || item.state !== 'ready') return; item.glide = {from: item.zoom, to: clamp(zoom, ZOOM_LEAST, ZOOM_MOST), start: now()}; schedule(); };
  api.reset = function (id) { var item = records[id]; if (!item || item.state !== 'ready') return; item.yaw = 0; item.pitch = START_PITCH; item.zoom = 1; item.velocity = 0; item.turn = null; item.glide = null; item.dirty = true; schedule(); };
  api.auto = function (id) { autoId = id || null; lastTime = 0; if (autoId) schedule(); };
  api.autoId = function () { return autoId; };
  api.redraw = function () { for (var id in records) if (Object.prototype.hasOwnProperty.call(records, id)) records[id].dirty = true; schedule(); };
  api.state = function (id) { var item = records[id]; return item ? {state: item.state, yaw: item.yaw, pitch: item.pitch, zoom: item.zoom} : null; };
  window.addEventListener('resize', api.redraw);
  window.__legacy3d = api;
})();
