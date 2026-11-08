/* Student management, entry lock, read-only observer link and the untimed activity 3. Run after npm run build against server.mjs. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:4173';

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Classroom tests must use a local server, never a production class.');
  const browser = await chromium.launch({headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox', '--enable-unsafe-swiftshader']});
  const errors = [];
  async function page(label) {
    const context = await browser.newContext({viewport: {width: 1366, height: 768}});
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: base});
    const result = await context.newPage();
    result.on('pageerror', error => errors.push(`${label}: ${error.message}`));
    result.on('dialog', dialog => dialog.accept());
    return result;
  }
  try {
    const teacher = await page('teacher');
    await teacher.goto(`${base}/teacher`); await teacher.locator('[data-form=create] button').click();
    const code = (await teacher.locator('.teacher-room-code strong').innerText()).trim();
    async function join(target, number, name) {
      await target.goto(`${base}/lesson?code=${code}`);
      await target.locator('[name=number]').fill(String(number)); await target.locator('[name=name]').fill(name);
      await target.locator('[data-form=join] button[type=submit]').click();
    }
    const a = await page('student 1'), b = await page('student 2'), stranger = await page('stranger');
    await join(a, 1, '봄샘'); await a.getByTestId('waiting-screen').waitFor();
    await join(b, 2, '하늘'); await b.getByTestId('waiting-screen').waitFor();

    const tabs = (await teacher.locator('.teacher-stage-nav button').allInnerTexts()).map(text => text.replace(/\s+/g, ' ').trim());
    assert.deepEqual(tabs, ['1 세 나라 도자기 비교', '2 쓰임과 이름 짐작하기', '3 좋은 청자 위대한 청자']);

    // Observer link: a read-only board without student names or controls.
    await teacher.click('.manage-menu>summary'); await teacher.click('[data-action=copy-observer]');
    await teacher.waitForFunction(() => document.querySelector('#classroom-toast')?.textContent.includes('참관 주소'));
    const link = await teacher.evaluate(() => navigator.clipboard.readText());
    assert.match(link, /\/observe\?code=[A-Z2-9]{6}#key=[A-Za-z0-9_-]{30,}$/);
    const observer = await page('observer');
    await observer.goto(link); await observer.locator('.teacher-stage-nav').waitFor();
    assert.equal(await observer.locator('[data-action=start],[data-action=pause],[data-action=reveal],.manage-menu,[data-form=settings],.participant-panel,[data-action=copy-code]').count(), 0);
    assert.ok(!(await observer.locator('#classroom-app').innerText()).includes('봄샘'));

    // Entry lock refuses new numbers.
    await teacher.click('[data-details=participants]>summary'); await teacher.click('.participant-panel [data-action=lock-room]');
    await teacher.waitForFunction(() => document.querySelector('.participant-panel summary')?.textContent.includes('입장 잠김'));
    await join(stranger, 3, '낯선 사람');
    await stranger.waitForFunction(() => document.querySelector('[data-form-error]')?.textContent.includes('새로 입장할 수 없어요'));

    // Releasing a number sends that student back to the entry form; the same number can then rejoin, even while locked.
    await teacher.click('.participant-panel [data-action=manage-students]'); await teacher.locator('dialog.student-manager[open]').waitFor();
    assert.equal(await teacher.locator('dialog.student-manager [data-action=manage-students]').count(), 0);
    await teacher.click('dialog.student-manager [data-action=release-student][data-id="1"]');
    await a.locator('[data-form=join]').waitFor({timeout: 15000});
    await a.locator('[data-form=join] button[type=submit]').click(); await a.getByTestId('waiting-screen').waitFor();

    // Removing a student deletes them from the class.
    await teacher.click('dialog.student-manager [data-action=remove-student][data-id="2"]');
    await b.locator('[data-form=join]').waitFor({timeout: 15000});
    await teacher.waitForFunction(() => document.querySelectorAll('dialog.student-manager tbody tr').length === 1, {}, {timeout: 15000});
    await teacher.click('dialog.student-manager [data-close-manager]');

    // Activity 3 has no time limit and closes for everyone when the teacher ends it; the observer follows along.
    await teacher.click('[data-action=teacher-activity][data-activity="3"]'); await teacher.click('[data-action=start][data-activity="3"]');
    await a.getByTestId('classroom-game').waitFor(); await a.waitForTimeout(6000);
    assert.match(await a.getByTestId('lesson-timer').innerText(), /진행 시간\s*0:0[5-9]/);
    await observer.waitForFunction(() => document.querySelector('.teacher-stage-nav button.active')?.textContent.includes('좋은 청자'), {}, {timeout: 15000});
    await teacher.click('[data-action=pause]');
    await a.getByTestId('lock-screen').waitFor({timeout: 15000});
    assert.equal(await a.getByTestId('classroom-game').count(), 0);
    assert.match(await a.getByTestId('lock-screen').innerText(), /크롬북을 닫고/);

    // A replaced observer link stops working.
    await teacher.evaluate(async () => {
      const saved = JSON.parse(localStorage.getItem('celadon-classroom-teacher-v1'));
      const response = await fetch('/api/classroom', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${saved.teacherToken}`}, body: JSON.stringify({action: 'control', code: saved.code, command: 'observer-link'})});
      if (!response.ok) throw new Error(`observer-link ${response.status}`);
    });
    await observer.waitForFunction(() => document.querySelector('[data-form-error]')?.textContent.includes('참관 주소가 바뀌었어요'), {}, {timeout: 15000});
    assert.deepEqual(errors, []);
    console.log('Classroom management: unified names, observer link without names or controls, entry lock, release/rejoin, removal, untimed activity 3 and replaced observer link passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
