// Aim the visible fan blade at a pottery zone, not the handle below the blade.
async function dryingHandleY(canvas,bladeY){
 const box=await canvas.boundingBox(),tool=JSON.parse(await canvas.getAttribute('data-tool-bounds'));
 return Math.min(.98,bladeY+tool.height*.55/box.height);
}
async function dryingSweep(page,canvas,bladeY,x1=.02,x2=.98,steps=14){
 const box=await canvas.boundingBox(),y=await dryingHandleY(canvas,bladeY);
 // Place the idle fan in empty space before deliberately aiming at another zone.
 await page.mouse.click(box.x+10,box.y+10);
 await page.mouse.move(box.x+box.width*x1,box.y+box.height*y);await page.mouse.down();
 await page.mouse.move(box.x+box.width*x2,box.y+box.height*y,{steps});await page.mouse.up();
}
module.exports={dryingHandleY,dryingSweep};
