// Acknowledgement is deliberately page-local, just like the learner tutorial.
async function completeTutorial(target) {
  const dialog=target.locator('.tutorial-popup[open]');
  if(!await dialog.count())return;
  await dialog.locator('#tutorial-understood').check();
  await dialog.locator('[data-action=tutorial-start]').click();
}
async function enterGame(target, action='start') {
  await target.locator(`[data-action="${action}"]`).click();
  await completeTutorial(target);
}
module.exports={completeTutorial,enterGame};
