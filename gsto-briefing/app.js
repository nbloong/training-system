(() => {
  const SLIDE_COUNT = 18;
  const spriteUrl = window.GSTO_SLIDES_BASE64 ? `data:image/jpeg;base64,${window.GSTO_SLIDES_BASE64}` : '';
  const titles = [
    'Global Safety Time Out (GSTO)-SGWTE','Safety Moment','Background of Global Safety Time-Out (GSTO)',
    'CEO’s Safety Message for GSTO 2026','CEO’s Safety Message – Three Focus Areas','GSTO 2026 – Three Focus Areas',
    'Incidents Sharing (Keppel)','Tripped over Structure Base','HSE Alert – Slip, Trip & Fall Incidents',
    'HSE Alert – Slip and Fall on Wet Floor','Group HSE Alert – Reportable Slip and Fall',
    'Group HSE Alert – Trip & Fall Incident in Office','General Advisory – Prevent Slips, Trips and Falls',
    'Recent Incidents and STF MOM Statistics','Slips, Trips & Falls: Still a Daily Risk',
    'WSH Alert – Fire Protection & Emergency Response Readiness','Safety Alert – Formwork / Scaffold Collapse Can Kill','Thank You'
  ];

  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let role = params.get('role') === 'presenter' ? 'presenter' : 'audience';
  let room = cleanRoom(params.get('room') || localStorage.getItem('gstoRoom') || 'GSTO-SGWTE-AUG26');
  let displayName = localStorage.getItem('gstoName') || '';
  let currentSlide = 0;
  let db = null;
  let remoteEnabled = false;
  let roomDoc = null;
  let bc = null;
  let participantId = localStorage.getItem('gstoParticipantId');
  if (!participantId) {
    participantId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem('gstoParticipantId', participantId);
  }

  function isFirebaseConfigured() {
    const c = window.GSTO_FIREBASE_CONFIG || {};
    return Boolean(c.apiKey && c.projectId && c.appId);
  }
  function cleanRoom(value) {
    return String(value || 'GSTO-SGWTE-AUG26').trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'GSTO-SGWTE-AUG26';
  }
  function showToast(message) {
    const t = $('toast'); t.textContent = message; t.classList.remove('hidden');
    clearTimeout(showToast._timer); showToast._timer = setTimeout(() => t.classList.add('hidden'), 2200);
  }
  function setBadge(text, mode = '') { const b = $('syncBadge'); b.textContent = text; b.className = `badge ${mode}`.trim(); }
  function renderSlide(index, source = 'local') {
    const safe = Math.max(0, Math.min(SLIDE_COUNT - 1, Number(index) || 0)); currentSlide = safe;
    $('slideImage').style.backgroundPosition = `center ${(safe / (SLIDE_COUNT - 1)) * 100}%`; $('slideImage').setAttribute('aria-label', `GSTO briefing slide ${safe + 1}: ${titles[safe]}`);
    $('slideCounter').textContent = `Slide ${safe + 1} / ${SLIDE_COUNT}`; $('slideTitle').textContent = titles[safe];
    $('prevBtn').disabled = safe === 0; $('nextBtn').disabled = safe === SLIDE_COUNT - 1;
    document.querySelectorAll('.thumb').forEach((el, i) => el.classList.toggle('active', i === safe));
    if (source === 'remote' && role === 'audience') setBadge(remoteEnabled ? 'LIVE · synced' : 'LOCAL DEMO', remoteEnabled ? '' : 'warn');
  }
  async function publishSlide(index) {
    renderSlide(index); if (role !== 'presenter') return;
    const payload = { slide: currentSlide, updatedAt: Date.now(), presenter: 'GSTO Presenter' };
    if (remoteEnabled && roomDoc) {
      try { await roomDoc.set(payload, { merge: true }); }
      catch (err) { console.error(err); setBadge('Sync error', 'off'); showToast('Could not update worker devices.'); }
    } else if (bc) { bc.postMessage({ type: 'slide', ...payload, room }); localStorage.setItem(`gstoSlide:${room}`, String(currentSlide)); }
  }
  function buildThumbs() {
    const grid = $('thumbGrid'); grid.innerHTML = '';
    Array.from({ length: SLIDE_COUNT }, (_, i) => i).forEach(i => { const btn = document.createElement('button'); btn.className='thumb'; btn.title=`${i+1}. ${titles[i]}`;
      const preview=document.createElement('div'); preview.className='thumb-preview'; preview.style.backgroundImage=`url(${spriteUrl})`; preview.style.backgroundPosition=`center ${(i / (SLIDE_COUNT - 1)) * 100}%`;
      const num=document.createElement('span'); num.textContent=i+1; btn.append(preview,num);
      btn.addEventListener('click',()=>{publishSlide(i);$('thumbPanel').classList.add('hidden');}); grid.appendChild(btn); });
  }
  function updateRoleUi() {
    const presenter = role === 'presenter'; $('presenterControls').classList.toggle('hidden', !presenter);
    $('audienceControls').classList.toggle('hidden', presenter); $('viewerBadge').classList.toggle('hidden', !presenter);
    document.title = presenter ? 'Presenter · GSTO 2026 – SGWTE' : 'GSTO 2026 – SGWTE Worker Briefing';
  }
  function makeAudienceUrl() { const url = new URL(location.href); url.searchParams.set('room', room); url.searchParams.delete('role'); return url.toString(); }
  async function copyWorkerLink() { const url=makeAudienceUrl(); try{await navigator.clipboard.writeText(url);showToast('Worker link copied.');}catch{prompt('Copy this worker link:',url);} }
  async function toggleFullscreen() { try{if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen();}catch{document.body.classList.toggle('fullscreen-ui');} }
  function bindControls() {
    $('prevBtn').addEventListener('click',()=>publishSlide(currentSlide-1)); $('nextBtn').addEventListener('click',()=>publishSlide(currentSlide+1));
    $('thumbBtn').addEventListener('click',()=>$('thumbPanel').classList.toggle('hidden')); $('closeThumbBtn').addEventListener('click',()=>$('thumbPanel').classList.add('hidden'));
    $('copyLinkBtn').addEventListener('click',copyWorkerLink); $('fullscreenBtn').addEventListener('click',toggleFullscreen); $('fullscreenAudience').addEventListener('click',toggleFullscreen);
    document.addEventListener('keydown',e=>{ if(role!=='presenter'||!$('joinModal').classList.contains('hidden'))return;
      if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')publishSlide(currentSlide+1); if(e.key==='ArrowLeft'||e.key==='PageUp')publishSlide(currentSlide-1); if(e.key.toLowerCase()==='f')toggleFullscreen(); });
    document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('fullscreen-ui',Boolean(document.fullscreenElement)));
  }
  function setupLocalDemo() {
    remoteEnabled=false; setBadge('LOCAL DEMO','warn'); $('roomBadge').textContent=`Room ${room}`;
    try{bc=new BroadcastChannel(`gsto-${room}`);bc.onmessage=e=>{if(role==='audience'&&e.data?.type==='slide'&&e.data?.room===room)renderSlide(e.data.slide,'remote');};}catch(e){console.warn(e);}
    const saved=Number(localStorage.getItem(`gstoSlide:${room}`)); if(Number.isInteger(saved)&&saved>=0&&saved<SLIDE_COUNT)renderSlide(saved);
    $('viewerBadge').textContent='Demo mode';
  }
  async function registerParticipant() {
    if (!db || role === 'presenter') return;
    const ref = db.collection('gstoBriefings').doc(room).collection('participants').doc(participantId);
    const heartbeat = async () => { try { await ref.set({ name: displayName || 'Worker', lastSeen: Date.now(), joinedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch(e) { console.warn(e); } };
    await heartbeat(); setInterval(heartbeat, 30000);
  }
  function watchParticipants() {
    if (!db || role !== 'presenter') return;
    db.collection('gstoBriefings').doc(room).collection('participants').onSnapshot(snap => {
      const cutoff=Date.now()-120000; let count=0; snap.forEach(d=>{if((d.data().lastSeen||0)>=cutoff)count++;});
      $('viewerBadge').textContent=`${count} worker${count===1?'':'s'} joined`;
    });
  }
  async function setupFirebase() {
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.GSTO_FIREBASE_CONFIG);
      db=firebase.firestore(); remoteEnabled=true; roomDoc=db.collection('gstoBriefings').doc(room); $('roomBadge').textContent=`Room ${room}`;
      roomDoc.onSnapshot(snap=>{ const state=snap.data(); if(state&&Number.isInteger(state.slide))renderSlide(state.slide,'remote'); },err=>{console.error(err);setBadge('Sync error','off');});
      const initial=await roomDoc.get();
      if(role==='presenter'&&!initial.exists) await roomDoc.set({slide:0,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:Date.now()},{merge:true});
      await registerParticipant(); watchParticipants(); setBadge(role==='presenter'?'LIVE · presenter':'LIVE · synced');
    } catch(err) { console.error(err); setupLocalDemo(); showToast('Online sync unavailable — running local demo mode.'); }
  }
  function showJoinIfNeeded() {
    const hasRoomInUrl=Boolean(params.get('room')); if(role==='presenter')return false; if(displayName&&hasRoomInUrl)return false;
    $('joinModal').classList.remove('hidden'); $('nameInput').value=displayName; $('roomInput').value=room; return true;
  }
  function bindJoin() {
    $('joinBtn').addEventListener('click',async()=>{ displayName=$('nameInput').value.trim()||'Worker'; room=cleanRoom($('roomInput').value);
      localStorage.setItem('gstoName',displayName); localStorage.setItem('gstoRoom',room); const url=new URL(location.href); url.searchParams.set('room',room); url.searchParams.delete('role'); history.replaceState(null,'',url); $('joinModal').classList.add('hidden'); await startSync(); });
  }
  async function startSync() { if(startSync.started)return; startSync.started=true; if(isFirebaseConfigured())await setupFirebase();else setupLocalDemo(); }
  async function init() {
    $('slideImage').style.backgroundImage=`url(${spriteUrl})`;
    buildThumbs(); bindControls(); bindJoin(); updateRoleUi(); renderSlide(0);
    const pre = new Image();
    pre.onload = () => $('loading').classList.add('hidden');
    pre.onerror = () => { $('loading').textContent = 'Could not load presentation slides.'; };
    pre.src = spriteUrl;
    if (!showJoinIfNeeded()) await startSync();
  }
  init();
})();
