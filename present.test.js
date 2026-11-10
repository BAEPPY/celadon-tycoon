// The presentation window (/present) and the Windows files that open it from a slide in its own window.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const install = readFileSync('ppt-addin/windows/install-game-window.bat', 'utf8'), remove = readFileSync('ppt-addin/windows/remove-game-window.bat', 'utf8');
const page = readFileSync('present.html', 'utf8');

test('the game window address is registered for the user only, with a fixed command', () => {
  for (const [name, text] of [['install', install], ['remove', remove]]) {
    assert.ok(!/[^\r]\n/.test(text), `${name}: Windows line endings`);
    assert.ok(!text.startsWith('﻿'), `${name}: no byte-order mark (cmd would choke on the first line)`);
    assert.ok(!/HKLM\\[^"]*" \/(ve|v|f)[^\r]*\/d|reg (add|delete) "HKLM/i.test(text), `${name}: nothing is written outside the user's own settings`);
    assert.ok(!/runas|powershell|curl|bitsadmin|certutil|start /i.test(text), `${name}: only reg.exe is used`);
  }
  const command = install.match(/shell\\open\\command" \/ve \/d "(.*)" \/f/)[1];
  assert.equal(command, '\\"%BROWSER%\\" --app=https://celadon-tycoon.vercel.app/present?open=game --start-fullscreen');
  // Nothing from the clicked address reaches the browser's command line: a crafted link cannot add switches.
  assert.ok(!/%%?1|%\*|%%?L/i.test(install), 'the hyperlink text is never passed on');
  assert.ok(!/[&|<>^]/.test(command), 'no shell characters in the command');
  assert.match(install, /reg add "HKCU\\Software\\Classes\\celadon-game" \/v "URL Protocol" \/d "" \/f/);
  assert.match(install, /celadon-game:\/\/open/);
  // Edge first (it is on every Windows 10/11), found by its registered path, with the usual folders as a fallback.
  assert.match(install, /App Paths\\msedge\.exe/); assert.match(install, /%ProgramFiles\(x86\)%\\Microsoft\\Edge\\Application\\msedge\.exe/);
  // Every key the install file adds is removed by the remove file.
  for (const key of ['HKCU\\Software\\Classes\\celadon-game', 'HKCU\\Software\\Microsoft\\Office\\16.0\\Common\\Security\\Trusted Protocols\\All Applications\\celadon-game:',
    'HKCU\\Software\\Policies\\Microsoft\\Office\\16.0\\Common\\Security\\Trusted Protocols\\All Applications\\celadon-game:']) {
    assert.ok(install.includes(`reg add "${key}"`), key); assert.ok(remove.includes(`reg delete "${key}" /f`), key);
  }
});

test('the presentation window is served at /present and frames only its own fixed screens', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/present' && rule.destination === '/present/index.html'));
  assert.match(readFileSync('build.mjs', 'utf8'), /copyFile\('present\.html','dist\/present\/index\.html'\)/);
  assert.match(readFileSync('server.mjs', 'utf8'), /model\|game\|present\)/);
  // The frame's address is always built from the lists in the page, never taken from the address bar as it is.
  assert.ok(!/\.src\s*=\s*(query|location|decodeURI)/.test(page));
  for (const built of ["src: '/game'", 'src: `/model?${new URLSearchParams({id})}`', 'src: `/observe?${params}']) assert.ok(page.includes(built), built);
  assert.match(page, /MODELS\.includes\(query\.get\('id'\)\)/); assert.match(page, /Object\.hasOwn\(BOARDS, open\)/);
});
