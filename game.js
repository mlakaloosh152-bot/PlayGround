import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#101c18');
scene.fog = new THREE.FogExp2('#101c18', 0.027);
const camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.1, 100);
const clock = new THREE.Clock();
const world = new THREE.Group(); scene.add(world);
const colliders = [];
const enemies = [];
const bullets = [];
const pickups = [];
let running = false, paused = false, ended = false;
let score = 0, health = 100, wave = 0, ammo = 12, reserve = 60;
let fireHeld = false, reloadTimer = 0, shootCooldown = 0, spawnTimer = 0, waveWait = 0, dashTime = 0, invuln = 0, hitTimer = 0, toastTimer = 0;
let weapon = 'SERVICE PISTOL', weaponDamage = 1, weaponRate = .32, weaponMag = 12, weaponReserve = 60;
let player, playerRig, playerGun, arenaTime = 0;
const keys = new Set();
const input = { x: 0, z: 0 };
const $ = (id) => document.getElementById(id);
const ui = { start:$('start-button'), mission:$('mission-card'), hud:$('hud'), mobile:$('mobile-controls'), wave:$('wave-number'), caption:$('wave-caption'), enemies:$('enemy-count'), progress:$('wave-progress'), score:$('score'), health:$('health-value'), healthBar:$('health-bar'), mag:$('ammo-mag'), reserve:$('ammo-reserve'), weapon:$('weapon-name'), reload:$('reload-toast'), interaction:$('interaction'), toast:$('toast'), hit:$('hit-flash'), pause:$('pause-overlay'), end:$('end-overlay') };

function mat(color, roughness=.8, metalness=0, emissive=null, intensity=0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: emissive || color, emissiveIntensity: intensity }); }
const materials = {
  floor: mat('#29362d', .94), tiles: mat('#37443a', .9), concrete: mat('#536052', .85), dark: mat('#17221d'), metal: mat('#45534d', .55, .7), rust: mat('#784d37', .8), leaf: mat('#3d6545'), leaf2: mat('#7c9850'), glow: mat('#b8ef6c', .4, .1, '#a2f453', 2.8), orangeGlow: mat('#ff784f', .4, .1, '#ff482a', 2), glass: new THREE.MeshStandardMaterial({color:'#3e7065',roughness:.16,metalness:.25,transparent:true,opacity:.22,side:THREE.DoubleSide}), player: mat('#c4d2b7',.65), playerDark: mat('#263a35',.7), skin: mat('#b78f6c'), zombie: mat('#788e75',.9), zombieDark: mat('#26352d'), red: mat('#a7523f',.75), yellow:mat('#c5a45a',.7)
};
function mesh(geometry, material, parent=world, x=0,y=0,z=0) { const m=new THREE.Mesh(geometry,material); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m; }
function box(parent,x,y,z,sx,sy,sz,material,rx=0,ry=0,rz=0){const m=mesh(new THREE.BoxGeometry(sx,sy,sz),material,parent,x,y,z);m.rotation.set(rx,ry,rz);return m;}
function cylinder(parent,x,y,z,rt,rb,h,material,segments=12){const m=mesh(new THREE.CylinderGeometry(rt,rb,h,segments),material,parent,x,y,z);return m;}
function addCollider(x,z,sx,sz){colliders.push({x,z,sx,sz});}

