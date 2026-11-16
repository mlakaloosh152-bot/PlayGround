(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const shell = document.querySelector('#gameShell');
  const $ = (s) => document.querySelector(s);
  const ui = {
    start: $('#startScreen'), pause: $('#pauseOverlay'), end: $('#endOverlay'), startBtn: $('#startBtn'), resume: $('#resumeBtn'), retry: $('#retryBtn'), pauseBtn: $('#pauseBtn'),
    round: $('#roundNumber'), roundStatus: $('#roundStatus'), roundPanel: $('.round-panel'), toast: $('#waveToast'), toastRound: $('#toastRound'), health: $('#healthText'), healthFill: $('#healthFill'),
    score: $('#scoreText'), kills: $('#killsText'), ammo: $('#ammoText'), reserve: $('#reserveText'), cross: $('#crosshair'), flash: $('#hitFlash'), message: $('#centerMessage'),
    reload: $('#reloadIndicator'), finalWave: $('#finalWave'), finalKills: $('#finalKills'), finalScore: $('#finalScore'), interaction: $('#interaction'), help: $('#helpTip')
  };
  const WORLD = {w: 2100, h: 1500};
  let W = 0, H = 0, dpr = 1, last = 0, state = 'menu', frame = 0, wave = 0, score = 0, kills = 0;
  const keys = new Set(), mouse = {x: 0, y: 0, down: false, seen: false};
  const player = {x: WORLD.w/2, y: WORLD.h/2, r: 15, angle: -Math.PI/2, speed: 220, hp: 100, ammo: 12, reserve: 84, armor: 0, fireAt: 0, reloadAt: 0, dashAt: 0, invuln: 0};
  let enemies = [], bullets = [], particles = [], drops = [], decals = [], obstacles = [], waveLeft = 0, intermission = 0, toastTimer = 0, messageTimer = 0, shake = 0, damageFlash = 0;
  let stick = {active:false,id:null,x:0,y:0,dx:0,dy:0}, touchFire = false;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => a + Math.random()*(b-a);
  const dist2 = (a,b) => (a.x-b.x)**2+(a.y-b.y)**2;
  const hash = (x,y) => {let n = Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n)};
  function resize(){const r=shell.getBoundingClientRect(); W=r.width; H=r.height; dpr=Math.min(devicePixelRatio||1,2); canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize); resize();
  function initObstacles(){
    obstacles=[];
    const positions=[[-330,-175,130,54],[-65,-300,70,94],[250,-210,128,62],[390,-40,70,160],[250,265,154,56],[-255,255,90,130],[-390,45,145,54],[-60,240,54,94],[55,-75,48,48]];
    for(const [x,y,w,h] of positions) obstacles.push({x:WORLD.w/2+x,y:WORLD.h/2+y,w,h,type:Math.abs(x+y)%3<1?'crate':'barrier'});
  }
  initObstacles();
  function reset(){
    player.x=WORLD.w/2; player.y=WORLD.h/2; player.angle=-Math.PI/2; player.hp=100; player.ammo=12; player.reserve=84; player.armor=0; player.fireAt=0; player.reloadAt=0; player.dashAt=0; player.invuln=0;
    enemies=[]; bullets=[]; particles=[]; drops=[]; decals=[]; wave=0; score=0; kills=0; waveLeft=0; intermission=0; shake=0; damageFlash=0; ui.round.textContent='01'; updateHud();
  }
  function updateHud(){ui.health.textContent=Math.max(0,Math.ceil(player.hp)); ui.healthFill.style.width=clamp(player.hp,0,100)+'%'; ui.healthFill.parentElement.classList.toggle('low',player.hp<35); ui.score.textContent=String(score).padStart(6,'0'); ui.kills.textContent=String(kills).padStart(2,'0'); ui.ammo.textContent=String(player.ammo).padStart(2,'0'); ui.reserve.textContent=String(player.reserve).padStart(3,'0');}
  function startGame(){reset(); state='playing'; ui.start.classList.add('hidden'); ui.pause.classList.add('hidden'); ui.end.classList.add('hidden'); ui.roundPanel.classList.add('active'); setTimeout(()=>$('#helpTip').classList.add('closed'),9000); startWave();}
  function startWave(){wave++; waveLeft=4+wave*3; intermission=0; ui.round.textContent=String(wave).padStart(2,'0'); ui.roundStatus.textContent='HOSTILES INBOUND'; ui.roundPanel.classList.add('active'); ui.toastRound.textContent=String(wave).padStart(2,'0'); ui.toast.classList.add('show'); toastTimer=2.2; setTimeout(()=>ui.toast.classList.remove('show'),2100);}
  function finishWave(){intermission=4.5; ui.roundStatus.textContent='SECTOR CLEAR'; ui.roundPanel.classList.remove('active'); player.hp=Math.min(100,player.hp+12); player.reserve=Math.min(180,player.reserve+12); showMessage('SECTOR CLEAR  //  +12 VITALS'); updateHud();}
  function showMessage(text){ui.message.textContent=text; ui.message.classList.add('show'); messageTimer=2.1;}
  function spawnEnemy(){
    const angle=rand(0,Math.PI*2), radius=Math.max(W,H)*.62+rand(40,200);
    let x=clamp(player.x+Math.cos(angle)*radius,35,WORLD.w-35),y=clamp(player.y+Math.sin(angle)*radius,35,WORLD.h-35);
    if(Math.hypot(x-player.x,y-player.y)<Math.min(W,H)*.42){x=angle<Math.PI?WORLD.w-35:35;y=rand(35,WORLD.h-35)}
    let runner=Math.random()<Math.min(.4,.13+wave*.018);
    enemies.push({x,y,r:runner?11:14,hp:runner?1:1+Math.floor(wave/5),maxHp:runner?1:1+Math.floor(wave/5),speed:(runner?95:58)+Math.min(wave*2,35),angle:rand(0,6),attack:rand(.2,.8),flash:0,runner});
  }
  function spawnBurst(x,y,color,n=8){for(let i=0;i<n;i++){let a=rand(0,Math.PI*2),s=rand(25,150);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.18,.48),max:.48,color,size:rand(1,3)})}}
  function reload(){if(state!=='playing'||player.reloadAt>0||player.ammo===12||player.reserve<=0)return;player.reloadAt=1.15;ui.reload.classList.add('show');}
  function doDash(){if(state!=='playing'||player.dashAt>0)return;let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+(stick.active?stick.dx:0),dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+(stick.active?stick.dy:0);let l=Math.hypot(dx,dy);if(l<.1){dx=Math.cos(player.angle);dy=Math.sin(player.angle)}else{dx/=l;dy/=l}player.x=clamp(player.x+dx*105,20,WORLD.w-20);player.y=clamp(player.y+dy*105,20,WORLD.h-20);player.dashAt=2.3;player.invuln=.22;spawnBurst(player.x,player.y,'#d5ee6b',12);}
  function shoot(){if(state!=='playing'||player.reloadAt>0||performance.now()<player.fireAt)return;if(player.ammo<=0){reload();return}player.fireAt=performance.now()+185;player.ammo--;let a=player.angle+rand(-.035,.035),sx=player.x+Math.cos(a)*22,sy=player.y+Math.sin(a)*22;
    bullets.push({x:sx,y:sy,vx:Math.cos(a)*770,vy:Math.sin(a)*770,life:.45,damage:1}); particles.push({x:sx,y:sy,vx:Math.cos(a)*rand(45,95),vy:Math.sin(a)*rand(45,95),life:.08,max:.08,color:'#f7e7a5',size:5});shake=Math.max(shake,2.4);updateHud();
  }
  function collideObstacle(x,y,r){for(const o of obstacles){let cx=clamp(x,o.x-o.w/2,o.x+o.w/2),cy=clamp(y,o.y-o.h/2,o.y+o.h/2);if((x-cx)**2+(y-cy)**2<r*r)return true}return false}
  function moveEntity(e,dx,dy){let nx=clamp(e.x+dx,18,WORLD.w-18),ny=clamp(e.y+dy,18,WORLD.h-18);if(!collideObstacle(nx,e.y,e.r))e.x=nx;if(!collideObstacle(e.x,ny,e.r))e.y=ny;}
  function damagePlayer(amount){if(player.invuln>0)return;if(player.armor>0){player.armor=Math.max(0,player.armor-amount);amount*=.25}player.hp-=amount;player.invuln=.55;damageFlash=.4;shake=8;ui.flash.classList.add('on');setTimeout(()=>ui.flash.classList.remove('on'),190);if(player.hp<=0){player.hp=0;gameOver()}updateHud()}
  function gameOver(){state='over';ui.finalWave.textContent=String(wave).padStart(2,'0');ui.finalKills.textContent=String(kills).padStart(2,'0');ui.finalScore.textContent=String(score).padStart(6,'0');$('#endTitle').innerHTML='SIGNAL<br><em>LOST.</em>';$('#endCopy').textContent='The city is still out there. You held the line.';ui.end.classList.remove('hidden')}
  function update(dt){frame++;if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show')}if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)ui.message.classList.remove('show')}if(state!=='playing')return;
    player.invuln=Math.max(0,player.invuln-dt);player.dashAt=Math.max(0,player.dashAt-dt);player.reloadAt=Math.max(0,player.reloadAt-dt);
    if(player.reloadAt===0&&ui.reload.classList.contains('show')){let n=Math.min(12-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;ui.reload.classList.remove('show');updateHud()}
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+(stick.active?stick.dx:0),dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+(stick.active?stick.dy:0);let len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len}moveEntity(player,dx*player.speed*dt,dy*player.speed*dt);
    const r=canvas.getBoundingClientRect();if(mouse.seen){let wx=player.x+(mouse.x-r.left-W/2),wy=player.y+(mouse.y-r.top-H/2);player.angle=Math.atan2(wy-player.y,wx-player.x)}else if(enemies.length){let target=enemies.reduce((a,b)=>dist2(a,player)<dist2(b,player)?a:b);player.angle=Math.atan2(target.y-player.y,target.x-player.x)}if(mouse.down||touchFire)shoot();
    if(waveLeft>0){let every=Math.max(.35,1.05-wave*.035);if(frame%Math.max(1,Math.floor(every*60))===0){spawnEnemy();waveLeft--}}
    for(let i=enemies.length-1;i>=0;i--){let e=enemies[i];e.flash=Math.max(0,e.flash-dt);e.attack-=dt;let a=Math.atan2(player.y-e.y,player.x-e.x),d=Math.hypot(player.x-e.x,player.y-e.y);e.angle=a;if(d>e.r+player.r+4){moveEntity(e,Math.cos(a)*e.speed*dt,Math.sin(a)*e.speed*dt)}else if(e.attack<=0){damagePlayer(e.runner?8:11);e.attack=.9;spawnBurst(e.x,e.y,'#a4b777',3)} }
    for(let i=bullets.length-1;i>=0;i--){let b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||collideObstacle(b.x,b.y,2)){bullets.splice(i,1);continue}let hit=-1;for(let j=0;j<enemies.length;j++)if((enemies[j].x-b.x)**2+(enemies[j].y-b.y)**2<(enemies[j].r+4)**2){hit=j;break}if(hit>=0){let e=enemies[hit];e.hp-=1;e.flash=.1;spawnBurst(b.x,b.y,'#d9e3a1',4);bullets.splice(i,1);if(e.hp<=0){kills++;score+=e.runner?100:75;decals.push({x:e.x,y:e.y,r:rand(9,18),alpha:.5});if(Math.random()<.13)drops.push({x:e.x,y:e.y,type:Math.random()<.72?'ammo':'med',life:10});spawnBurst(e.x,e.y,'#78945d',12);enemies.splice(hit,1);updateHud();if(waveLeft===0&&enemies.length===0&&intermission===0)finishWave()}}}
    for(let i=drops.length-1;i>=0;i--){let d=drops[i];d.life-=dt;if(d.life<=0){drops.splice(i,1);continue}if(dist2(d,player)<28**2){if(d.type==='ammo'){player.reserve=Math.min(180,player.reserve+24);showMessage('AMMO CACHE  //  +24')}else{player.hp=Math.min(100,player.hp+25);showMessage('MED KIT  //  +25 VITALS')}score+=25;drops.splice(i,1);updateHud()}}
    for(let i=particles.length-1;i>=0;i--){let p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.93;p.vy*=.93;p.life-=dt;if(p.life<=0)particles.splice(i,1)}
    if(waveLeft===0&&enemies.length===0&&intermission>0){intermission-=dt;if(intermission<=0)startWave()}
    if(shake>0)shake=Math.max(0,shake-dt*20);if(player.invuln>0&&frame%6<3){} 
  }
  function drawGround(camX,camY){ctx.fillStyle='#19211e';ctx.fillRect(0,0,W,H);const tile=96,startX=Math.floor(camX/tile)-1,startY=Math.floor(camY/tile)-1,endX=Math.ceil((camX+W)/tile)+1,endY=Math.ceil((camY+H)/tile)+1;
    for(let tx=startX;tx<endX;tx++)for(let ty=startY;ty<endY;ty++){let x=tx*tile-camX,y=ty*tile-camY,h=hash(tx,ty);ctx.fillStyle=h>.78?'#202924':h<.15?'#151d1a':'#1a221e';ctx.fillRect(x,y,tile-1,tile-1);if(h>.86){ctx.strokeStyle='#87916e12';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+15,y+tile*.65);ctx.lineTo(x+tile*.55,y+tile*.55);ctx.lineTo(x+tile*.77,y+20);ctx.stroke()}if(h<.08){ctx.fillStyle='#a1a58014';ctx.fillRect(x+12,y+15,2,2);ctx.fillRect(x+19,y+21,1,1)}}
    ctx.strokeStyle='#d5ee6b15';ctx.lineWidth=1;for(let x=0;x<W;x+=tile*2){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=tile*2){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    // worn perimeter markings
    ctx.strokeStyle='#c2cd9b36';ctx.lineWidth=2;ctx.setLineDash([18,14]);ctx.strokeRect(WORLD.w/2-510-camX,WORLD.h/2-385-camY,1020,770);ctx.setLineDash([]);
    for(const d of decals){let x=d.x-camX,y=d.y-camY;ctx.fillStyle=`rgba(103,37,32,${d.alpha})`;ctx.beginPath();ctx.ellipse(x,y,d.r*1.35,d.r*.8,rand(-.1,.1),0,Math.PI*2);ctx.fill()}
  }
  function drawObstacle(o,cx,cy){let x=o.x-cx,y=o.y-cy;ctx.save();ctx.translate(x,y);if(o.type==='crate'){ctx.fillStyle='#101714';ctx.fillRect(-o.w/2+5,-o.h/2+7,o.w,o.h);ctx.fillStyle='#34372a';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.strokeStyle='#74734c';ctx.lineWidth=2;ctx.strokeRect(-o.w/2+4,-o.h/2+4,o.w-8,o.h-8);ctx.beginPath();ctx.moveTo(-o.w/2+6,-o.h/2+6);ctx.lineTo(o.w/2-6,o.h/2-6);ctx.moveTo(o.w/2-6,-o.h/2+6);ctx.lineTo(-o.w/2+6,o.h/2-6);ctx.stroke()}else{ctx.fillStyle='#111815';ctx.fillRect(-o.w/2+4,-o.h/2+7,o.w,o.h);ctx.fillStyle='#303830';ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.fillStyle='#666d58';ctx.fillRect(-o.w/2,-o.h/2,o.w,5);ctx.fillStyle='#a7b57b';ctx.fillRect(-o.w/2+8,0,o.w-16,3);ctx.fillStyle='#151b18';for(let i=-o.w/2+8;i<o.w/2;i+=14)ctx.fillRect(i,-o.h/2+8,5,4)}ctx.restore()}
  function drawEnemy(e,cx,cy){let x=e.x-cx,y=e.y-cy;ctx.save();ctx.translate(x,y);ctx.rotate(e.angle);ctx.fillStyle='#06090980';ctx.beginPath();ctx.ellipse(1,5,e.r+3,e.r*.72,0,0,Math.PI*2);ctx.fill();let col=e.flash>0?'#dce7bc':e.runner?'#777957':'#606b50';ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(0,0,e.r*1.12,e.r*.77,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=e.flash>0?'#e4e6d4':'#99a176';ctx.beginPath();ctx.arc(e.r*.52,-e.r*.35,e.r*.43,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dd6951';ctx.fillRect(e.r*.72,-e.r*.51,2,2);ctx.strokeStyle='#42483b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-2,3);ctx.lineTo(-e.r-4,9);ctx.stroke();if(e.maxHp>1){ctx.fillStyle='#0009';ctx.fillRect(-e.r,-e.r-8,e.r*2,2);ctx.fillStyle='#e97659';ctx.fillRect(-e.r,-e.r-8,e.r*2*(e.hp/e.maxHp),2)}ctx.restore()}
  function drawPlayer(cx,cy){let x=player.x-cx,y=player.y-cy;ctx.save();ctx.translate(x,y);ctx.rotate(player.angle);ctx.fillStyle='#0009';ctx.beginPath();ctx.ellipse(-1,5,19,12,0,0,Math.PI*2);ctx.fill();if(player.invuln>0&&frame%6<3)ctx.globalAlpha=.5;ctx.fillStyle='#b8b59b';ctx.beginPath();ctx.ellipse(0,0,14,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4b5950';ctx.beginPath();ctx.ellipse(-2,0,8,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d4cda9';ctx.beginPath();ctx.arc(4,-2,5.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3b443b';ctx.fillRect(5,-3,19,6);ctx.fillStyle='#d5ee6b';ctx.fillRect(17,-1,7,2);ctx.fillStyle='#8c8d70';ctx.fillRect(-5,5,4,8);ctx.restore();}
  function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);let cx=clamp(player.x-W/2,0,WORLD.w-W),cy=clamp(player.y-H/2,0,WORLD.h-H);let sx=shake?rand(-shake,shake):0,sy=shake?rand(-shake,shake):0;ctx.save();ctx.translate(sx,sy);drawGround(cx,cy);
    for(const o of obstacles)drawObstacle(o,cx,cy);
    for(const d of drops){let x=d.x-cx,y=d.y-cy;ctx.save();ctx.translate(x,y);ctx.shadowBlur=15;ctx.shadowColor=d.type==='med'?'#f15c50':'#d5ee6b';ctx.fillStyle=d.type==='med'?'#f15c50':'#d5ee6b';ctx.beginPath();ctx.arc(0,0,8+Math.sin(frame*.12)*1.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#15201a';if(d.type==='med'){ctx.fillRect(-1,-5,2,10);ctx.fillRect(-5,-1,10,2)}else{ctx.fillRect(-4,-3,8,6);ctx.fillRect(-1,-5,2,10)}ctx.restore()}
    for(const e of enemies)drawEnemy(e,cx,cy);
    for(const b of bullets){ctx.strokeStyle='#f8e9ae';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.x-cx,b.y-cy);ctx.lineTo(b.x-cx-b.vx*.025,b.y-cy-b.vy*.025);ctx.stroke()}
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-cx,p.y-cy,p.size,p.size)}ctx.globalAlpha=1;drawPlayer(cx,cy);
    // subtle lamp pools and atmosphere
    let glow=ctx.createRadialGradient(W*.5,H*.48,10,W*.5,H*.48,Math.max(W,H)*.62);glow.addColorStop(0,'#c7d28d08');glow.addColorStop(1,'#00000035');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.restore();
    if(mouse.seen){ui.cross.style.left=mouse.x+'px';ui.cross.style.top=mouse.y+'px'}else{ui.cross.style.left=(W/2)+'px';ui.cross.style.top=(H/2)+'px'}
    const nearest=obstacles.find(o=>Math.abs(player.x-o.x)<o.w/2+42&&Math.abs(player.y-o.y)<o.h/2+42);if(nearest&&state==='playing'){ui.interaction.classList.add('show');$('#interactionText').textContent='COVER BLOCKS HOSTILES'}else ui.interaction.classList.remove('show');
  }
  function loop(t){let dt=Math.min(.033,(t-last)/1000||0);last=t;update(dt);draw();requestAnimationFrame(loop)}requestAnimationFrame(loop);
  function pointer(e){const r=canvas.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;mouse.seen=true}
  canvas.addEventListener('pointermove',pointer);canvas.addEventListener('pointerdown',e=>{pointer(e);if(e.button===0){mouse.down=true;canvas.setPointerCapture?.(e.pointerId);shoot()}});window.addEventListener('pointerup',()=>mouse.down=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{let k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys.add(k);if(k==='r')reload();if(k===' '&&!e.repeat)doDash();if(k==='escape'||k==='p'){if(state==='playing'){state='paused';ui.pause.classList.remove('hidden')}else if(state==='paused'){state='playing';ui.pause.classList.add('hidden')}}});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  ui.startBtn.addEventListener('click',startGame);ui.retry.addEventListener('click',startGame);ui.resume.addEventListener('click',()=>{state='playing';ui.pause.classList.add('hidden')});ui.pauseBtn.addEventListener('click',()=>{if(state==='playing'){state='paused';ui.pause.classList.remove('hidden')}else if(state==='paused'){state='playing';ui.pause.classList.add('hidden')}});$('#closeTip').addEventListener('click',()=>ui.help.classList.add('closed'));
  $('#reloadTouch').addEventListener('pointerdown',e=>{e.preventDefault();reload()});$('#dashTouch').addEventListener('pointerdown',e=>{e.preventDefault();doDash()});$('#fireTouch').addEventListener('pointerdown',e=>{e.preventDefault();touchFire=true});window.addEventListener('pointerup',()=>touchFire=false);
  const stickEl=$('#touchStick');stickEl.addEventListener('pointerdown',e=>{e.preventDefault();stick.active=true;stick.id=e.pointerId;stickEl.setPointerCapture(e.pointerId);setStick(e)});stickEl.addEventListener('pointermove',e=>{if(stick.active&&e.pointerId===stick.id)setStick(e)});function setStick(e){let r=stickEl.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),m=Math.hypot(dx,dy),max=r.width*.34;if(m>max){dx*=max/m;dy*=max/m}stick.dx=dx/max;stick.dy=dy/max;let knob=stickEl.firstElementChild;knob.style.transform=`translate(${dx}px,${dy}px)`}function stopStick(){stick.active=false;stick.dx=stick.dy=0;stickEl.firstElementChild.style.transform=''}stickEl.addEventListener('pointerup',stopStick);stickEl.addEventListener('pointercancel',stopStick);
  window.addEventListener('blur',()=>{mouse.down=false;touchFire=false;keys.clear()});
})();
