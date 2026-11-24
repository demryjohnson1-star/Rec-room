import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const $ = id => document.getElementById(id);
const loading = $("loading"), shell = $("game-shell");
const sceneHost = $("scene");
const socket = window.io ? io() : null;
let connected = false, myId = null, currentRoom = "Plaza";
let cameraThird = true, moveX = 0, moveZ = 0, jumping = false, jumpVelocity = 0;
let yaw = 0, pitch = .15, dragging = false, lastPointer = null;
let lastSent = 0, walkPhase = 0;
const remotePlayers = new Map(), worldObjects = new Map();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bc8df);
scene.fog = new THREE.Fog(0x9bc8df, 32, 95);
const camera = new THREE.PerspectiveCamera(65, innerWidth/innerHeight, .1, 150);
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneHost.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xeaf8ff,0x667c68,2.0));
const sun = new THREE.DirectionalLight(0xffffff,2.2); sun.position.set(-12,22,10); sun.castShadow=true; scene.add(sun);

const mat = (color, roughness=.85) => new THREE.MeshStandardMaterial({color,roughness});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120,120),mat(0x6eaa79));
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
const plaza = new THREE.Group(); scene.add(plaza);
function box(parent,x,y,z,sx,sy,sz,color){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function cylinder(parent,x,y,z,r1,r2,h,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,12),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m}
box(plaza,0,.08,0,22,.16,22,0xb5b9b3);
for(let i=-2;i<=2;i++){box(plaza,i*4,.17,-10,.12,.06,20,0x8c9893);box(plaza,-10,.17,i*4,20,.06,.12,0x8c9893)}
// Friendly stylized hub props
for(const [x,z,c] of [[-8,-7,0xf2bd62],[8,-7,0x6bc8e5],[-8,7,0xe58f9a],[8,7,0x9c91df]]){
  cylinder(plaza,x,.75,z,.48,.58,1.5,c);
  cylinder(plaza,x,1.6,z,.62,.62,.18,0xf4e7c8);
  for(let a=0;a<4;a++){const ang=a*Math.PI/2;box(plaza,x+Math.cos(ang)*.7,1.1,z+Math.sin(ang)*.7,.16,.75,.16,0xeee7d9)}
}
for(let i=0;i<12;i++){
 const a=i*Math.PI/6,x=Math.cos(a)*19,z=Math.sin(a)*19;
 cylinder(scene,x,1.1,z,.35,.6,2.2,0x79563c);
 const crown=new THREE.Mesh(new THREE.SphereGeometry(1.35,10,8),mat(i%2?0x3c9465:0x4caa72));crown.position.set(x,3,z);crown.castShadow=true;scene.add(crown);
}
box(scene,0,2,-22,16,4,1,0x597e9a);
const sign = new THREE.Mesh(new THREE.BoxGeometry(8,1.5,.15),mat(0x18344b));sign.position.set(0,4.7,-21.4);scene.add(sign);

function makeAvatar(color){
 const group=new THREE.Group();
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.72,4,8),mat(color));body.position.y=1.0;body.castShadow=true;group.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.28,12,10),mat(0xf1c8a5));head.position.y=1.72;head.castShadow=true;group.add(head);
 const eyes=new THREE.Mesh(new THREE.BoxGeometry(.12,.045,.025),mat(0x26364a));eyes.position.set(0,1.75,.25);group.add(eyes);
 const armMat=mat(color);
 const arms=[];
 for(const side of [-1,1]){const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.48,3,6),armMat);arm.position.set(side*.43,1.02,0);arm.rotation.z=side*.12;arm.castShadow=true;group.add(arm);arms.push(arm)}
 const legs=[];
 for(const side of [-1,1]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.42,3,6),mat(0x34485e));leg.position.set(side*.17,.35,0);leg.castShadow=true;group.add(leg);legs.push(leg)}
 group.userData={arms,legs};return group;
}
const me=makeAvatar(0x56c8f5);scene.add(me);me.position.set(0,0,2);
const remotesGroup=new THREE.Group();scene.add(remotesGroup);
function updateRemote(p){
 let obj=remotePlayers.get(p.id);
 if(!obj){obj=makeAvatar(p.color||0x56c8f5);remotesGroup.add(obj);remotePlayers.set(p.id,obj)}
 obj.position.set(p.x,p.y,p.z);obj.rotation.y=p.rot||0;
 obj.userData.name=p.name;
 obj.traverse(c=>{if(c.material && c.material.color && c!==obj.children[1]){if(c.geometry.type==="CapsuleGeometry" && c.position.y>0.7)c.material.color.set(p.color||"#56c8f5")}});
}
function addSharedObject(o){
 if(worldObjects.has(o.id))return;
 const geometry=o.shape==="sphere"?new THREE.SphereGeometry(.55,16,12):new THREE.BoxGeometry(1,1,1);
 const mesh=new THREE.Mesh(geometry,mat(o.color));mesh.position.set(o.x,.55,o.z);mesh.castShadow=true;scene.add(mesh);worldObjects.set(o.id,mesh);
}
function removeSharedObject(id){const obj=worldObjects.get(id);if(obj){scene.remove(obj);obj.geometry.dispose();worldObjects.delete(id)}}

