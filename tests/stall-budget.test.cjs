const {test}=require('node:test');const assert=require('node:assert/strict');
test('three short stalls trigger failover even though each ends before the watchdog',async()=>{
  const {StallBudget}=await import('../src/playback.js');let now=0;const budget=new StallBudget({now:()=>now});
  for(let i=0;i<2;i++){budget.begin();now+=1300;assert.equal(budget.end(),false);now+=2000;}
  budget.begin();now+=1300;assert.equal(budget.end(),true);
});
test('pause time and deliberate seeking do not count as network stalls',async()=>{
  const {StallBudget}=await import('../src/playback.js');let now=0;const budget=new StallBudget({now:()=>now});
  budget.begin();now+=500;budget.pause();now+=60000;assert.equal(budget.exceeded(),false);
  budget.begin();now+=2000;budget.end();budget.reset();assert.equal(budget.exceeded(),false);
});
test('ancient isolated buffering events expire instead of poisoning a good stream',async()=>{
  const {StallBudget}=await import('../src/playback.js');let now=0;const budget=new StallBudget({now:()=>now});
  for(let i=0;i<5;i++){budget.begin();now+=1500;assert.equal(budget.end(),false);now+=31000;}
});
test('host-level success improves the next episode without conflating a single missing file with a dead host',async()=>{
  const {PlaybackHealth}=await import('../src/playback.js');const health=new PlaybackHealth();
  health.record('https://good.example/1.m3u8',true);
  assert.equal(health.rank(['https://unknown.example/2.m3u8','https://good.example/2.m3u8'])[0],'https://good.example/2.m3u8');
  health.record('https://good.example/missing.m3u8',false);
  assert.equal(health.rank(['https://unknown.example/3.m3u8','https://good.example/3.m3u8'])[0],'https://good.example/3.m3u8');
});
test('flow caps only real available renditions; single-quality video is not fake-downscaled',async()=>{
  const {qualityCap}=await import('../src/playback.js');const levels=[{height:360},{height:720},{height:1080}];
  assert.equal(qualityCap(levels,'smooth'),1);assert.equal(qualityCap(levels,'smooth',true),0);assert.equal(qualityCap([{height:1080}],'smooth'),-1);assert.equal(qualityCap(levels,'quality'),-1);
});
