import { getNotes, removeNote, saveNote } from './storage.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character]));
let resizeObserver;
let observedStage;
let hubNotice = '';

function renderNode(node) {
  const id = esc(node.id);
  const referralContact=node.referralEmail?`<a href="mailto:${esc(node.referralEmail)}">${esc(node.referralEmail)}</a>`:'';
  const rows = [['Website',node.site?`<a href="${esc(node.site)}" target="_blank" rel="noopener noreferrer">${esc(node.site)}</a>`:''],['They offer',esc(node.offer)],['Career',esc(node.job)],['Employee referral',esc(node.referralName)],['Referral email',referralContact],['Referral context',esc(node.referralContext)],['My notes',esc(node.notes)]]
    .filter(([,value])=>value).map(([label,value])=>`<div class="node-row"><strong>${label}</strong>${value}</div>`).join('');
  return `<article class="surface node" data-node-id="${id}"><span class="dot" aria-hidden="true"></span><h2>${esc(node.company)}</h2><span class="status-tag">${esc(node.status)}</span>${node.source==='recruiter-re-audit'?'<span class="audit-tag">RE-audit</span>':''}${rows}<div class="node-actions"><button class="button" data-action="edit-node" data-id="${id}">Edit</button><button class="button button-quiet" data-action="delete-node" data-id="${id}">Delete</button></div></article>`;
}

function renderAuditEntry(note) {
  const email=note.referralEmail?`<a href="mailto:${esc(note.referralEmail)}">${esc(note.referralEmail)}</a>`:'Not provided';
  const date=note.submittedAt?new Date(note.submittedAt).toLocaleDateString():'Date unavailable';
  const attachment=note.attachmentPath?`<button class="button audit-file-button" data-action="view-audit-file" data-path="${esc(note.attachmentPath)}">Open private attachment</button>`:'';
  return `<article class="audit-entry"><div class="audit-entry-heading"><div><p class="eyebrow">RE-audit · ${esc(date)}</p><h3>${esc(note.company)}</h3></div><span class="status-tag">${esc(note.status)}</span></div><dl><div><dt>Recruiter</dt><dd>${esc(note.recruiterName||'Not provided')}</dd></div><div><dt>Employee referral</dt><dd>${esc(note.referralName||'Not provided')}</dd></div><div><dt>Work email</dt><dd>${email}</dd></div><div><dt>Referral context</dt><dd>${esc(note.referralContext||'No context provided')}</dd></div><div><dt>Generated pitch</dt><dd>${esc(note.notes||note.job)}</dd></div>${attachment?`<div><dt>Supporting file</dt><dd>${attachment}</dd></div>`:''}</dl></article>`;
}

export function renderHub() {
  const notes = getNotes();
  const audits=notes.filter(note=>note.source==='recruiter-re-audit');
  const notice = hubNotice ? `<p class="hub-notice" role="status" aria-live="polite">${esc(hubNotice)}</p>` : '';
  hubNotice = '';
  const auditPanel=`<section class="surface audit-view" id="audit-view" aria-label="Recruiter RE-audits" hidden><div class="audit-view-heading"><div><p class="eyebrow">Recruiter submissions</p><h2>Referral audit</h2></div><span class="audit-count">${audits.length} ${audits.length===1?'submission':'submissions'}</span></div>${audits.length?`<div class="audit-list">${audits.map(renderAuditEntry).join('')}</div>`:'<p class="audit-empty">No recruiter referrals have been submitted yet.</p>'}<p class="audit-feedback" id="audit-feedback" role="status" aria-live="polite"></p></section>`;
  return `${notice}<div class="neural-backdrop" aria-hidden="true"><canvas id="neural-canvas"></canvas></div><section class="stage" id="stage" aria-label="Company network"><svg class="links" id="links" aria-hidden="true"></svg><div class="core" id="core"><span class="core-title">Your network</span><div class="core-count">${notes.length} connected ${notes.length===1?'company':'companies'}</div><span class="dot" aria-hidden="true"></span></div><div class="hub-toolbar"><button class="button button-primary" data-action="add-node">＋ Add company</button><button class="button button-quiet audit-toggle" data-action="view-audit" aria-expanded="false" aria-controls="audit-view">View Audit <span>${audits.length}</span></button></div>${notes.length?`<div class="node-grid">${notes.map(renderNode).join('')}</div>`:`<div class="surface empty-state"><div class="empty-icon" aria-hidden="true">⌁</div><h2>Your network starts here</h2><p>Add a company to connect research, career notes, and recruiter conversations in one place.</p></div>`}</section>${auditPanel}`;
}