// A rain-streaked, overgrown research conservatory built from original low-poly scenery.
function buildWorld(){
  const floor=mesh(new THREE.PlaneGeometry(38,30),materials.floor,world,0,-.12,0);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;
  for(let x=-17;x<=17;x+=2) for(let z=-13;z<=13;z+=2){if(Math.abs(x)>14||Math.abs(z)>10)continue;const tile=mesh(new THREE.PlaneGeometry(1.94,1.94),materials.tiles,world,x,-.105,z);tile.rotation.x=-Math.PI/2;tile.receiveShadow=true;}
  // perimeter walls and ribbed greenhouse framework
  for(const [x,z,sx,sz] of [[0,-14,38,1],[0,14,38,1],[-19,0,1,29],[19,0,1,29]]){box(world,x,1.2,z,sx,2.4,sz,materials.concrete);addCollider(x,z,sx,sz);}
  for(const x of [-16,-12,12,16]){cylinder(world,x,5,-11,.14,.14,10,materials.metal);cylinder(world,x,5,11,.14,.14,10,materials.metal);}
  for(let x=-16;x<=16;x+=4){box(world,x,8,0,.12,.12,22,materials.metal);}
  // shattered greenhouse panels and overhead lamps
  for(let x=-14;x<=14;x+=7)for(let z=-8;z<=8;z+=8){const p=mesh(new THREE.PlaneGeometry(6.7,7.7),materials.glass,world,x,7.7,z);p.rotation.x=Math.PI/2;}
  for(const [x,z] of [[-11,-7],[0,-7],[11,-7],[-11,7],[0,7],[11,7]]){
    box(world,x,6.65,z,.25,.25,2.2,materials.dark);box(world,x,6.48,z,.12,.09,1.6,materials.glow);
    const light=new THREE.PointLight('#b8ef6c',9,8,2);light.position.set(x,5.9,z);world.add(light);
  }
  // planters / overgrown islands
  const beds=[[-10,-4,4,2],[-3,-7,3,2],[5,-5,4,2],[11,1,2.5,4],[-11,5,3.5,2],[1,6,4,2],[7,2,2,2]];
  for(const [x,z,sx,sz] of beds){box(world,x,.1,z,sx,.5,sz,materials.rust);box(world,x,.36,z,sx-.25,.12,sz-.25,materials.dark);addCollider(x,z,sx,sz);for(let n=0;n<6;n++){const lx=x+(Math.random()-.5)*(sx-.5),lz=z+(Math.random()-.5)*(sz-.5);const stem=cylinder(world,lx,.8,lz,.035,.05,.95,materials.leaf,7);stem.rotation.z=(Math.random()-.5)*.24;const leaf=mesh(new THREE.IcosahedronGeometry(.36+Math.random()*.25,0),Math.random()>.5?materials.leaf:materials.leaf2,world,lx,.95+Math.random()*.3,lz);leaf.scale.set(1,.55,1.25);}}
  // debris stacks, specimen tanks, and orange-lit breach
  for(const [x,z] of [[-15,-7],[-15,7],[15,-8],[15,8],[-4,10],[4,-10]]){box(world,x,.5,z,1.5,1,1.2,materials.metal);box(world,x,.15,z,1.7,.2,1.35,materials.dark);addCollider(x,z,1.5,1.2);}
  for(const [x,z] of [[-16,0],[16,0]]){cylinder(world,x,1.35,z,.9,.9,2.7,materials.glass,16);cylinder(world,x,1.3,z,.67,.67,2.3,materials.leaf,12);cylinder(world,x,2.75,z,1,.95,.18,materials.metal,16);cylinder(world,x,.08,z,1,.95,.18,materials.metal,16);}
  // salvage bench (purchasable weapon) and supply beacon
  const bx=12,bz=-9;box(world,bx,.55,bz,2,.9,1.1,materials.dark);box(world,bx,.99,bz,2.05,.08,1.15,materials.metal);box(world,bx,1.08,bz,.9,.06,.12,materials.glow);box(world,bx-.55,.43,bz,.08,.8,.08,materials.orangeGlow);box(world,bx+.55,.43,bz,.08,.8,.08,materials.orangeGlow);addCollider(bx,bz,2,1.1);
  const sign=box(world,bx,1.68,bz-.55,1.3,.34,.06,materials.dark);sign.rotation.x=-.1;
  const txt=makeLabel('SALVAGE', '#c8f169');txt.position.set(bx,1.7,bz-.59);world.add(txt);
  // door frame and warning lamps
  box(world,0,1.2,-13.45,7,2.4,.22,materials.dark);box(world,0,2.22,-13.28,5,.16,.12,materials.orangeGlow);box(world,-2.4,1,-13.25,.12,1.8,.12,materials.glow);box(world,2.4,1,-13.25,.12,1.8,.12,materials.glow);
  // scattered warning strips
  for(let i=0;i<5;i++){const x=-5+i*2.5;box(world,x,.015,0,.035,.02,20,i%2?materials.orangeGlow:materials.glow);}
  // atmosphere specks
  for(let i=0;i<65;i++){const s=mesh(new THREE.SphereGeometry(.025+Math.random()*.025,5,5),i%4?materials.glow:materials.orangeGlow,world,(Math.random()-.5)*32,1+Math.random()*5,(Math.random()-.5)*22);s.userData.float=Math.random()*6;}
}
function makeLabel(text,color){const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.clearRect(0,0,256,64);ctx.fillStyle=color;ctx.font='bold 34px monospace';ctx.textAlign='center';ctx.fillText(text,128,43);const tex=new THREE.CanvasTexture(c);const m=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));m.scale.set(1.65,.42,1);return m;}

