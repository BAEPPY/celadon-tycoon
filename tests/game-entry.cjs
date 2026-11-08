// Acknowledgement is deliberately page-local, just like the learner tutorial.
async function completeTutorial(target) {
  const dialog=target.locator('.tutorial-popup[open]');
  if(!await dialog.count())return;
  for(let step=0;step<6&&await dialog.locator('[data-action=tutorial-next]').isEnabled();step++)await dialog.locator('[data-action=tutorial-next]').click();
  await dialog.locator('#tutorial-understood').check();
  await dialog.locator('[data-action=tutorial-start]').click();
}
async function enterGame(target, action='start') {
  await target.locator(`[data-action="${action}"]`).click();
  await completeTutorial(target);
}
module.exports={completeTutorial,enterGame};
