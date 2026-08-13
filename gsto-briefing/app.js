(() => {
  const SLIDE_COUNT = 18;
  const slideUrls = Array.isArray(window.GSTO_SLIDES) ? window.GSTO_SLIDES : [];
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
  let workerId = localStorage.getItem('gstoWorkerId') || '';
  let company = localStorage.getItem('gstoCompany') || 'Bryan Boiler Engineering Pte Ltd';
  let currentSlide = 0;
  let db = null;
  let remoteEnabled = false;
  let syncMode = 'none'; // primary | compat | local
  let roomDoc = null;
  let participantRef = null;
  let compatDoc = null;
  let compatRoomKey = '';
  let compatParticipantKey = '';
  let compatUnsubscribe = null;
  let bc = null;
  let attendanceRows = [];

  function isFirebaseConfigured() {
    const c = window.GSTO_FIREBASE_CONFIG || {};
    return Boolean(c.apiKey && c.projectId && c.appId);
  }
  function cleanRoom(value) {
    return String(value || 'GSTO-SGWTE-AUG26').trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40) || 'GSTO-SGWTE-AUG26';
  }
  function roomFieldKey(value) {
    return cleanRoom(value).replace(/-/g, '_').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 50) || 'GSTO_ROOM';
  }
  function participantKey(value) {
    const key = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
    return key || `WORKER-${Math.random().toString(36).slice(2,10).toUpperCase()}`;
  }
  function participantFieldKey(value) {
    return participantKey(value).replace(/-/g, '_').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 90);
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function showToast(message) {
    const t = $('toast'); t.textContent = message; t.classList.remove('hidden');
    clearTimeout(showToast._timer); showToast._timer = setTimeout(() => t.classList.add('hidden'), 2800);
  }
  function setBadge(text, mode = '') { const b = $('syncBadge'); b.textContent = text; b.className = `badge ${mode}`.trim(); }
  function applySlideImage(el, index) {
    if (slideUrls[index]) {
      el.style.backgroundImage = `url("${slideUrls[index]}")`;
      el.style.backgroundPosition = 'center center';
      el.style.backgroundSize = 'contain';
    } else if (spriteUrl) {
      el.style.backgroundImage = `url(${spriteUrl})`;
      el.style.backgroundPosition = `center ${(index / (SLIDE_COUNT - 1)) * 100}%`;
      el.style.backgroundSize = '100% 1800%';
    }
  }
  function liveBadge() {
    if (!remoteEnabled) return 'LOCAL DEMO';
    if (role === 'presenter') return syncMode === 'compat' ? 'LIVE · presenter' : 'LIVE · presenter';
    return syncMode === 'compat' ? 'LIVE · synced' : 'LIVE · synced';
  }
  function renderSlide(index, source = 'local') {
    const safe = Math.max(0, Math.min(SLIDE_COUNT - 1, Number(index) || 0)); currentSlide = safe;
    applySlideImage($('slideImage'), safe);
    $('slideImage').setAttribute('aria-label', `GSTO briefing slide ${safe + 1}: ${titles[safe]}`);
    $('slideCounter').textContent = `Slide ${safe + 1} / ${SLIDE_COUNT}`; $('slideTitle').textContent = titles[safe];
    $('prevBtn').disabled = safe === 0; $('nextBtn').disabled = safe === SLIDE_COUNT - 1;
    document.querySelectorAll('.thumb').forEach((el, i) => el.classList.toggle('active', i === safe));
    if (role === 'audience') $('ackBtn').classList.toggle('hidden', safe !== SLIDE_COUNT - 1);
    if (source === 'remote' && role === 'audience') setBadge(liveBadge(), remoteEnabled ? '' : 'warn');
  }

  function compatBase() { return `gsto.${compatRoomKey}`; }
  async function compatUpdate(fields) {
    if (!compatDoc) throw new Error('Compatibility sync document not available');
    const payload = {};
    Object.entries(fields).forEach(([key, value]) => { payload[`${compatBase()}.${key}`] = value; });
    await compatDoc.update(payload);
  }

  async function publishSlide(index) {
    renderSlide(index); if (role !== 'presenter') return;
    const payload = { slide: currentSlide, updatedAt: Date.now(), presenter: 'GSTO Presenter' };
    if (remoteEnabled && syncMode === 'primary' && roomDoc) {
      try { await roomDoc.set(payload, { merge: true }); }
      catch (err) { console.error(err); setBadge('Sync error', 'off'); showToast('Could not update worker devices. Refresh the page to reconnect.'); }
    } else if (remoteEnabled && syncMode === 'compat' && compatDoc) {
      try { await compatUpdate(payload); }
      catch (err) { console.error(err); setBadge('Sync error', 'off'); showToast('Could not update worker devices. Refresh the page to reconnect.'); }
    } else if (bc) {
      bc.postMessage({ type: 'slide', ...payload, room }); localStorage.setItem(`gstoSlide:${room}`, String(currentSlide));
    }
  }

  function buildThumbs() {
    const grid = $('thumbGrid'); grid.innerHTML = '';
    Array.from({ length: SLIDE_COUNT }, (_, i) => i).forEach(i => {
      const btn = document.createElement('button'); btn.className='thumb'; btn.title=`${i+1}. ${titles[i]}`;
      const preview=document.createElement('div'); preview.className='thumb-preview'; applySlideImage(preview, i);
      const num=document.createElement('span'); num.textContent=i+1; btn.append(preview,num);
      btn.addEventListener('click',()=>{publishSlide(i);$('thumbPanel').classList.add('hidden');}); grid.appendChild(btn);
    });
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
    $('attendanceBtn').addEventListener('click',()=>$('attendancePanel').classList.toggle('hidden')); $('closeAttendanceBtn').addEventListener('click',()=>$('attendancePanel').classList.add('hidden'));
    $('exportAttendanceBtn').addEventListener('click',exportAttendance);
    $('copyLinkBtn').addEventListener('click',copyWorkerLink); $('fullscreenBtn').addEventListener('click',toggleFullscreen); $('fullscreenAudience').addEventListener('click',toggleFullscreen);
    $('ackBtn').addEventListener('click',acknowledgeBriefing);
    document.addEventListener('keydown',e=>{ if(role!=='presenter'||!$('joinModal').classList.contains('hidden'))return;
      if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')publishSlide(currentSlide+1); if(e.key==='ArrowLeft'||e.key==='PageUp')publishSlide(currentSlide-1); if(e.key.toLowerCase()==='f')toggleFullscreen(); });
    document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('fullscreen-ui',Boolean(document.fullscreenElement)));
  }

  function setupLocalDemo(reason = '') {
    syncMode='local'; remoteEnabled=false; setBadge('LOCAL DEMO','warn'); $('roomBadge').textContent=`Room ${room}`;
    try{bc=new BroadcastChannel(`gsto-${room}`);bc.onmessage=e=>{if(role==='audience'&&e.data?.type==='slide'&&e.data?.room===room)renderSlide(e.data.slide,'remote');};}catch(e){console.warn(e);}
    const saved=Number(localStorage.getItem(`gstoSlide:${room}`)); if(Number.isInteger(saved)&&saved>=0&&saved<SLIDE_COUNT)renderSlide(saved);
    $('viewerBadge').textContent='Demo mode';
    if (reason) console.warn('GSTO live sync unavailable:', reason);
  }

  async function registerParticipantPrimary() {
    if (!db || role === 'presenter') return;
    participantRef = db.collection('gstoBriefings').doc(room).collection('participants').doc(participantKey(workerId));
    const now = Date.now();
    const existing = await participantRef.get();
    if (!existing.exists) {
      await participantRef.set({
        name: displayName, workerId, company, joinedAt: firebase.firestore.FieldValue.serverTimestamp(), joinedAtMs: now,
        lastSeen: now, completed: false, acknowledgedAtMs: null, room
      });
    } else {
      await participantRef.set({ name: displayName, workerId, company, lastSeen: now, room }, { merge: true });
      if (existing.data().completed) markAcknowledgedUi();
    }
    const heartbeat = async () => { try { if(syncMode==='primary') await participantRef.set({ lastSeen: Date.now() }, { merge: true }); } catch(e) { console.warn(e); } };
    setInterval(heartbeat, 30000);
  }

  async function registerParticipantCompat() {
    if (!db || role === 'presenter' || !compatDoc) return;
    compatParticipantKey = participantFieldKey(workerId);
    const joinedKey = `gstoJoinedAt:${room}:${compatParticipantKey}`;
    let joinedAtMs = Number(localStorage.getItem(joinedKey));
    if (!joinedAtMs) { joinedAtMs = Date.now(); localStorage.setItem(joinedKey, String(joinedAtMs)); }
    const base = `${compatBase()}.participants.${compatParticipantKey}`;
    const payload = {};
    payload[`${base}.name`] = displayName;
    payload[`${base}.workerId`] = workerId;
    payload[`${base}.company`] = company;
    payload[`${base}.joinedAtMs`] = joinedAtMs;
    payload[`${base}.lastSeen`] = Date.now();
    payload[`${base}.room`] = room;
    await compatDoc.update(payload);

    const snap = await compatDoc.get();
    const rec = snap.data()?.gsto?.[compatRoomKey]?.participants?.[compatParticipantKey];
    if (rec?.completed) markAcknowledgedUi();

    const heartbeat = async () => {
      if (syncMode !== 'compat' || !compatDoc) return;
      const p = {}; p[`${base}.lastSeen`] = Date.now();
      try { await compatDoc.update(p); } catch(e) { console.warn(e); }
    };
    setInterval(heartbeat, 30000);
  }

  async function acknowledgeBriefing() {
    if (currentSlide !== SLIDE_COUNT - 1) return;
    const now = Date.now();
    try {
      if (syncMode === 'primary' && participantRef) {
        await participantRef.set({ completed: true, acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp(), acknowledgedAtMs: now, completedSlide: SLIDE_COUNT, lastSeen: now }, { merge: true });
      } else if (syncMode === 'compat' && compatDoc && compatParticipantKey) {
        const base = `${compatBase()}.participants.${compatParticipantKey}`;
        const payload = {};
        payload[`${base}.completed`] = true;
        payload[`${base}.acknowledgedAtMs`] = now;
        payload[`${base}.completedSlide`] = SLIDE_COUNT;
        payload[`${base}.lastSeen`] = now;
        await compatDoc.update(payload);
      } else {
        showToast('Attendance sync is not available on this device.'); return;
      }
      markAcknowledgedUi(); showToast('Briefing completion recorded. Thank you.');
    } catch (err) { console.error(err); showToast('Could not record completion. Please tell the presenter.'); }
  }
  function markAcknowledgedUi() {
    const btn=$('ackBtn'); btn.textContent='✓ Briefing acknowledged'; btn.disabled=true; btn.classList.remove('hidden');
  }
  function toLocalTime(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('en-SG',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  }
  function renderAttendance() {
    const rows=[...attendanceRows].sort((a,b)=>(a.joinedAtMs||0)-(b.joinedAtMs||0));
    const completed=rows.filter(r=>r.completed).length;
    $('attendanceSummary').textContent=`${rows.length} joined · ${completed} completed`;
    $('attendanceBody').innerHTML = rows.length ? rows.map(r=>`<tr>
      <td><strong>${esc(r.name||'—')}</strong></td><td>${esc(r.workerId||'—')}</td><td>${esc(r.company||'—')}</td>
      <td>${esc(toLocalTime(r.joinedAtMs))}</td><td><span class="attendance-status ${r.completed?'complete':'joined'}">${r.completed?'Completed':'Joined'}</span></td>
    </tr>`).join('') : '<tr><td colspan="5">No attendance yet.</td></tr>';
  }
  function updateAttendanceIndicators() {
    const cutoff=Date.now()-120000;
    const live=attendanceRows.filter(r=>(r.lastSeen||0)>=cutoff).length;
    $('viewerBadge').textContent=`${live} live · ${attendanceRows.length} attended`;
    renderAttendance();
  }
  function watchParticipantsPrimary() {
    if (!db || role !== 'presenter') return;
    db.collection('gstoBriefings').doc(room).collection('participants').onSnapshot(snap => {
      attendanceRows = snap.docs.map(d=>({ id:d.id, ...d.data() })); updateAttendanceIndicators();
    }, err=>{console.error(err); $('viewerBadge').textContent='Attendance error';});
  }
  function csvCell(value) { const s=String(value??''); return `"${s.replace(/"/g,'""')}"`; }
  function exportAttendance() {
    if (!attendanceRows.length) { showToast('No attendance to export yet.'); return; }
    const rows=[['Briefing Room','Name','Worker ID','Company','Joined','Completed','Acknowledged Time']];
    [...attendanceRows].sort((a,b)=>(a.joinedAtMs||0)-(b.joinedAtMs||0)).forEach(r=>rows.push([room,r.name||'',r.workerId||'',r.company||'',toLocalTime(r.joinedAtMs),r.completed?'Yes':'No',toLocalTime(r.acknowledgedAtMs)]));
    const csv='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download=`GSTO_Attendance_${room}_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Attendance CSV exported.');
  }

  async function setupPrimaryFirebase() {
    roomDoc=db.collection('gstoBriefings').doc(room);
    const initial=await roomDoc.get();
    if (role==='presenter') {
      await roomDoc.set({
        slide: initial.exists && Number.isInteger(initial.data()?.slide) ? initial.data().slide : 0,
        updatedAt: Date.now(), presenter: 'GSTO Presenter'
      }, {merge:true});
    }
    if (role==='audience') await registerParticipantPrimary();

    syncMode='primary'; remoteEnabled=true; $('roomBadge').textContent=`Room ${room}`;
    roomDoc.onSnapshot(snap=>{ const state=snap.data(); if(state&&Number.isInteger(state.slide))renderSlide(state.slide,'remote'); },err=>{console.error(err);setBadge('Sync error','off');});
    if (role==='presenter') watchParticipantsPrimary();
    setBadge(liveBadge());
  }

  async function setupCompatCandidate(ref, label) {
    compatRoomKey = roomFieldKey(room);
    const probe = { gsto: {} };
    probe.gsto[compatRoomKey] = { probe: Date.now() };
    await ref.set(probe, {merge:true});
    compatDoc = ref;
    syncMode='compat'; remoteEnabled=true; $('roomBadge').textContent=`Room ${room}`;

    const snap = await compatDoc.get();
    const state = snap.data()?.gsto?.[compatRoomKey] || {};
    if (role==='presenter' && !Number.isInteger(state.slide)) await compatUpdate({slide:0, updatedAt:Date.now(), presenter:'GSTO Presenter'});
    if (role==='audience') await registerParticipantCompat();

    if (compatUnsubscribe) compatUnsubscribe();
    compatUnsubscribe = compatDoc.onSnapshot(s => {
      const live = s.data()?.gsto?.[compatRoomKey] || {};
      if (Number.isInteger(live.slide)) renderSlide(live.slide,'remote');
      if (role==='presenter') {
        const participants = live.participants || {};
        attendanceRows = Object.entries(participants).map(([id,v])=>({id,...(v||{})}));
        updateAttendanceIndicators();
      }
    }, err=>{console.error(err); setBadge('Sync error','off');});

    setBadge(liveBadge());
    console.info(`GSTO live compatibility channel: ${label}`);
    return true;
  }

  async function setupCompatFirebase() {
    const candidates = [
      {ref: db.collection('system').doc('gstoLive'), label:'system/gstoLive'},
      {ref: db.collection('system').doc('activeSession'), label:'system/activeSession'}
    ];
    let lastError = null;
    for (const candidate of candidates) {
      try { return await setupCompatCandidate(candidate.ref, candidate.label); }
      catch (err) { console.warn(`GSTO compatibility channel ${candidate.label} unavailable`, err); lastError=err; compatDoc=null; syncMode='none'; remoteEnabled=false; }
    }
    throw lastError || new Error('No compatible Firebase channel available');
  }

  async function setupFirebase() {
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.GSTO_FIREBASE_CONFIG);
      db=firebase.firestore();
    } catch (err) {
      console.error(err); setupLocalDemo(err.message); showToast('Firebase could not start — running Local Demo.'); return;
    }

    try {
      await setupPrimaryFirebase();
      return;
    } catch (primaryErr) {
      console.warn('Direct GSTO collection unavailable; trying existing Firebase channel.', primaryErr);
      roomDoc=null; participantRef=null; syncMode='none'; remoteEnabled=false;
    }

    try {
      await setupCompatFirebase();
      showToast('Live sync connected.');
      return;
    } catch (compatErr) {
      console.error(compatErr); setupLocalDemo(compatErr.message); showToast('Online sync is blocked by Firebase permissions — Local Demo only.');
    }
  }

  function showJoinIfNeeded() {
    const hasRoomInUrl=Boolean(params.get('room')); if(role==='presenter')return false;
    if(displayName && workerId && hasRoomInUrl) return false;
    $('joinModal').classList.remove('hidden'); $('nameInput').value=displayName; $('workerIdInput').value=workerId; $('companyInput').value=company; $('roomInput').value=room; return true;
  }
  function bindJoin() {
    $('joinBtn').addEventListener('click',async()=>{
      const name=$('nameInput').value.trim(), id=$('workerIdInput').value.trim(), comp=$('companyInput').value.trim();
      if(!name){showToast('Please enter your full name.');$('nameInput').focus();return;}
      if(!id){showToast('Please enter your Worker ID / Staff ID.');$('workerIdInput').focus();return;}
      displayName=name; workerId=id; company=comp||'N.A.'; room=cleanRoom($('roomInput').value);
      localStorage.setItem('gstoName',displayName); localStorage.setItem('gstoWorkerId',workerId); localStorage.setItem('gstoCompany',company); localStorage.setItem('gstoRoom',room);
      const url=new URL(location.href); url.searchParams.set('room',room); url.searchParams.delete('role'); history.replaceState(null,'',url); $('joinModal').classList.add('hidden'); await startSync();
    });
  }
  async function startSync() { if(startSync.started)return; startSync.started=true; if(isFirebaseConfigured())await setupFirebase();else setupLocalDemo('Firebase configuration missing'); }
  async function init() {
    buildThumbs(); bindControls(); bindJoin(); updateRoleUi(); renderSlide(0);
    const first = slideUrls[0] || spriteUrl;
    if (first) {
      const pre = new Image();
      pre.onload = () => $('loading').classList.add('hidden');
      pre.onerror = () => { $('loading').textContent = 'Could not load presentation slides.'; };
      pre.src = first;
    } else {
      $('loading').textContent = 'Presentation image data not available.';
    }
    if (!showJoinIfNeeded()) await startSync();
  }
  init();
})();
