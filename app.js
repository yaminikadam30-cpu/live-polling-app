const app = document.querySelector('#app');
const socket = io();
const KEY = 'pulsePresentationsV7';

let state = {
  role: 'landing', presentation: null, slideIndex: 0,
  session: null, participant: null, hostToken: null,
  slide: null, review: [], leaderboard: null, answer: null, timer: null
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const uid = () => crypto.randomUUID();
const getPres = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const savePres = (p) => { p.updatedAt = Date.now(); const a = getPres(); const i = a.findIndex(x => x.id === p.id); if (i >= 0) a[i] = p; else a.unshift(p); localStorage.setItem(KEY, JSON.stringify(a)); };
const toast = (text) => { let t=$('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.append(t);} t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); };

function makeSlide(type='quiz') {
  const s = {id:uid(), type, title:'', body:'', image:'', font:'Inter', fontSize:44, duration:30, options:[], correctOptionIndex:null};
  if(type==='quiz'){s.title='Your question here';s.options=['Option 1','Option 2','Option 3','Option 4'].map((text,i)=>({id:String(i),text,image:''}));s.correctOptionIndex=0;}
  if(type==='truefalse'){s.title='True or false?';s.options=[{id:'0',text:'True',image:''},{id:'1',text:'False',image:''}];s.correctOptionIndex=0;}
  if(type==='poll'){s.title='What do you think?';s.options=['Option 1','Option 2','Option 3'].map((text,i)=>({id:String(i),text,image:''}));}
  if(type==='content'){s.title='Add a heading';s.body='Add your text here…';s.duration=0;}
  if(type==='leaderboard'){s.title='Leaderboard';s.duration=0;}
  return s;
}
function newPresentation(){return{id:uid(),title:'My first presentation',updatedAt:Date.now(),slides:[makeSlide('quiz')]};}
function normalizePresentation(p){
  p = JSON.parse(JSON.stringify(p || newPresentation()));
  p.id ||= uid(); p.title ||= 'Untitled presentation'; p.slides = Array.isArray(p.slides)&&p.slides.length?p.slides: [makeSlide('quiz')];
  p.slides = p.slides.map(s=>({...makeSlide(s.type||'quiz'),...s,id:s.id||uid(),options:Array.isArray(s.options)?s.options.map((o,i)=>({id:String(i),text:String(o?.text??''),image:o?.image||''})):[]}));
  return p;
}

function landing(){
  stopTimer(); state.role='landing';
  app.innerHTML=`<div class="dashboard"><header class="dashbar"><button class="brand brand-btn" id="brand">pulse<span>.</span></button></header><main class="dashmain landing-main"><div class="eyebrow">LIVE PRESENTATIONS · QUIZZES · EMPLOYEE ENGAGEMENT</div><h1>Present live. Everyone joins together.</h1><p class="dashsub landing-sub">Create your presentation first. When you're ready, host a live session, let everyone wait in one lobby, then start the first question together.</p><div class="pres-grid landing-actions"><button class="pres-card action-card" id="join"><h2>👥 Join an existing quiz</h2><p>Enter the host's 6-digit code, your name and employee code.</p></button><button class="pres-card action-card" id="host"><h2>🎤 Host a quiz</h2><p>Create a presentation or host one you've already saved.</p></button></div></main></div>`;
  $('#join').onclick=joinScreen; $('#host').onclick=hostChooser; $('#brand').onclick=landing;
}
function joinScreen(prefill=''){
  app.innerHTML=`<div class="dashboard"><main class="dashmain narrow"><button class="secondary" id="back">← Back</button><div class="eyebrow page-eyebrow">JOIN LIVE SESSION</div><h1>Join a quiz</h1><p class="dashsub">Enter your details. You'll wait in the lobby until the host starts.</p><form id="joinForm" class="stack"><input id="code" maxlength="6" inputmode="numeric" placeholder="6-digit session code" value="${esc(prefill)}" required><input id="name" maxlength="32" placeholder="Your name" required><input id="employeeCode" maxlength="32" placeholder="Employee code" required><button class="primary" type="submit">Join session</button><div id="err" class="hint"></div></form></main></div>`;
  $('#back').onclick=landing; $('#joinForm').onsubmit=e=>{e.preventDefault();participantJoin($('#code').value.trim(),$('#name').value.trim(),$('#employeeCode').value.trim());};
}
function hostChooser(){
  const a=getPres();
  app.innerHTML=`<div class="dashboard"><main class="dashmain host-chooser"><button class="secondary" id="back">← Back</button><div class="eyebrow page-eyebrow">HOST</div><h1>Host a quiz</h1><p class="dashsub">Create a new presentation or edit one you've already created before starting the live session.</p><div class="chooser-actions"><button class="primary" id="create">+ Create new presentation</button><button class="secondary" id="dashboardBtn">My presentations</button></div>${a.length?`<div class="pres-grid">${a.map(p=>`<article class="pres-card"><div class="pres-preview">${mini(p.slides[0])}</div><h3>${esc(p.title)}</h3><span class="hint">${p.slides.length} slide${p.slides.length===1?'':'s'}</span><div class="card-actions"><button data-edit="${p.id}">Edit</button><button data-host="${p.id}">Host</button><button data-copy="${p.id}">Duplicate</button></div></article>`).join('')}</div>`:`<div class="empty"><h2>No presentations yet</h2><p class="hint">Create your first quiz to get started.</p></div>`}</main></div>`;
  $('#back').onclick=landing; $('#create').onclick=()=>editor(newPresentation()); $('#dashboardBtn').onclick=dashboard;
  $$('[data-edit]').forEach(b=>b.onclick=()=>{const p=getPres().find(x=>x.id===b.dataset.edit);if(p)editor(p);});
  $$('[data-host]').forEach(b=>b.onclick=()=>{const p=getPres().find(x=>x.id===b.dataset.host);if(p)startSession(p);});
  $$('[data-copy]').forEach(b=>b.onclick=()=>{const p=getPres().find(x=>x.id===b.dataset.copy);if(!p)return;const c=JSON.parse(JSON.stringify(p));c.id=uid();c.title+=' — Copy';savePres(c);hostChooser();});
}
function dashboard(){
  const a=getPres();
  app.innerHTML=`<div class="dashboard"><header class="dashbar"><button class="brand brand-btn" id="home">pulse<span>.</span></button><div class="dash-actions"><button class="secondary" id="join">Join</button><button class="primary" id="new">+ New presentation</button></div></header><main class="dashmain"><div class="eyebrow">WORKSPACE · MY PRESENTATIONS</div><h1>Your presentations.</h1><p class="dashsub">Build your complete quiz before you go live.</p><div class="pres-grid">${a.length?a.map(p=>`<article class="pres-card"><div class="pres-preview">${mini(p.slides[0])}</div><h3>${esc(p.title)}</h3><span class="hint">${p.slides.length} slide${p.slides.length===1?'':'s'}</span><div class="card-actions"><button data-edit="${p.id}">Edit</button><button data-present="${p.id}">Present</button><button data-copy="${p.id}">Duplicate</button></div></article>`).join(''):`<div class="empty"><h2>No presentations yet</h2><button class="primary" id="empty">Create presentation</button></div>`}</div></main></div>`;
  $('#home').onclick=landing; $('#join').onclick=joinScreen; $('#new').onclick=()=>editor(newPresentation()); $('#empty')?.addEventListener('click',()=>editor(newPresentation()));
  $$('[data-edit]').forEach(b=>b.onclick=()=>{const p=getPres().find(x=>x.id===b.dataset.edit);if(p)editor(p);}); $$('[data-present]').forEach(b=>b.onclick=()=>{const p=getPres().find(x=>x.id===b.dataset.present);if(p)startSession(p);}); $$('[data-copy]').forEach(b=>b.onclick=()=>{const p=getPres().find(x=>x.id===b.dataset.copy);if(!p)return;const c=JSON.parse(JSON.stringify(p));c.id=uid();c.title+=' — Copy';savePres(c);dashboard();});
}
function mini(s){return`<div class="mini-slide"><div class="mini-type">${esc(s?.type||'SLIDE')}</div><div>${esc(s?.title||s?.body||'Untitled')}</div></div>`;}

function editor(p){stopTimer(); state.role='editor'; state.presentation=normalizePresentation(p); state.slideIndex=Math.min(state.slideIndex,state.presentation.slides.length-1); renderEditor();}
function renderEditor(){
  const p=state.presentation; const s=p.slides[state.slideIndex];
  app.innerHTML=`<div class="editor-page"><header class="editor-top"><button class="brand brand-btn" id="editorHome">pulse<span>.</span></button><div class="title-editor"><input id="presentationTitle" value="${esc(p.title)}" aria-label="Presentation title"><span>⌄</span></div><div class="editor-top-actions"><button class="secondary" id="save">Save</button><button class="primary" id="present">Present</button></div></header><div class="editor-body"><aside class="slide-sidebar"><button class="new-slide" id="add">+ New slide</button><div class="slide-list" id="slideList">${p.slides.map((x,i)=>`<div class="slide-item ${i===state.slideIndex?'active':''}" draggable="true" data-slide-index="${i}"><span>${i+1}</span>${mini(x)}</div>`).join('')}</div></aside><main class="canvas-area"><div class="canvas-toolbar"><span><b>Slide ${state.slideIndex+1}</b> of ${p.slides.length}</span><div><button id="duplicate">Duplicate</button><button id="delete">Delete</button></div></div><div class="canvas-wrap">${canvas(s)}</div></main><aside class="edit-panel"><div class="panel-head"><b>Edit slide</b><span class="hint">Changes save automatically</span></div>${panel(s)}</aside></div></div>`;
  bindEditor(); bindDrag();
}
function canvas(s){
  const fs=Math.min(Number(s.fontSize)||44,64);
  if(s.type==='leaderboard')return`<div class="presentation-canvas"><div class="content-slide"><div class="mini-type">LEADERBOARD</div><div class="canvas-title" style="font-family:${esc(s.font)};font-size:${fs}px">🏆 ${esc(s.title)}</div><div class="fake-board"><div>🥇 Top participant</div><div>🥈 Second place</div><div>🥉 Third place</div></div></div></div>`;
  return`<div class="presentation-canvas"><div class="quiz-canvas"><div class="mini-type">${esc(s.type.toUpperCase())}</div><div class="canvas-title" style="font-family:${esc(s.font)};font-size:${fs}px">${esc(s.title)}</div>${s.body?`<div class="canvas-body">${esc(s.body)}</div>`:''}${s.image?`<img class="question-image" src="${esc(s.image)}">`:''}<div class="canvas-options">${(s.options||[]).map((o,i)=>`<div class="canvas-option"><span>${String.fromCharCode(65+i)}</span>${esc(o.text)}</div>`).join('')}</div>${s.duration>0?`<div class="canvas-timer">⏱ ${s.duration}s</div>`:''}</div></div>`;
}
function panel(s){
  let h=`<div class="panel-section"><label>Slide type</label><select id="type"><option value="quiz" ${s.type==='quiz'?'selected':''}>Quiz — Select Answer</option><option value="truefalse" ${s.type==='truefalse'?'selected':''}>Quiz — True / False</option><option value="poll" ${s.type==='poll'?'selected':''}>Multiple Choice Poll</option><option value="content" ${s.type==='content'?'selected':''}>Content / Text</option><option value="leaderboard" ${s.type==='leaderboard'?'selected':''}>Leaderboard</option></select></div>`;
  if(s.type!=='leaderboard')h+=`<div class="panel-section"><label>${s.type==='content'?'Heading':'Question'}</label><textarea id="title" rows="3">${esc(s.title)}</textarea></div>`;
  if(s.type==='content')h+=`<div class="panel-section"><label>Body</label><textarea id="body" rows="8">${esc(s.body)}</textarea></div>`;
  if(['quiz','truefalse','poll'].includes(s.type))h+=`<div class="panel-section"><label>Answer options</label>${s.options.map((o,i)=>`<div class="option-edit"><input data-opt="${i}" value="${esc(o.text)}"><button type="button" data-correct="${i}" class="correct-btn ${s.correctOptionIndex===i?'selected':''}" title="Mark correct">${s.type==='poll'?'•':'✓'}</button></div>`).join('')}<button type="button" class="text-btn" id="addOpt">+ Add option</button></div>`;
  if(['quiz','truefalse','poll'].includes(s.type))h+=`<div class="panel-section"><label>Time limit</label><div class="timer-row"><input id="duration" type="number" min="0" max="600" value="${Number(s.duration)||0}"><span>seconds · 0 = no limit</span></div></div>`;
  if(s.type!=='leaderboard')h+=`<div class="panel-section"><label>Design</label><div class="design-row"><select id="font"><option ${s.font==='Inter'?'selected':''}>Inter</option><option ${s.font==='DM Sans'?'selected':''}>DM Sans</option><option ${s.font==='Space Grotesk'?'selected':''}>Space Grotesk</option><option ${s.font==='Georgia'?'selected':''}>Georgia</option><option ${s.font==='Arial'?'selected':''}>Arial</option></select><input id="fontSize" type="number" min="18" max="96" value="${Number(s.fontSize)||44}"></div><label class="upload-label">${s.image?'Change image':'Add image'}<input id="image" type="file" accept="image/png,image/jpeg,image/gif"></label></div>`;
  return h;
}
function bindEditor(){
  $('#editorHome').onclick=dashboard;
  $('#save').onclick=()=>{savePres(state.presentation);toast('Saved');};
  $('#present').onclick=()=>startSession(state.presentation);
  const title=$('#presentationTitle'); title.oninput=()=>{state.presentation.title=title.value;savePres(state.presentation);}; title.onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};
  $('#add').onclick=addSlide;
  $('#duplicate').onclick=()=>{const c=JSON.parse(JSON.stringify(state.presentation.slides[state.slideIndex]));c.id=uid();state.presentation.slides.splice(state.slideIndex+1,0,c);state.slideIndex++;savePres(state.presentation);renderEditor();};
  $('#delete').onclick=()=>{if(state.presentation.slides.length===1)return toast('Keep at least one slide');state.presentation.slides.splice(state.slideIndex,1);state.slideIndex=Math.max(0,state.slideIndex-1);savePres(state.presentation);renderEditor();};
  $('#type')?.addEventListener('change',e=>{const old=state.presentation.slides[state.slideIndex],n=makeSlide(e.target.value);n.id=old.id;state.presentation.slides[state.slideIndex]=n;savePres(state.presentation);renderEditor();});
  $('#title')?.addEventListener('input',e=>{state.presentation.slides[state.slideIndex].title=e.target.value;savePres(state.presentation);updateCanvas();});
  $('#body')?.addEventListener('input',e=>{state.presentation.slides[state.slideIndex].body=e.target.value;savePres(state.presentation);updateCanvas();});
  $$('[data-opt]').forEach(x=>x.addEventListener('input',e=>{state.presentation.slides[state.slideIndex].options[Number(x.dataset.opt)].text=e.target.value;savePres(state.presentation);updateCanvas();}));
  $$('[data-correct]').forEach(b=>b.onclick=()=>{state.presentation.slides[state.slideIndex].correctOptionIndex=Number(b.dataset.correct);savePres(state.presentation);renderEditor();});
  $('#addOpt')?.addEventListener('click',()=>{const s=state.presentation.slides[state.slideIndex];s.options.push({id:String(s.options.length),text:'New option',image:''});savePres(state.presentation);renderEditor();});
  $('#duration')?.addEventListener('input',e=>{state.presentation.slides[state.slideIndex].duration=Math.max(0,Math.min(600,Number(e.target.value)||0));savePres(state.presentation);updateCanvas();});
  $('#font')?.addEventListener('change',e=>{state.presentation.slides[state.slideIndex].font=e.target.value;savePres(state.presentation);updateCanvas();});
  $('#fontSize')?.addEventListener('input',e=>{state.presentation.slides[state.slideIndex].fontSize=Math.max(18,Math.min(96,Number(e.target.value)||44));savePres(state.presentation);updateCanvas();});
  $('#image')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1400000)return alert('Use an image under 1.4 MB');state.presentation.slides[state.slideIndex].image=await dataUrl(f);savePres(state.presentation);renderEditor();});
}
function updateCanvas(){const e=$('.canvas-wrap');if(e)e.innerHTML=canvas(state.presentation.slides[state.slideIndex]);}
function addSlide(){const types=[['quiz','Quiz — Select Answer'],['truefalse','True / False'],['poll','Multiple Choice Poll'],['content','Content / Text']];const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<div class="add-menu"><h3>Add a slide</h3>${types.map(([v,t])=>`<button data-newtype="${v}"><b>${t}</b><span>${v==='quiz'?'Scored multiple choice':v==='poll'?'Collect opinions':v==='truefalse'?'Quick true/false':'Text and content'}</span></button>`).join('')}<button data-newtype="cancel"><b>Cancel</b></button></div>`;document.body.append(wrap);wrap.querySelectorAll('[data-newtype]').forEach(b=>b.onclick=()=>{if(b.dataset.newtype==='cancel'){wrap.remove();return;}const s=makeSlide(b.dataset.newtype);state.presentation.slides.splice(state.slideIndex+1,0,s);state.slideIndex++;savePres(state.presentation);wrap.remove();renderEditor();});}
function bindDrag(){let from=null;$$('[data-slide-index]').forEach(el=>{el.addEventListener('dragstart',e=>{from=Number(el.dataset.slideIndex);el.classList.add('dragging');e.dataTransfer.effectAllowed='move';});el.addEventListener('dragend',()=>el.classList.remove('dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const to=Number(el.dataset.slideIndex);if(from===null||from===to)return;const [moved]=state.presentation.slides.splice(from,1);state.presentation.slides.splice(to,0,moved);state.slideIndex=to;from=null;savePres(state.presentation);renderEditor();});});}
function dataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}

async function startSession(p){
  p=normalizePresentation(p); savePres(p); state.presentation=p;
  try{const r=await fetch('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:p.title,slides:p.slides})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not create session');state.role='host';state.session=d;state.hostToken=d.hostToken;state.leaderboard=null;socket.emit('host:join',{code:d.code,token:d.hostToken},reply=>{if(reply?.error)return alert(reply.error);state.session=reply.session;state.slide=reply.slide;state.leaderboard=reply.leaderboard;hostScreen();});}catch(e){alert(e.message);}
}
function hostScreen(){stopTimer();const s=state.session;if(!s)return;app.innerHTML=`<div class="present-shell"><div class="present-bar"><div><b>PULSE</b><span>${esc(s.title)}</span></div><div class="present-code">Join: <strong>${s.code}</strong></div><button class="secondary" id="exit">Exit</button></div><main class="present-main" id="hostMain"></main></div>`;$('#exit').onclick=()=>{stopTimer();dashboard();};renderHost();}
function renderHost(){const m=$('#hostMain'),s=state.session;if(!m)return;stopTimer();
  if(s.status==='lobby'){m.innerHTML=`<div class="host-stage-large"><div class="lobby-message"><div class="eyebrow">WAITING ROOM</div><h1>Everyone's in the lobby.</h1><div class="big-code">${s.code}</div><p class="notice">${s.participants} participant${s.participants===1?'':'s'} joined</p><p>Start when everyone is ready.</p><button class="primary" id="startQuiz">Start quiz</button></div></div>`;$('#startQuiz').onclick=()=>socket.emit('host:start');return;}
  if(s.status==='slide'){const sl=state.slide||{};m.innerHTML=`<div class="host-stage-large"><div class="host-question"><div class="eyebrow">QUESTION ${s.slideIndex+1} OF ${s.slideCount}</div><h1>${esc(sl.title)}</h1>${sl.image?`<img class="host-image" src="${esc(sl.image)}">`:''}<div class="host-timer" id="hostTimer">${Number(sl.duration)||0}</div><div class="host-options">${(sl.options||[]).map((o,i)=>`<div><span>${String.fromCharCode(65+i)}</span>${esc(o.text)}</div>`).join('')}</div><p class="notice"><strong id="answerCount">${sl.totalAnswers||0}</strong> responses</p></div></div><div class="present-controls"><button class="secondary" id="closeAnswers">Reveal answer & leaderboard</button></div>`;$('#closeAnswers').onclick=()=>socket.emit('host:close');if(Number(sl.duration)>0)startTimer(sl.startedAt,Number(sl.duration)*1000,'#hostTimer');return;}
  if(s.status==='results'){const sl=state.slide||{};m.innerHTML=`<div class="host-stage-large"><div class="host-results"><div class="eyebrow">RESULTS</div><h1>${esc(sl.title)}</h1><p class="correct-answer">Correct answer: <strong>${esc((sl.options||[]).find(o=>o.id===state._correctOptionId)?.text||'—')}</strong></p>${leaderboardMarkup(state.leaderboard)}</div></div><div class="present-controls"><button class="primary" id="next">${s.slideIndex+1>=s.slideCount?'Finish quiz':'Next'}</button></div>`;$('#next').onclick=()=>socket.emit('host:next');return;}
  if(s.status==='complete'){m.innerHTML=`<div class="host-stage-large"><div class="host-results"><div class="eyebrow">FINAL RESULTS</div><h1>🏆 Quiz complete</h1>${leaderboardMarkup(state.leaderboard)}</div></div>`;return;}
}
function participantJoin(code,name,employeeCode){socket.emit('participant:join',{code,name,employeeCode},reply=>{if(reply?.error){$('#err')&&( $('#err').textContent=reply.error);return;}state.role='participant';state.participant=reply.participant;state.session=reply.session;state.slide=reply.slide;state.leaderboard=reply.leaderboard;state.answer=null;participantScreen();});}
function participantScreen(){stopTimer();const s=state.session;if(!s)return;if(s.status==='lobby')return participantLobby();if(s.status==='complete')return participantComplete();if(s.status==='results')return participantResults();if(s.status==='slide')return participantQuestion();}
function participantLobby(){app.innerHTML=`<div class="participant-page"><div class="waiting-card" style="margin:80px auto"><div class="eyebrow">YOU'RE IN</div><h1>Welcome, ${esc(state.participant?.name)}</h1><p>You're in the lobby for <strong>${esc(state.session.title)}</strong>.</p><div class="waiting-dot">● Waiting for the host…</div></div></div>`;}
function participantQuestion(){const sl=state.slide||{};const answered=!!state.answer;app.innerHTML=`<div class="participant-page"><div class="participant-head"><span>${esc(state.session.title)}</span><b>Question ${state.session.slideIndex+1} / ${state.session.slideCount}</b></div><section class="participant-question"><div class="participant-timer" id="participantTimer">${Number(sl.duration)||0}</div><h1>${esc(sl.title)}</h1>${sl.image?`<img class="participant-image" src="${esc(sl.image)}">`:''}<div class="participant-options">${(sl.options||[]).map(o=>`<button data-option="${esc(o.id)}" ${answered?'disabled':''}>${esc(o.text)}</button>`).join('')}</div><p class="notice">${answered?'✓ Answer submitted — watch the leaderboard.':'Select one answer before time runs out.'}</p></section></div>`;$$('[data-option]').forEach(b=>b.onclick=()=>answerParticipant(b.dataset.option));if(Number(sl.duration)>0)startTimer(sl.startedAt,Number(sl.duration)*1000,'#participantTimer');}
function answerParticipant(optionId){if(state.answer)return;socket.emit('participant:answer',{optionId},reply=>{if(reply?.error){toast(reply.error);return;}state.answer=reply;state.participant.score=reply.score;state.leaderboard=reply.leaderboard;participantQuestion();});}
function participantResults(){const sl=state.slide||{};app.innerHTML=`<div class="participant-page"><div class="participant-head"><span>${esc(state.session.title)}</span><b>Results</b></div><section class="participant-result"><div class="result-icon">${state.answer?.isCorrect?'✓':'✕'}</div><h1>${state.answer?.isCorrect?'Correct!':'Not quite'}</h1><div class="score-pop">+${Number(state.answer?.earnedPoints||0).toLocaleString()} points</div><h2>${esc(sl.title)}</h2><p class="correct-answer">Correct answer: <strong>${esc((sl.options||[]).find(o=>o.id===state._correctOptionId)?.text||'—')}</strong></p>${leaderboardMarkup(state.leaderboard,state.participant?.name)}<p class="notice">Waiting for the host to continue…</p></section></div>`;}
function participantComplete(){app.innerHTML=`<div class="participant-page"><section class="participant-result"><div class="result-icon">🏆</div><h1>Quiz complete</h1><p>Final standings</p>${leaderboardMarkup(state.leaderboard,state.participant?.name)}</section></div>`;}
function leaderboardMarkup(board,highlight){const top=board?.top||[];return`<div class="live-board"><div class="board-title">🏆 Live leaderboard <span class="hint">Top 10</span></div>${top.length?top.map(p=>`<div class="board-row ${highlight&&p.name===highlight?'me':''}"><span>#${p.rank} ${esc(p.name)}</span><strong>${Number(p.score||0).toLocaleString()}</strong></div>`).join(''):'<p class="notice">No scores yet.</p>'}</div>`;}
function startTimer(startedAt,duration,selector){stopTimer();const el=$(selector);if(!el||!startedAt)return;const tick=()=>{const left=Math.max(0,duration-(Date.now()-startedAt));el.textContent=Math.ceil(left/1000)+'s';if(left>0&&document.body.contains(el))state.timer=requestAnimationFrame(tick);};tick();}
function stopTimer(){if(state.timer)cancelAnimationFrame(state.timer);state.timer=null;}

socket.on('lobby:update',s=>{state.session={...state.session,...s};if(state.role==='host')renderHost();else if(state.role==='participant'&&s.status==='lobby')participantLobby();});
socket.on('session:stats',s=>{state.session={...state.session,...s};if(state.role==='host'&&state.session.status==='lobby')renderHost();});
socket.on('slide:open',sl=>{state.slide=sl;state.answer=null;state._correctOptionId=null;state.session={...state.session,status:'slide',slideIndex:sl.index};if(state.role==='host')renderHost();else if(state.role==='participant')participantScreen();});
socket.on('slide:progress',d=>{state.leaderboard=d.leaderboard||state.leaderboard;if($('#answerCount'))$('#answerCount').textContent=d.totalAnswers;});
socket.on('slide:results',d=>{state.slide=d.slide;state._correctOptionId=d.correctOptionId;state.leaderboard=d.leaderboard;state.session={...state.session,status:'results'};if(state.role==='host')renderHost();else if(state.role==='participant')participantResults();});
socket.on('session:complete',d=>{stopTimer();state.leaderboard=d.leaderboard;state.session={...state.session,status:'complete'};if(state.role==='host')renderHost();else if(state.role==='participant')participantComplete();});

const joinParam=new URLSearchParams(location.search).get('join');
if(joinParam){landing();joinScreen(joinParam);}else landing();