function createPlayer(){
  player=new THREE.Group();player.position.set(0,0,2);world.add(player);
  playerRig=new THREE.Group();player.add(playerRig);
  cylinder(playerRig,0,.9,0,.34,.31,1.05,materials.playerDark,10);
  const torso=mesh(new THREE.CapsuleGeometry(.34,.48,4,8),materials.player,playerRig,0,1.12,0);torso.castShadow=true;
  const head=mesh(new THREE.SphereGeometry(.24,10,8),materials.skin,playerRig,0,1.88,0);head.scale.y=1.08;
  const helmet=mesh(new THREE.SphereGeometry(.27,10,7,0,Math.PI*2,0,Math.PI*.52),materials.playerDark,playerRig,0,2.01,-.015);helmet.rotation.x=-.06;
  for(const side of [-1,1]){const arm=mesh(new THREE.CapsuleGeometry(.105,.5,3,6),materials.playerDark,playerRig,side*.37,1.15,-.08);arm.rotation.z=side*-.22;const leg=mesh(new THREE.CapsuleGeometry(.13,.5,3,6),materials.playerDark,playerRig,side*.17,.42,0);leg.rotation.z=side*.04;}
  playerGun=new THREE.Group();playerGun.position.set(.35,1.25,-.48);playerRig.add(playerGun);
  box(playerGun,0,0,-.28,.15,.13,.65,materials.metal);box(playerGun,0,-.12,-.05,.12,.22,.14,materials.dark);box(playerGun,0,.04,-.55,.09,.08,.18,materials.glow);
  const muzzle=mesh(new THREE.SphereGeometry(.08,8,6),materials.orangeGlow,playerGun,0,.02,-.68);muzzle.visible=false;player.userData.muzzle=muzzle;
  player.userData.lastMove=0;
}

function makeEnemy(type='shambler'){
  const g=new THREE.Group();const scale=type==='brute'?1.3:1;
  const bodymat=type==='brute'?materials.red:materials.zombie;
  cylinder(g,0,.9,0,.32*scale,.35*scale,1.05*scale,materials.zombieDark,9);
  const body=mesh(new THREE.CapsuleGeometry(.32*scale,.48*scale,3,7),bodymat,g,0,1.18*scale,0);body.rotation.z=(Math.random()-.5)*.16;
  const head=mesh(new THREE.SphereGeometry(.22*scale,8,7),materials.zombie,g,(Math.random()-.5)*.08,1.95*scale,.02);head.scale.y=1.1;
  for(const side of [-1,1]){
    const arm=mesh(new THREE.CapsuleGeometry(.1*scale,.52*scale,3,6),bodymat,g,side*.38*scale,1.15*scale,-.04);arm.rotation.z=side*-.72;
    const hand=mesh(new THREE.SphereGeometry(.11*scale,7,6),materials.skin,g,side*.66*scale,.88*scale,-.07);
    const leg=mesh(new THREE.CapsuleGeometry(.12*scale,.45*scale,3,6),materials.zombieDark,g,side*.17*scale,.39*scale,0);
  }
  const eye=mesh(new THREE.SphereGeometry(.045*scale,6,5),materials.orangeGlow,g,-.085*scale,1.98*scale,-.19*scale);const eye2=mesh(new THREE.SphereGeometry(.045*scale,6,5),materials.orangeGlow,g,.085*scale,1.98*scale,-.19*scale);
  const shadow=mesh(new THREE.CircleGeometry(.42*scale,12),new THREE.MeshBasicMaterial({color:'#050908',transparent:true,opacity:.5,depthWrite:false}),g,0,.015,0);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
  g.position.set((Math.random()-.5)*28,0,-12.1);world.add(g);
  const hp=(type==='brute'?5:2)+Math.floor(wave*.24);
  enemies.push({group:g,hp,maxHp:hp,type,speed:(type==='brute'?1.05:1.28)+Math.min(wave*.025,.42),attack:0,phase:Math.random()*6,alive:true});
}
function addBullet(from,to,hitEnemy){
  const start=from.clone();const end=to.clone();const geo=new THREE.BufferGeometry().setFromPoints([start,end]);const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:hitEnemy?'#c8f169':'#ffb16e',transparent:true,opacity:.92}));scene.add(line);bullets.push({line,life:.075});
  const spark=mesh(new THREE.SphereGeometry(.09,6,5),materials.orangeGlow,world,end.x,.9,end.z);spark.userData.life=.15;pickups.push(spark);
}