export function toggleAuditView() {
  const panel=$('#audit-view'),button=$('[data-action="view-audit"]');
  if(!panel||!button)return;
  panel.hidden=!panel.hidden;
  button.setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden)panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
}

export function clearHubLinks() {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  observedStage = undefined;
}

export function drawHubLinks() {
  const stage=$('#stage'),svg=$('#links'),coreDot=$('#core .dot');
  if(!stage||!svg||!coreDot)return;
  const stageRect=stage.getBoundingClientRect(),coreRect=coreDot.getBoundingClientRect();
  const x0=coreRect.left+coreRect.width/2-stageRect.left,y0=coreRect.top+coreRect.height/2-stageRect.top;
  svg.setAttribute('viewBox',`0 0 ${stageRect.width} ${stageRect.height}`);
  svg.innerHTML=[...stage.querySelectorAll('.node .dot')].map(dot=>{
    const bounds=dot.getBoundingClientRect(),x=bounds.left+bounds.width/2-stageRect.left,y=bounds.top+bounds.height/2-stageRect.top;
    const deltaX=x-x0,deltaY=y-y0,verticalPull=Math.abs(deltaY)*.48,horizontalPull=deltaX*.12,directionY=Math.sign(deltaY||1);
    const cp1X=x0+horizontalPull,cp2X=x-horizontalPull,cp1Y=y0+directionY*verticalPull,cp2Y=y-directionY*verticalPull;
    return `<path d="M ${x0} ${y0} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${x} ${y}"/>`;
  }).join('');
  if('ResizeObserver' in window&&observedStage!==stage){
    resizeObserver?.disconnect();
    resizeObserver=new ResizeObserver(drawHubLinks);
    observedStage=stage;
    resizeObserver.observe(stage);
  }
}

export function openNodeDialog(id) {
  const note=getNotes().find(item=>item.id===id)||{status:'Researching'},dialog=$('#node-dialog');
  $('#node-form-feedback').textContent='';
  $('#dialog-title').textContent=id?'Edit company':'Add a company';
  for(const field of ['company','site','offer','job','notes','status'])$(`#f-${field}`).value=note[field]||'';
  dialog.dataset.editId=id||'';dialog.showModal();
}

export async function saveDialogNode() {
  const dialog=$('#node-dialog'),company=$('#f-company').value.trim();
  const feedback=$('#node-form-feedback');
  feedback.textContent='';
  if(!company){$('#f-company').focus();return false;}
  const id=dialog.dataset.editId||`n${Date.now()}`,existing=getNotes().find(item=>item.id===id)||{},node={...existing,id,company};
  for(const field of ['site','offer','job','notes','status'])node[field]=$(`#f-${field}`).value.trim();
  if(!await saveNote(node)){feedback.textContent='Could not save this company. Check the connection and try again.';return false;}
  const messages=dialog.dataset.editId?[
    `Thanks for keeping ${company} up to date.`,
    `${company}'s details are refreshed. Your network appreciates the care.`,
    `Great follow-through. ${company} is current in your network.`
  ]:[
    `Thanks for adding ${company} to your network.`,
    `${company} is connected. Thanks for building your network thoughtfully.`,
    `A new connection starts here. Thanks for adding ${company}.`
  ];
  hubNotice=messages[Math.floor(Math.random()*messages.length)];
  dialog.close();return true;
}

export async function deleteHubNode(id) {
  const node=getNotes().find(item=>item.id===id);
  if(!node||!window.confirm(`Delete ${node.company} from your network?`))return false;
  return removeNote(id);
}