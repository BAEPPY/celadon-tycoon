// Animation cadence follows measured resource progress; it never advances the
// progress value itself or keeps a completed loading screen on screen.
const MIN_RATE=.35;
const MAX_RATE=2.4;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export class LoadingMotion {
 constructor(now=0){
  this.progress=0;
  this.progressAt=Number.isFinite(now)?now:0;
  this.tickAt=this.progressAt;
  this.throughput=0;
  this.playbackRate=.6;
 }
 observe(progress,now){
  if(!Number.isFinite(progress)||!Number.isFinite(now)||now<this.progressAt)return this.progress;
  const next=clamp(progress,this.progress,1);
  if(next===this.progress)return this.progress;
  // Coalesced cache hits can share a timestamp. A short measurement floor
  // keeps them finite without imposing any delay on the actual load.
  const elapsed=Math.max(16,now-this.progressAt)/1000;
  const measured=(next-this.progress)/elapsed;
  this.throughput=this.throughput?this.throughput+(measured-this.throughput)*.35:measured;
  this.progress=next;
  this.progressAt=now;
  return this.progress;
 }
 rateAt(now){
  if(!Number.isFinite(now)||now<this.tickAt)return this.playbackRate;
  const elapsed=Math.min(250,now-this.tickAt);
  this.tickAt=now;
  // Short gaps between completed resources are normal. Longer stalls ease
  // toward a slow jog instead of pretending that downloads are still quick.
  const stale=Math.max(0,now-this.progressAt-650);
  const recentThroughput=this.throughput*Math.exp(-stale/1000);
  const target=MIN_RATE+(MAX_RATE-MIN_RATE)*(1-Math.exp(-recentThroughput*2));
  this.playbackRate+=(target-this.playbackRate)*(1-Math.exp(-elapsed/280));
  this.playbackRate=clamp(this.playbackRate,MIN_RATE,MAX_RATE);
  return this.playbackRate;
 }
}
