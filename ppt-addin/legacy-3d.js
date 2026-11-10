/* Real 3D for the old-engine board (PowerPoint 2016/2019, Internet Explorer 11). That engine has WebGL, and the
   three.js of its time (r116, vendor/) still ran in it, so the lesson models can be turned, tilted and enlarged
   as on the site. One renderer draws every model and copies the picture into each box, so many boxes never need
   many WebGL contexts. After the first drawing the result is looked at: if nothing (or only an untextured shape)
   came out, 3D is switched off and the board keeps the turning pictures. Written in ES5; see legacy-board.test.js. */
(function () {
  'use strict';
  var THREE = window.THREE;
  var FOV = 30, START_PITCH = 0.14, TURN_MS = 320, AUTO_TURN_MS = 16000;
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
    var ratio = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(view.node.offsetWidth * ratio)), h = Math.max(1, Math.round(view.node.offsetHeight * ratio));
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
    var item = records[grip.view.id], width = grip.view.node.offsetWidth || 200, time = now(), turned = (x - grip.x) / width * Math.PI;
    item.yaw += turned; item.pitch = clamp(item.pitch + (y - grip.y) / width * 1.4, -0.35, 1.15);
    item.velocity = time > grip.time ? clamp(turned / (time - grip.time), -0.012, 0.012) : 0;
    grip.x = x; grip.y = y; grip.time = time; item.dirty = true; schedule();
  }
  function letGo(grip) {
    var item = records[grip.view.id];
    item.held = false; if (now() - grip.time > 120) item.velocity = 0;
    schedule();
  }
  // One finger or mouse at a time; the page-wide listeners are added once, however often boxes are redrawn.
  var grip = null, watching = false;
  function up() { if (grip) { letGo(grip); grip = null; } }
  function watchPage() {
    if (watching) return;
    watching = true;
    if (window.PointerEvent) {
      document.addEventListener('pointermove', function (event) { if (grip) move(grip, event.clientX, event.clientY); });
      document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    } else {
      document.addEventListener('mousemove', function (event) { if (grip) move(grip, event.clientX, event.clientY); });
      document.addEventListener('mouseup', up);
    }
  }
  function listen(view) {
    var canvas = view.canvas;
    watchPage();
    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', function (event) { grip = hold(view, event.clientX, event.clientY); if (grip && event.preventDefault) event.preventDefault(); });
      return;
    }
    canvas.addEventListener('mousedown', function (event) { grip = hold(view, event.clientX, event.clientY); if (grip && event.preventDefault) event.preventDefault(); });
    canvas.addEventListener('touchstart', function (event) { if (event.touches.length === 1) grip = hold(view, event.touches[0].clientX, event.touches[0].clientY); });
    canvas.addEventListener('touchmove', function (event) { if (grip && event.touches.length === 1) { move(grip, event.touches[0].clientX, event.touches[0].clientY); event.preventDefault(); } });
    canvas.addEventListener('touchend', up);
  }

  api.usable = function () { return !broken && !!THREE && !!THREE.GLTFLoader; };
  // Is this model on screen in 3D (so the pictures are not needed)?
  api.shown = function (id) { return !broken && !!records[id] && records[id].state === 'ready' && records[id].checked === true; };
  api.mount = function (node, id) {
    if (!api.usable() || (records[id] && records[id].state === 'error')) return false;
    var canvas = document.createElement('canvas'), context = null;
    try { context = canvas.getContext('2d'); } catch (e) { context = null; }
    if (!context) return false;
    canvas.className = 'lg-3d'; canvas.setAttribute('aria-hidden', 'true'); canvas.style.display = 'none';
    node.appendChild(canvas);
    var view = {node: node, id: id, canvas: canvas, context: context, shown: false};
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
  api.zoom = function (id, factor) { var item = records[id]; if (!item || item.state !== 'ready') return; item.zoom = clamp(item.zoom * factor, 0.6, 3); item.dirty = true; schedule(); };
  api.reset = function (id) { var item = records[id]; if (!item || item.state !== 'ready') return; item.yaw = 0; item.pitch = START_PITCH; item.zoom = 1; item.velocity = 0; item.turn = null; item.dirty = true; schedule(); };
  api.auto = function (id) { autoId = id || null; lastTime = 0; if (autoId) schedule(); };
  api.autoId = function () { return autoId; };
  api.redraw = function () { for (var id in records) if (Object.prototype.hasOwnProperty.call(records, id)) records[id].dirty = true; schedule(); };
  api.state = function (id) { var item = records[id]; return item ? {state: item.state, yaw: item.yaw, pitch: item.pitch, zoom: item.zoom} : null; };
  window.addEventListener('resize', api.redraw);
  window.__legacy3d = api;
})();
