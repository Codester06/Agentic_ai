// ── Frequency wave animation ──
let waveAnimId = null;

function startWave() {
  const canvas = document.getElementById('waveform-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let t = 0;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw 2 sine waves with different frequencies and phases
    const waves = [
      { amp: 14, freq: 0.035, speed: 0.07, alpha: 0.9, offset: 0 },
      { amp: 8,  freq: 0.055, speed: 0.11, alpha: 0.4, offset: Math.PI },
    ];

    waves.forEach(w => {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(212, 149, 106, ${w.alpha})`;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let x = 0; x <= W; x += 2) {
        const y = H / 2 + Math.sin(x * w.freq + t * w.speed + w.offset) * w.amp
                        + Math.sin(x * w.freq * 1.7 + t * w.speed * 0.6) * (w.amp * 0.4);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    t++;
    waveAnimId = requestAnimationFrame(draw);
  }
  draw();
}

function stopWave() {
  if (waveAnimId) { cancelAnimationFrame(waveAnimId); waveAnimId = null; }
  const canvas = document.getElementById('waveform-canvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}
const TITLES = ["Plan your build.","What are we constructing?","Let's break ground.","Ready to build something?","Your project starts here."];
let titleIdx = 0;
const titleWrap = document.getElementById('title-wrap');
function buildTitle(t){const e=document.createElement('div');e.className='title';e.textContent=t;return e;}
function rotateTitle(){
  const cur=titleWrap.querySelector('.title.active');
  const next=buildTitle(TITLES[(titleIdx+1)%TITLES.length]);
  titleWrap.appendChild(next);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(cur)cur.classList.add('exit');next.classList.add('active');
    setTimeout(()=>cur&&cur.remove(),500);
  }));
  titleIdx=(titleIdx+1)%TITLES.length;
}
const ft=buildTitle(TITLES[0]);ft.classList.add('active');titleWrap.appendChild(ft);
setInterval(rotateTitle,3500);

// ── Sidebar ──
let sidebarOpen=false;
function toggleSidebar(){
  sidebarOpen=!sidebarOpen;
  document.getElementById('full-sidebar').classList.toggle('open',sidebarOpen);
}

// ── History ──
let historyData=[];
let activeHistoryId=null;

async function loadHistory(){
  try{const r=await fetch('/history');historyData=await r.json();renderHistoryList();}
  catch(e){console.error(e);}
}
function renderHistoryList(){
  const el=document.getElementById('history-list');
  if(!historyData.length){el.innerHTML='<div class="history-empty">No plans yet.</div>';return;}
  el.innerHTML=historyData.map(item=>{
    const goal = item.project?.goal || item.meta?.goal || item.goal || 'Untitled';
    const safeGoal = goal.replace(/"/g,'&quot;');
    return `
    <div class="history-item${item.id===activeHistoryId?' active':''}" data-id="${item.id}">
      <div class="hi-text" title="${safeGoal}">${safeGoal}</div>
      <button class="hi-del" data-del="${item.id}" title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
      </button>
    </div>`;
  }).join('');
}

// Event delegation for history clicks
document.getElementById('history-list').addEventListener('click', function(e){
  // Delete button
  const delBtn = e.target.closest('[data-del]');
  if(delBtn){ deleteHistoryItem(e, delBtn.dataset.del); return; }
  // Item click
  const item = e.target.closest('[data-id]');
  if(item){ loadHistoryItem(item.dataset.id); }
});
function loadHistoryItem(id){
  const item=historyData.find(h=>h.id===id);if(!item)return;
  activeHistoryId=id;renderHistoryList();

  const goal = item.project?.goal || item.meta?.goal || item.goal || 'Untitled';
  const plan = item.plan_markdown || item.plan || '';
  showChatScreen(goal);
  document.getElementById('status-dot').className='status-dot done';
  document.getElementById('topbar-title').textContent=goal;
  document.getElementById('progress-fill').style.width='100%';

  // Rebuild tool calls for analysis steps from phases
  const toolCalls = [];
  const phases = item.phases || item.agent_calls?.phases || {};
  Object.keys(phases).forEach(phase=>{
    const c = phases[phase];
    if(c.material) toolCalls.push({name:'check_material_availability',arg:phase});
    if(c.labor||c.worker) toolCalls.push({name:'check_worker_availability',arg:phase});
    if(c.permit) toolCalls.push({name:'check_permit_status',arg:phase});
    if(c.duration) toolCalls.push({name:'calculate_duration',arg:phase});
  });

  renderAnalysisBlock(buildStepsFromToolCalls(toolCalls),false);
  document.getElementById('reply-bar').style.display='none';
  renderPlan(plan);
  populateDashboard(item, toolCalls.length);
}
async function deleteHistoryItem(e, id){
  e.stopPropagation();
  await fetch('/history/'+id,{method:'DELETE'});
  historyData=historyData.filter(h=>h.id!==id);
  if(activeHistoryId===id){activeHistoryId=null;startNewPlan();}
  renderHistoryList();
}

// ── Pills ──
function togglePill(el){el.classList.toggle('active');}
function getActiveTools(){return[...document.querySelectorAll('.pill.active')].map(p=>p.dataset.tool);}

// ── Textarea auto-resize ──
function autoResize(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}
document.getElementById('goal-input').addEventListener('input',function(){autoResize(this);});
document.getElementById('goal-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();generatePlan();}});
document.getElementById('reply-input').addEventListener('input',function(){autoResize(this);});
document.getElementById('reply-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();generatePlan();}});

// ── Screen transitions ──
function showChatScreen(goal){
  document.getElementById('home').style.display='none';
  document.getElementById('chat-screen').classList.add('visible');
  document.getElementById('user-goal-text').textContent=goal;
  document.getElementById('plan-content').innerHTML='';
  document.getElementById('analysis-block').innerHTML='';
  document.getElementById('thinking-wrap').style.display='none';
  
  document.getElementById('progress-fill').style.width='0%';
  document.getElementById('status-dot').className='status-dot';
}
function startNewPlan(){
  activeHistoryId=null;renderHistoryList();
  document.getElementById('reply-bar').style.display = '';
  document.getElementById('chat-screen').classList.remove('visible');
  document.getElementById('home').style.display='flex';
  document.getElementById('goal-input').value='';
  document.getElementById('reply-input').value='';
  document.getElementById('plan-content').innerHTML='';
  document.getElementById('analysis-block').innerHTML='';
  document.getElementById('progress-fill').style.width='0%';
  document.getElementById('metrics-row').style.display='none';
  document.getElementById('plan-tabs-wrap').style.display='none';
  if(document.getElementById('phase-table-body')) document.getElementById('phase-table-body').innerHTML='';
  if(document.getElementById('gantt-rows')) document.getElementById('gantt-rows').innerHTML='';
  if(document.getElementById('agent-log-content')) document.getElementById('agent-log-content').innerHTML='';
  switchPlanTab('overview');
  document.getElementById('chat-body').scrollTop=0;
}

// ── Analysis block ──
const ANALYSIS_STEPS=[
  {key:'init',    label:'Goal received & phases identified'},
  {key:'materials',label:'Material availability checked'},
  {key:'labor',   label:'Labor resources verified'},
  {key:'permits', label:'Permit status confirmed'},
  {key:'schedule',label:'Phase durations estimated'},
  {key:'plan',    label:'Execution schedule assembled'},
  {key:'final',   label:'Plan finalized'},
];
const ICON_DONE=`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICON_PEND=`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`;
let completedSteps=new Set();

function renderAnalysisBlock(doneKeys,startOpen=true){
  const block=document.getElementById('analysis-block');
  block.innerHTML=`
    <div class="analysis-header" onclick="toggleAnalysis()">
      <div class="analysis-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg></div>
      <span class="analysis-label">Analysis</span>
      <svg class="analysis-chevron${startOpen?' open':''}" id="analysis-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="analysis-body${startOpen?' open':''}" id="analysis-body">
      <div class="analysis-steps">
        ${ANALYSIS_STEPS.map((s,i)=>{
          const done=doneKeys.has(s.key);
          return `<div class="analysis-step${done?' done':' pending'}" id="step-${s.key}" style="animation-delay:${i*0.04}s">${done?ICON_DONE:ICON_PEND}<span>${s.label}</span></div>`;
        }).join('')}
      </div>
    </div>`;
}
function toggleAnalysis(){
  document.getElementById('analysis-body')?.classList.toggle('open');
  document.getElementById('analysis-chevron')?.classList.toggle('open');
}
function markStep(key){
  completedSteps.add(key);
  const el=document.getElementById('step-'+key);if(!el)return;
  el.classList.remove('pending');el.classList.add('done');
  el.innerHTML=ICON_DONE+`<span>${ANALYSIS_STEPS.find(s=>s.key===key)?.label||key}</span>`;
}
const TOOL_TO_STEP={check_material_availability:'materials',check_worker_availability:'labor',check_permit_status:'permits',calculate_duration:'schedule'};
function buildStepsFromToolCalls(tcs){
  const done=new Set(['init']);
  tcs.forEach(tc=>{const k=TOOL_TO_STEP[tc.name];if(k)done.add(k);});
  if(tcs.length>0){done.add('plan');done.add('final');}
  return done;
}

// ── Sidebar Log ──
function sidebarLog(tag, tagClass, text) {
  const body = document.getElementById('sidebar-log');
  if(!body) return;
  const empty = body.querySelector('.sidebar-log-empty');
  if(empty) empty.remove();
  const line = document.createElement('div');
  line.className = 'sl-line';
  line.innerHTML = `<span class="sl-tag ${tagClass}">${tag}</span><span class="sl-text">${text}</span>`;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function sidebarLogSetActive(active) {
  const dot = document.getElementById('sidebar-log-dot');
  if(dot) dot.classList.toggle('active', active);
}

function sidebarLogClear() {
  const body = document.getElementById('sidebar-log');
  if(body) body.innerHTML = '';
}

// keep old names as aliases so nothing breaks
function drawerLog(tag, cls, text) { sidebarLog(tag, cls, text); }
function drawerSetActive(a) { sidebarLogSetActive(a); }
function drawerClear() { sidebarLogClear(); }
function toggleLogDrawer() {}  // no-op, drawer removed

// ── Plan tab switcher ──
function switchPlanTab(name) {
  document.querySelectorAll('.plan-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const tabEl = document.querySelector(`.plan-tab[onclick*="${name}"]`);
  if(tabEl) tabEl.classList.add('active');
  const panelEl = document.getElementById('tab-' + name);
  if(panelEl) panelEl.classList.add('active');
}

// ── Populate dashboard ──
function populateDashboard(item, toolCallCount) {
  const phases = item.phases || {};
  const phaseEntries = Array.isArray(phases)
    ? phases
    : Object.entries(phases).map(([name, v]) => ({name, ...v}));
  const totalDays = item.project?.total_duration_days || item.project?.total_days || 0;

  document.getElementById('metrics-row').style.display = 'grid';
  document.getElementById('plan-tabs-wrap').style.display = 'block';
  document.getElementById('m-phases').textContent = phaseEntries.length;
  document.getElementById('m-days').textContent = totalDays || '—';
  document.getElementById('m-calls').textContent = toolCallCount || (phaseEntries.length * 4);

  const permits = phaseEntries.map(p => (p.permit || '').toLowerCase());
  const approved = permits.filter(p => p.includes('approved')).length;
  document.getElementById('m-status').textContent = phaseEntries.length
    ? Math.round((approved / phaseEntries.length) * 100) + '%' : '—';

  // Phase table
  const tbody = document.getElementById('phase-table-body');
  tbody.innerHTML = phaseEntries.map((p, i) => {
    const tl = p.timeline || {};
    const start = tl.start_day ? `Day ${tl.start_day}` : (p.start || '—');
    const end   = tl.end_day   ? `Day ${tl.end_day}`   : (p.end   || '—');
    const perm  = p.permit || '—';
    const lab   = p.labor  || '—';
    const permClass = perm.toLowerCase().includes('approved') ? 'pill-ok'
                    : perm.toLowerCase().includes('pending') || perm.toLowerCase().includes('revision') ? 'pill-warn'
                    : 'pill-blue';
    const labClass = lab.toLowerCase().includes('shortage') ? 'pill-err' : 'pill-ok';
    return `<tr>
      <td><span class="phase-num">${i+1}</span></td>
      <td><span class="phase-name">${p.name||''}</span></td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${start}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted)">${end}</td>
      <td><span class="dur-badge">${p.duration||'—'}</span></td>
      <td style="font-size:11px;color:var(--text)">${p.material||'—'}</td>
      <td><span class="status-pill ${labClass}">${lab}</span></td>
      <td><span class="status-pill ${permClass}">${perm}</span></td>
    </tr>`;
  }).join('');

  buildGantt(phaseEntries, totalDays);
  buildAgentLog(phaseEntries);
}

function buildGantt(phases, totalDays) {
  const total = totalDays || phases.reduce((s,p)=>{const m=(p.duration||'').match(/(\d+)/);return s+(m?parseInt(m[1]):0);},0)||1;
  const colors=['#4A9EFF','#F5A623','#00C896','#A78BFA','#FF5C5C','#5BDB6F'];
  document.getElementById('gantt-header').innerHTML =
    Array.from({length:6},(_,i)=>`<div class="gantt-tick">Day ${Math.round((i+1)*total/6)}</div>`).join('');
  document.getElementById('gantt-rows').innerHTML = phases.map((p,i)=>{
    const tl=p.timeline||{};
    const s=tl.start_day||1, e=tl.end_day||s;
    const left=((s-1)/total*100).toFixed(1);
    const width=((e-s+1)/total*100).toFixed(1);
    return `<div class="gantt-row">
      <div class="gantt-label">${p.name||''}</div>
      <div class="gantt-track"><div class="gantt-bar" style="left:${left}%;width:${width}%;background:${colors[i%colors.length]}"></div></div>
      <div class="gantt-days">${p.duration||''}</div>
    </div>`;
  }).join('');
}

function buildAgentLog(phases) {
  const lines = [`<div class="log-line"><span class="log-tag tag-think">THINK</span><span>Analyzing goal — decomposing into ${phases.length} phases</span></div>`];
  phases.forEach(p=>{
    lines.push(`<div class="log-line"><span class="log-tag tag-call">CALL</span><span>check_material_availability("${p.name}") → ${p.material||'—'}</span></div>`);
    lines.push(`<div class="log-line"><span class="log-tag tag-obs">OBS</span><span>check_worker_availability("${p.name}") → ${p.labor||'—'}</span></div>`);
    lines.push(`<div class="log-line"><span class="log-tag tag-call">CALL</span><span>check_permit_status("${p.name}") → ${p.permit||'—'}</span></div>`);
    lines.push(`<div class="log-line"><span class="log-tag tag-obs">OBS</span><span>calculate_duration("${p.name}") → ${p.duration||'—'}</span></div>`);
  });
  lines.push(`<div class="log-line"><span class="log-tag tag-done">DONE</span><span>All tool calls complete — generating final plan</span></div>`);
  document.getElementById('agent-log-content').innerHTML = lines.join('');
}

// ── Render plan markdown ──
function renderPlan(text){
  let html=text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g,(_,header,rows)=>{
      const ths=header.split('|').filter(c=>c.trim()).map(c=>'<th>'+c.trim()+'</th>').join('');
      const trs=rows.trim().split('\n').map(r=>'<tr>'+r.split('|').filter(c=>c.trim()).map(c=>'<td>'+c.trim()+'</td>').join('')+'</tr>').join('');
      return '<table><thead><tr>'+ths+'</tr></thead><tbody>'+trs+'</tbody></table>';
    })
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g,m=>'<ul>'+m+'</ul>')
    .replace(/\n{2,}/g,'</p><p>');
  document.getElementById('plan-content').innerHTML=html;
  // scroll to bottom
  const cb=document.getElementById('chat-body');
  setTimeout(()=>cb.scrollTop=cb.scrollHeight,100);
}

// ── Generate plan ──
async function generatePlan(){
  const homeInput=document.getElementById('goal-input');
  const replyInput=document.getElementById('reply-input');
  const goal=(homeInput.value||replyInput.value).trim();
  if(!goal)return;

  const activeTools=getActiveTools();
  document.getElementById('send-btn').disabled=true;
  document.getElementById('reply-send-btn').disabled=true;
  completedSteps=new Set();
  activeHistoryId=null;

  showChatScreen(goal);
  document.getElementById('topbar-title').textContent=goal;
  homeInput.value='';replyInput.value='';

  document.getElementById('reply-bar').style.display = 'none';
  document.getElementById('thinking-wrap').style.display = 'flex';
  setTimeout(() => startWave(), 50);
  drawerClear();
  drawerSetActive(true);
  drawerLog('INIT', 'tag-think', `<span class="hl">Goal received</span> — initializing Arch agent`);
  drawerLog('THINK', 'tag-think', `Decomposing into 6 construction phases`);

  renderAnalysisBlock(new Set(),true);
  setTimeout(()=>markStep('init'),150);

  try{
    const res=await fetch('/plan/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goal,tools:activeTools})});
    if(!res.ok)throw new Error('Server error '+res.status);
    const reader=res.body.getReader();const dec=new TextDecoder();let buf='';
    while(true){
      const{done,value}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\n');buf=lines.pop();
      for(const line of lines){
        if(!line.startsWith('data: '))continue;
        const data=JSON.parse(line.slice(6));
        if(data.type==='tool_call'){
          const k=TOOL_TO_STEP[data.name];if(k)markStep(k);
          const pct=Math.min(90,Math.round((completedSteps.size/7)*100));
          document.getElementById('progress-fill').style.width=pct+'%';
          // drawer log
          const tagMap={check_material_availability:['MATL','tag-call'],check_worker_availability:['LABR','tag-obs'],check_permit_status:['PRMT','tag-call'],calculate_duration:['DURN','tag-obs']};
          const [tag,cls]=tagMap[data.name]||['CALL','tag-call'];
          drawerLog(tag, cls, `<span class="hl">${data.arg}</span> → <span class="val">${data.result||''}</span>`);
          
        }else if(data.type==='final'){
          document.getElementById('thinking-wrap').style.display='none';
          stopWave();
          document.getElementById('progress-fill').style.width='100%';
          document.getElementById('status-dot').className='status-dot done';
          markStep('plan');setTimeout(()=>markStep('final'),250);
          drawerLog('DONE', 'tag-done', '<span class="hl">Plan finalized</span> — all tool calls complete');
          drawerSetActive(false);
          renderPlan(data.content);
          if(data.id){activeHistoryId=data.id;}
          await loadHistory();
          const saved=historyData.find(h=>h.id===activeHistoryId);
          if(saved) populateDashboard(saved, completedSteps.size);
        }else if(data.type==='error'){
          document.getElementById('thinking-wrap').style.display='none';
          stopWave();
          document.getElementById('status-dot').className='status-dot';
          const isRateLimit = data.message.includes('Rate limit');
          document.getElementById('plan-content').innerHTML=
            `<p style="color:${isRateLimit?'var(--accent)':'#eb5757'};font-size:0.9rem;line-height:1.6">
              ${isRateLimit ? '⏳ ' : '⚠️ '}${data.message}
            </p>`;
        }
      }
    }
  }catch(e){
    document.getElementById('plan-content').innerHTML='<p style="color:#eb5757">Error: '+e.message+'</p>';
  }finally{
    document.getElementById('send-btn').disabled=false;
    document.getElementById('reply-send-btn').disabled=false;
  }
}

loadHistory();