function fire(){
  if(!running||paused||ended||shootCooldown>0||reloadTimer>0)return;
  if(ammo<=0){reload();return;}
  ammo--;shootCooldown=weaponRate;ui.mag.textContent=ammo;
  let target=null,best=15;
  for(const e of enemies){if(!e.alive)continue;const d=player.position.distanceTo(e.group.position);if(d<best){best=d;target=e;}}
  const origin=new THREE.Vector3();playerGun.getWorldPosition(origin);
  let targetPos;
  if(target){targetPos=target.group.position.clone().add(new THREE.Vector3(0,1.05,0));player.rotation.y=Math.atan2(target.group.position.x-player.position.x,target.group.position.z-player.position.z);}
  else{const dir=new THREE.Vector3(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));targetPos=player.position.clone().add(dir.multiplyScalar(10)).add(new THREE.Vector3(0,1,0));}
  playerGun.rotation.x=-.02;addBullet(origin,targetPos,!!target);player.userData.muzzle.visible=true;setTimeout(()=>{if(player?.userData.muzzle)player.userData.muzzle.visible=false;},55);
  if(target){target.hp-=weaponDamage;target.group.scale.setScalar(1.06);setTimeout(()=>{if(target.alive)target.group.scale.setScalar(target.type==='brute'?1.3:1);},65);if(target.hp<=0)killEnemy(target);}
}
function killEnemy(e){if(!e.alive)return;e.alive=false;score+=e.type==='brute'?150:100;world.remove(e.group);const i=enemies.indexOf(e);if(i>=0)enemies.splice(i,1);if(Math.random()<.14){const orb=mesh(new THREE.IcosahedronGeometry(.19,0),materials.glow,world,e.group.position.x,.35,e.group.position.z);orb.userData.pickup='health';orb.userData.life=12;pickups.push(orb);}updateUI();}
function reload(){if(reloadTimer>0||ammo===weaponMag||reserve<=0||!running||paused)return;reloadTimer=1.35;ui.reload.classList.remove('hidden');}
function completeReload(){const n=Math.min(weaponMag-ammo,reserve);ammo+=n;reserve-=n;ui.mag.textContent=ammo;ui.reserve.textContent=reserve;reloadTimer=0;ui.reload.classList.add('hidden');}
function buyWeapon(){if(score<450){showToast('NEED 450 FIELD CREDITS');return;}score-=450;weapon='COIL CARBINE';weaponDamage=2;weaponRate=.18;weaponMag=24;weaponReserve=96;ammo=24;reserve=96;ui.weapon.textContent=weapon;ui.mag.textContent=ammo;ui.reserve.textContent=reserve;showToast('COIL CARBINE ONLINE');updateUI();}
function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');toastTimer=1.8;}
function updateUI(){ui.score.textContent=String(score).padStart(4,'0');ui.enemies.textContent=enemies.length;ui.health.textContent=Math.max(0,Math.ceil(health));ui.healthBar.style.width=`${Math.max(0,health)}%`;ui.healthBar.style.background=health<30?'#ff7955':'#c8f169';ui.wave.textContent=String(wave).padStart(2,'0');ui.caption.textContent=wave<2?'FIRST CONTACT':wave<4?'GROWING THREAT':wave<7?'OVERRUN':'NO WAY OUT';ui.progress.style.width=`${wave?Math.max(0,Math.min(100,(1-enemies.length/(wave*4+4))*100)):0}%`;}
function beginWave(){wave++;const count=4+wave*2;for(let i=0;i<count;i++)setTimeout(()=>{if(running&&!ended){makeEnemy(wave%4===0&&i===count-1?'brute':'shambler');updateUI();}},i*480);spawnTimer=count*.48+1;showToast(`INCIDENT ${String(wave).padStart(2,'0')} — ${count} HOSTILES INCOMING`);updateUI();}
function damagePlayer(amount){if(invuln>0)return;health-=amount;invuln=.7;hitTimer=.16;ui.hit.style.borderWidth='14px';if(health<=0){health=0;updateUI();finishGame();}else updateUI();}
function finishGame(){ended=true;running=false;ui.end.classList.remove('hidden');$('end-eyebrow').textContent=`SIGNAL LOST // INCIDENT ${String(wave).padStart(2,'0')}`;$('end-title').textContent='The dark got you.';$('end-copy').textContent=`You held the atrium through ${wave} ${wave===1?'incident':'incidents'} and banked ${score} field credits.`;}
function startGame(){
  ui.mission.classList.add('hidden');ui.end.classList.add('hidden');ui.pause.classList.add('hidden');ui.hud.classList.remove('hidden');
  if(matchMedia('(pointer: coarse)').matches){ui.mobile.classList.remove('hidden');$('controls-hint').classList.add('hidden');}else{$('controls-hint').classList.remove('hidden');}
  score=0;health=100;wave=0;ammo=12;reserve=60;weapon='SERVICE PISTOL';weaponDamage=1;weaponRate=.32;weaponMag=12;enemies.splice(0).forEach(e=>world.remove(e.group));pickups.splice(0).forEach(p=>world.remove(p));running=true;paused=false;ended=false;spawnTimer=0;waveWait=0;player.position.set(0,0,2);player.rotation.y=0;ui.weapon.textContent=weapon;ui.mag.textContent=ammo;ui.reserve.textContent=reserve;updateUI();beginWave();clock.getDelta();}
