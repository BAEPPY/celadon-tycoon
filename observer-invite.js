import QRCode from 'qrcode';

// Encode locally: the private invitation fragment never leaves this browser.
export async function createObserverInvite({url,title,roomLabel}) {
  const target=new URL(url);
  if(!['https:','http:'].includes(target.protocol)||target.pathname!=='/observe'||
    !/^[A-Z2-9]{6}$/.test(target.searchParams.get('code')||'')||
    !/^[A-Za-z0-9_-]{30,100}$/.test(new URLSearchParams(target.hash.slice(1)).get('key')||'')) {
    throw new Error('참관 주소를 확인해 주세요.');
  }
  const qr=document.createElement('canvas');
  await QRCode.toCanvas(qr,target.href,{
    errorCorrectionLevel:'M',margin:4,scale:12,
    color:{dark:'#143C36',light:'#FFFFFF'}
  });
  await document.fonts?.ready;
  const poster=document.createElement('canvas');
  poster.width=1200;poster.height=1600;
  const ctx=poster.getContext('2d');
  if(!ctx)throw new Error('QR 안내문을 만들지 못했어요. 다시 눌러 주세요.');
  const font='"Pretendard", "Noto Sans KR", sans-serif';
  ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,1200,1600);
  ctx.fillStyle='#EDF7F4';ctx.fillRect(0,0,1200,338);
  ctx.fillStyle='#267A6D';ctx.textAlign='center';
  ctx.font=`700 30px ${font}`;ctx.fillText('공개수업 참관',600,94);
  ctx.fillStyle='#183E37';ctx.font=`700 50px ${font}`;
  const lines=wrapText(ctx,String(title||'고려청자의 우수성과 다양한 쓰임 알아보기'),1000);
  lines.slice(0,3).forEach((line,index)=>ctx.fillText(line,600,174+index*66));
  // Use an integer number of pixels per module, including the quiet zone.
  const modules=QRCode.create(target.href,{errorCorrectionLevel:'M'}).modules.size+8;
  const size=modules*Math.floor(840/modules);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(qr,(1200-size)/2,390,size,size);
  const footerY=390+size+84;
  ctx.fillStyle='#183E37';ctx.font=`700 36px ${font}`;
  ctx.fillText('휴대폰 카메라로 QR코드를 찍어 주세요.',600,footerY);
  ctx.fillStyle='#587069';ctx.font=`400 28px ${font}`;
  ctx.fillText('학생 이름 없이 수업을 함께 살펴보세요.',600,footerY+60);
  ctx.fillText('별도 로그인 없이 참관 화면으로 연결됩니다.',600,footerY+104);
  ctx.fillStyle='#267A6D';ctx.font=`700 26px ${font}`;
  ctx.fillText(String(roomLabel||'우리 반 청자 교실'),600,1518,1000);
  return {qrDataUrl:qr.toDataURL('image/png'),posterDataUrl:poster.toDataURL('image/png')};
}

function wrapText(ctx,text,maxWidth) {
  const lines=[];let line='';
  for(const word of text.split(/\s+/)) {
    const next=line?`${line} ${word}`:word;
    if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  return lines;
}