function showTab(tab){
 document.querySelectorAll(".tab-page").forEach(p=>p.classList.toggle("hidden",p.id!==`tab-${tab}`));
 document.querySelectorAll(".watch-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
}
function openWatch(tab="home"){$("watch").classList.remove("hidden");showTab(tab)}
function closeWatch(){$("watch").classList.add("hidden")}
$("open-watch").onclick=()=>openWatch();
$("close-watch").onclick=closeWatch;
document.querySelectorAll("[data-panel]").forEach(b=>b.onclick=()=>openWatch(b.dataset.panel));
document.querySelectorAll(".watch-tabs button").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
document.querySelectorAll("[data-tab-jump]").forEach(b=>b.onclick=()=>showTab(b.dataset.tabJump));
$("camera-toggle").onclick=()=>{cameraThird=!cameraThird;$("camera-setting").checked=cameraThird};
$("camera-setting").onchange=e=>cameraThird=e.target.checked;
$("mobile-setting").onchange=e=>$("mobile-controls").style.display=e.target.checked?"flex":"none";

function applyProfile(){
 const name=$("name-input").value.trim().slice(0,18)||"Guest";
 const color=$("color-input").value;
 $("hud-name").textContent=name;$("avatar-dot").style.background=color;$("preview-avatar").style.background=color;
 me.children[0].material.color.set(color);me.children[3].material.color.set(color);me.children[4].material.color.set(color);
 if(socket)socket.emit("profile:update",{name,color});
}
$("save-profile").onclick=()=>{applyProfile();closeWatch()};
$("color-input").oninput=()=>{$("preview-avatar").style.background=$("color-input").value};
$("place-object").onclick=()=>{
 const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
 socket?.emit("object:create",{x:me.position.x+forward.x*2,z:me.position.z+forward.z*2,color:$("object-color").value,shape:$("shape-input").value});
};
$("camera-toggle").onclick=()=>{cameraThird=!cameraThird;$("camera-setting").checked=cameraThird};

function addChat(name,text){
 const line=document.createElement("div");line.className="chat-line";
 const b=document.createElement("b");b.textContent=name+":";
 const span=document.createElement("span");span.textContent=" "+text;
 line.append(b,span);$("chat-log").appendChild(line);
 while($("chat-log").children.length>6)$("chat-log").firstChild.remove();
}
$("chat-form").addEventListener("submit",e=>{e.preventDefault();const v=$("chat-input").value.trim();if(v){socket?.emit("chat:send",v);$("chat-input").value=""}});
function updateRooms(rooms){
 $("room-list").innerHTML="";
 rooms.forEach(r=>{
  const card=document.createElement("div");card.className="room-card";
  const info=document.createElement("div");const strong=document.createElement("b");strong.textContent=r.name;
  const small=document.createElement("small");small.textContent=`${r.count}/${r.capacity} players · ${r.description}`;
  info.append(strong,small);const btn=document.createElement("button");btn.textContent=r.name===currentRoom?"HERE":"JOIN";
  btn.disabled=r.name===currentRoom;btn.onclick=()=>socket.emit("room:join",r.name);
  card.append(info,btn);$("room-list").append(card);
 });
}

if(socket){
 socket.on("connect",()=>{connected=true;$("connection-state").textContent="Connected";});
 socket.on("disconnect",()=>{$("connection-state").textContent="Reconnecting…"});
 socket.on("welcome",data=>{
  myId=data.id;currentRoom=data.player.room;
  $("name-input").value=data.player.name;$("color-input").value=data.player.color;applyProfile();
  $("load-status").textContent="Joining the plaza…";
 });
 socket.on("room:snapshot",data=>{
  for(const [id,obj] of remotePlayers){if(!data.players.some(p=>p.id===id)){remotesGroup.remove(obj);remotePlayers.delete(id)}}
  data.players.forEach(p=>{if(p.id!==myId)updateRemote(p)});
  [...worldObjects.keys()].forEach(id=>{if(!data.objects.some(o=>o.id===id))removeSharedObject(id)});
  data.objects.forEach(addSharedObject);
  $("online-count").textContent=`${data.players.length} online`;
 });
 socket.on("player:update",p=>{if(p.id!==myId)updateRemote(p)});
 socket.on("player:move",p=>{if(p.id!==myId)updateRemote(p)});
 socket.on("room:counts",updateRooms);
 socket.on("room:joined",d=>{currentRoom=d.room;$("room-label").textContent=d.room;closeWatch();addChat("SYSTEM",`Joined ${d.room}`)});
 socket.on("chat:message",m=>addChat(m.name,m.text));
 socket.on("object:add",addSharedObject);
 socket.on("object:remove",removeSharedObject);
}else{$("connection-state").textContent="Offline mode"}
$("room-label").textContent=currentRoom;

function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
addEventListener("resize",resize);

addEventListener("keydown",e=>{
 if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName))return;
 if(e.key.toLowerCase()==="v"){cameraThird=!cameraThird;$("camera-setting").checked=cameraThird}
 if(e.key===" "){jumping=true;e.preventDefault()}
 if(e.key.toLowerCase()==="escape")closeWatch();
});
addEventListener("keyup",e=>{if(e.key===" ")jumping=false});
function keyAxis(){return {x:(keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0),z:(keys.has("s")||keys.has("arrowdown")?1:0)-(keys.has("w")||keys.has("arrowup")?1:0)}}
const keys=new Set();
addEventListener("keydown",e=>keys.add(e.key.toLowerCase()));
addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;dragging=true;lastPointer={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId)});
renderer.domElement.addEventListener("pointermove",e=>{if(!dragging||!lastPointer)return;const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;lastPointer={x:e.clientX,y:e.clientY};yaw-=dx*.005;pitch=Math.max(-.25,Math.min(.8,pitch+dy*.003)});
renderer.domElement.addEventListener("pointerup",()=>{dragging=false;lastPointer=null});
$("jump-btn").addEventListener("pointerdown",()=>jumping=true);$("jump-btn").addEventListener("pointerup",()=>jumping=false);$("jump-btn").addEventListener("pointerleave",()=>jumping=false);

const joy=$("joystick"),stick=$("stick");let joyPointer=null;
joy.addEventListener("pointerdown",e=>{joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);moveJoy(e)});
joy.addEventListener("pointermove",e=>{if(e.pointerId===joyPointer)moveJoy(e)});
function moveJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const len=Math.hypot(dx,dy),max=34;if(len>max){dx=dx/len*max;dy=dy/len*max}stick.style.transform=`translate(${dx}px,${dy}px)`;moveX=dx/max;moveZ=dy/max}
function resetJoy(){joyPointer=null;moveX=moveZ=0;stick.style.transform=""}
joy.addEventListener("pointerup",resetJoy);joy.addEventListener("pointercancel",resetJoy);