function togglePause(){if(!running||ended)return;paused=!paused;ui.pause.classList.toggle('hidden',!paused);}

function isBlocked(x,z){if(Math.abs(x)>17.25||Math.abs(z)>12.5)return true;for(const c of colliders){if(Math.abs(x-c.x)<c.sx/2+.38&&Math.abs(z-c.z)<c.sz/2+.38)return true;}return false;}
function movePlayer(dt){let x=input.x,z=input.z;if(keys.has('KeyA')||keys.has('ArrowLeft'))x-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))x+=1;if(keys.has('KeyW')||keys.has('ArrowUp'))z-=1;if(keys.has('KeyS')||keys.has('ArrowDown'))z+=1;const len=Math.hypot(x,z);if(len>1){x/=len;z/=len;}
  if(dashTime>0){dashTime-=dt;const v=8.5*dt;const nx=player.position.x+Math.sin(player.rotation.y)*v,nz=player.position.z+Math.cos(player.rotation.y)*v;if(!isBlocked(nx,player.position.z))player.position.x=nx;if(!isBlocked(player.position.x,nz))player.position.z=nz;}
  else if(len>.04){const speed=4.5;const angle=Math.atan2(x,z);player.rotation.y=angle;const dx=x*speed*dt,dz=z*speed*dt;if(!isBlocked(player.position.x+dx,player.position.z))player.position.x+=dx;if(!isBlocked(player.position.x,player.position.z+dz))player.position.z+=dz;}
  playerRig.position.y=len>.04?Math.sin(arenaTime*12)*.035:0;
}
function updateEnemies(dt){for(const e of [...enemies]){const dx=player.position.x-e.group.position.x,dz=player.position.z-e.group.position.z,d=Math.hypot(dx,dz);e.phase+=dt*7;
    if(d>1.05){const nx=e.group.position.x+dx/d*e.speed*dt,nz=e.group.position.z+dz/d*e.speed*dt;if(!isBlocked(nx,e.group.position.z))e.group.position.x=nx;if(!isBlocked(e.group.position.x,nz))e.group.position.z=nz;e.group.rotation.y=Math.atan2(dx,dz);e.group.position.y=Math.abs(Math.sin(e.phase))*.045;}
    else{e.attack-=dt;if(e.attack<=0){damagePlayer(e.type==='brute'?18:10);e.attack=.9;}}
    // Simple personal space; no crowd overlap.
    for(const other of enemies){if(other===e||!other.alive)continue;const ox=e.group.position.x-other.group.position.x,oz=e.group.position.z-other.group.position.z,od=Math.hypot(ox,oz);if(od>0&&od<.68){e.group.position.x+=ox/od*dt*.36;e.group.position.z+=oz/od*dt*.36;}}
  }}