let previous=performance.now();
function animate(now){
 requestAnimationFrame(animate);const dt=Math.min((now-previous)/1000,.04);previous=now;
 const k=keyAxis();let ix=k.x+moveX,iz=k.z+moveZ;const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len}
 const speed=5.2;const forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw),rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
 me.position.x+=(rightX*ix+forwardX*iz)*speed*dt;
 me.position.z+=(rightZ*ix+forwardZ*iz)*speed*dt;
 me.position.x=THREE.MathUtils.clamp(me.position.x,-24,24);me.position.z=THREE.MathUtils.clamp(me.position.z,-24,24);
 const moving=len>.08;if(moving){me.rotation.y=Math.atan2(rightX*ix+forwardX*iz,rightZ*ix+forwardZ*iz);walkPhase+=dt*9}else walkPhase=0;
 const limbs=me.userData;limbs.arms.forEach((a,i)=>a.rotation.x=moving?Math.sin(walkPhase+i*Math.PI)*.45:0);limbs.legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(walkPhase+i*Math.PI)*.5:0);
 if(jumping&&me.position.y<=.001)jumpVelocity=7.2;
 me.position.y+=jumpVelocity*dt;jumpVelocity-=18*dt;if(me.position.y<0){me.position.y=0;jumpVelocity=0}
 const target=new THREE.Vector3(me.position.x,me.position.y+1.1,me.position.z);
 if(cameraThird){const dist=6.5;camera.position.set(target.x-Math.sin(yaw)*dist,target.y+2.2+pitch*2,target.z-Math.cos(yaw)*dist);camera.lookAt(target)}
 else{camera.position.set(target.x,target.y+.45,target.z);camera.rotation.set(pitch,yaw,0,"YXZ")}
 const t=now*.001;for(const [id,obj] of remotePlayers){obj.userData.legs?.forEach((l,i)=>l.rotation.x=Math.sin(t*5+i*Math.PI)*.12)}
 if(socket&&now-lastSent>60){lastSent=now;socket.emit("player:move",{x:me.position.x,y:me.position.y,z:me.position.z,rot:me.rotation.y,pose:moving?"walk":"idle"})}
 renderer.render(scene,camera);
}
requestAnimationFrame(animate);
setTimeout(()=>{loading.classList.add("hidden");shell.classList.remove("hidden");$("load-status").textContent="Ready";$("room-label").textContent=currentRoom;},850);