function updateCamera(dt){const target=new THREE.Vector3(player.position.x,0,player.position.z);const desired=new THREE.Vector3(player.position.x,12.5,player.position.z+12.5);camera.position.lerp(desired,1-Math.exp(-dt*5));camera.lookAt(target.x,0,target.z-1);}
function updateInteract(){const d=Math.hypot(player.position.x-12,player.position.z+9);ui.interaction.textContent=d<2.1?'[ E ]  SALVAGE BENCH  ·  450 CREDITS':'';}
function update(dt){arenaTime+=dt;if(!running||paused)return;movePlayer(dt);updateEnemies(dt);updateCamera(dt);shootCooldown=Math.max(0,shootCooldown-dt);if(fireHeld)fire();if(invuln>0)invuln-=dt;if(hitTimer>0){hitTimer-=dt;if(hitTimer<=0)ui.hit.style.borderWidth='0';}if(reloadTimer>0){reloadTimer-=dt;if(reloadTimer<=0)completeReload();}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
  if(enemies.length===0&&spawnTimer<=0){waveWait+=dt;if(waveWait>2.2){waveWait=0;beginWave();}}else if(spawnTimer>0)spawnTimer-=dt;
  for(let i=bullets.length-1;i>=0;i--){bullets[i].life-=dt;if(bullets[i].life<=0){scene.remove(bullets[i].line);bullets.splice(i,1);}}
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.userData.life-=dt;p.rotation.y+=dt*2;if(p.userData.pickup==='health'){p.position.y=.35+Math.sin(arenaTime*3)*.1;if(p.position.distanceTo(player.position)<1){health=Math.min(100,health+18);showToast('VITALS RESTORED');updateUI();world.remove(p);pickups.splice(i,1);continue;}}else if(p.userData.life<=0){world.remove(p);pickups.splice(i,1);}}
  updateInteract();updateUI();
}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);update(dt);if(!running){arenaTime+=dt;for(const e of world.children){if(e.userData.float!==undefined)e.position.y=1.5+Math.sin(arenaTime*1.3+e.userData.float)*.6;}}renderer.render(scene,camera);}

buildWorld();createPlayer();
scene.add(new THREE.HemisphereLight('#a6c5a4','#1a221e',1.45));const key=new THREE.DirectionalLight('#f0d7a4',2.4);key.position.set(-8,14,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-22;key.shadow.camera.right=22;key.shadow.camera.top=20;key.shadow.camera.bottom=-20;key.shadow.bias=-.0004;scene.add(key);
const fill=new THREE.PointLight('#4b9e8a',18,24,2);fill.position.set(-8,4,-3);scene.add(fill);const orange=new THREE.PointLight('#ff754e',13,14,2);orange.position.set(14,3,-10);scene.add(orange);
player.position.set(0,0,2);camera.position.set(0,13,15);camera.lookAt(0,0,0);

$('start-button').addEventListener('click',startGame);$('restart-button').addEventListener('click',startGame);$('pause-button').addEventListener('click',togglePause);$('resume-button').addEventListener('click',togglePause);$('reload-button').addEventListener('pointerdown',e=>{e.preventDefault();reload();});$('fire-button').addEventListener('pointerdown',e=>{e.preventDefault();fireHeld=true;fire();});$('fire-button').addEventListener('pointerup',()=>fireHeld=false);$('fire-button').addEventListener('pointercancel',()=>fireHeld=false);
window.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyR')reload();if(e.code==='Space'&&running&&!paused&&dashTime<=0){dashTime=.19;invuln=Math.max(invuln,.23);}if(e.code==='KeyE'&&running&&Math.hypot(player.position.x-12,player.position.z+9)<2.1)buyWeapon();if(e.code==='Escape')togglePause();if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();});window.addEventListener('keyup',e=>keys.delete(e.code));canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&running){fireHeld=true;fire();}});window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')fireHeld=false;});
// Drag joystick. Input is normalized relative to the center; safe-area placement is CSS driven.
const zone=$('stick-zone'),knob=$('stick-knob');let stickId=null,stickRect=null;
zone.addEventListener('pointerdown',e=>{e.preventDefault();stickId=e.pointerId;zone.setPointerCapture(stickId);stickRect=zone.getBoundingClientRect();setStick(e);});zone.addEventListener('pointermove',e=>{if(e.pointerId===stickId)setStick(e);});function setStick(e){const cx=stickRect.left+stickRect.width/2,cy=stickRect.top+stickRect.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=34,l=Math.hypot(dx,dy);if(l>max){dx=dx/l*max;dy=dy/l*max;}knob.style.transform=`translate(${dx}px,${dy}px)`;input.x=dx/max;input.z=dy/max;}
function resetStick(e){if(e.pointerId!==stickId)return;stickId=null;input.x=0;input.z=0;knob.style.transform='translate(0,0)';}zone.addEventListener('pointerup',resetStick);zone.addEventListener('pointercancel',resetStick);
window.addEventListener('resize',()=>{renderer.setSize(window.innerWidth,window.innerHeight);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();});
animate();
