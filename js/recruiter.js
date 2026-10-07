import { getSkills, saveNote, saveSkills } from './storage.js';
import { deleteSharedFile, uploadSharedFile } from './files.js';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const presets={startup:['Startup','Remote','TypeScript'],fintech:['Fintech','High-Scale','Python'],enterprise:['Enterprise','Agile','Cloud']};
const rarities=['Common','Rare','Epic','Legendary'];
let mode='boost',skills=getSkills(),generatedCard=null;

export function renderRecruiter(){
  const legacyParams=new URLSearchParams(location.hash.split('?')[1]||''),shared=new URLSearchParams(location.search).get('k')?.split(',')||legacyParams.get('k')?.split(',')||[],keywords=[0,1,2].map(i=>esc(shared[i]||'')),initialPreset=Object.entries(presets).find(([,values])=>values.every((value,index)=>value===(shared[index]||'')))?.[0];
  return `<div class="neural-backdrop" aria-hidden="true"><canvas id="neural-canvas"></canvas></div>
    <section class="surface recruiter-panel">
      <header class="expedition-heading">
        <div class="expedition-title"><p class="eyebrow">Recruiter field expedition</p><h1>Read the signal. Make your mark.</h1><p class="recruiter-intro">Explore the company’s culture, tune your response, and build a pitch worth remembering.</p></div>
        <div class="mission-status" id="mission-status" data-state="idle"><span class="mission-beacon" aria-hidden="true"></span><span id="mission-status-text">Awaiting three culture signals</span><strong id="mission-signal-count">0 / 3</strong></div>
        <div class="mission-progress" role="progressbar" aria-label="Culture signal progress" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0"><span id="mission-progress-bar"></span></div>
      </header>
      <section class="mission-block mission-target">
        <p class="mission-step"><span>01</span> Identify the company</p>
        <label class="company-input" for="company-name">Target company <span class="muted">(optional)</span></label>
        <input id="company-name" maxlength="120" autocomplete="organization" placeholder="Name this connection">
        <label for="recruiter-name">Your name <span class="muted">(used for your thank-you)</span></label>
        <input id="recruiter-name" maxlength="120" autocomplete="name" required placeholder="Name of recruiter submitting this audit">
      </section>
      <section class="mission-block mission-signals">
        <p class="mission-step"><span>02</span> Decode its culture</p>
        <div class="keyword-grid">
          <label for="k1">Signal one<input id="k1" maxlength="24" placeholder="e.g. fast-paced" value="${keywords[0]}"></label>
          <label for="k2">Signal two<input id="k2" maxlength="24" placeholder="e.g. remote" value="${keywords[1]}"></label>
          <label for="k3">Signal three<input id="k3" maxlength="24" placeholder="e.g. React" value="${keywords[2]}"></label>
        </div>
      </section>
      <section class="mission-block mission-routes" aria-label="Quick culture routes">
        <p class="mission-step"><span>QUICK ROUTE</span> Start with a known signal pattern</p>
        <div class="presets" aria-label="Quick keyword presets">
          <button class="button preset-button" data-action="apply-preset" data-preset="startup" aria-pressed="${initialPreset==='startup'}">Startup</button>
          <button class="button preset-button" data-action="apply-preset" data-preset="fintech" aria-pressed="${initialPreset==='fintech'}">Fintech</button>
          <button class="button preset-button" data-action="apply-preset" data-preset="enterprise" aria-pressed="${initialPreset==='enterprise'}">Enterprise</button>
        </div>
      </section>
      <fieldset class="referral-fields mission-block mission-ally">
        <legend>03 &nbsp; Referral intelligence <span class="muted">(optional)</span></legend>
        <p class="recruiter-intro">RE-audits and attachments are shared with anyone who can access the Info Hub. Do not submit confidential or sensitive information.</p>
        <div class="referral-grid">
          <label for="referral-name">Employee name<input id="referral-name" maxlength="120" autocomplete="name" placeholder="Who referred you?"></label>
          <label for="referral-email">Work email<input id="referral-email" type="email" maxlength="254" autocomplete="email" placeholder="name@company.com"></label>
        </div>
        <label for="referral-context">Team or introduction context</label>
        <textarea id="referral-context" maxlength="4000" rows="3" placeholder="Role, team, or how they know you"></textarea>
        <label for="audit-attachment">Supporting file <span class="muted">(optional, PDF/DOC/DOCX/TXT, up to 10 MB)</span></label>
        <input id="audit-attachment" type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
      </fieldset>
      <section class="mission-block mission-transmit">
        <p class="mission-step"><span>04</span> Choose your response</p>
        <div class="recruiter-controls">
          <div class="segmented" role="group" aria-label="Card tone">
            <button class="button" id="mode-boost" data-action="set-mode" data-mode="boost" aria-pressed="${mode==='boost'}">Boost</button>
            <button class="button" id="mode-roast" data-action="set-mode" data-mode="roast" aria-pressed="${mode==='roast'}">Roast</button>
          </div>
          <button class="button button-primary" id="generate-card" data-action="generate-card">Launch pitch card</button>
        </div>
      </section>
      <details class="skills-details mission-skills">
        <summary>Candidate skill loadout</summary>
        <label for="skills">Skills, separated by commas</label>
        <input id="skills" maxlength="500" value="${esc(skills)}" aria-label="Candidate skill set">
      </details>
    </section>
    <section class="deck-wrap" id="deck" aria-live="polite"></section>`;
}

function status(message){const target=$('#card-status')||$('#mission-status-text');if(target)target.textContent=message;}
export function updateMissionStatus(){const keywords=['k1','k2','k3'].map(id=>document.querySelector(`#${id}`)?.value.trim()||''),count=keywords.filter(Boolean).length,status=$('#mission-status'),countLabel=$('#mission-signal-count'),bar=$('#mission-progress-bar'),progress=$('.mission-progress');if(!status)return;status.dataset.state=count===3?'ready':count?'scanning':'idle';$('#mission-status-text').textContent=count===3?'Signal map complete. Ready to transmit.':count?`Scanning culture signals · ${count} of 3 found`:'Awaiting three culture signals';countLabel.textContent=`${count} / 3`;bar.style.transform=`scaleX(${count/3})`;progress.setAttribute('aria-valuenow',String(count));}
export function applyPreset(name){const values=presets[name];if(values){values.forEach((value,index)=>{$(`#k${index+1}`).value=value;});document.querySelectorAll('.preset-button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preset===name)));updateMissionStatus();}}
export function setMode(next){mode=next==='roast'?'roast':'boost';$('#mode-boost').setAttribute('aria-pressed',String(mode==='boost'));$('#mode-roast').setAttribute('aria-pressed',String(mode==='roast'));const status=$('#mission-status');if(status)status.dataset.mode=mode;}

function fallback(keywords){const[first,second,third]=keywords,skill=skills.split(',')[0].trim()||'full-stack engineering';return{title:`The ${first.charAt(0).toUpperCase()}${first.slice(1)} Whisperer`,pitch:mode==='roast'?`Nothing says "${first}" like a ${second} job post that wants ten years of ${third}. I bring ${skill} and enough humor to survive both.`:`Your ${first}, ${second} team needs someone fluent in ${third} who ships without drama. I bring ${skill} and the energy to make it stick.`,rarity:rarities[Math.floor(Math.random()*rarities.length)],power:60+Math.floor(Math.random()*39)};}

async function createCard(keywords){
  try{if(window.claude?.use){const session=await window.claude.use('sample');if(session){const prompt=`You write collectible trading card copy. A recruiter described their company with 3 keywords: ${keywords.join(', ')}. The candidate's skills: ${skills}. Mode: ${mode==='roast'?'playfully roast their hiring pain/culture with affectionate humor':'hype them up warmly with humor'}. Return ONLY JSON: {"title":"funny card name, max 4 words","pitch":"exactly 2 short witty sentences explaining why the candidate's skills solve their specific hiring pain","rarity":"Common|Rare|Epic|Legendary","power":integer 50-99}`;const response=await session.json(prompt,{cache:false});if(response?.pitch)return response;}}}catch{/* Keep local generation available when no AI service is connected. */}
  return fallback(keywords);
}

export async function generateCard(){
  const keywords=['k1','k2','k3'].map(id=>$(`#${id}`).value.trim()),deck=$('#deck');
  if(keywords.some(keyword=>!keyword)){deck.innerHTML='<p class="card-status">Map all three culture signals before launch.</p>';updateMissionStatus();return;}
  const recruiterName=$('#recruiter-name').value.trim();
  if(!recruiterName){status('Enter your name to launch your pitch card.');$('#recruiter-name').focus();return;}
  speakLaunchThanks(recruiterName);
  skills=$('#skills').value.trim()||skills;
  if(!await saveSkills(skills)){status('Could not sync candidate skills. Check your Firebase connection and try again.');return;}
  const button=$('#generate-card'),mission=$('#mission-status');button.disabled=true;button.textContent='Mapping signals...';mission.dataset.state='transmitting';$('#mission-status-text').textContent='Tuning your response to the signal map';deck.innerHTML='<p class="card-status">Mapping culture signals and tuning your response...</p>';
  try{const result=await createCard(keywords);generatedCard={keywords,result,mode,number:Math.floor(Math.random()*900+100)};renderCard();mission.dataset.state='complete';$('#mission-status-text').textContent='Transmission complete. Your pitch is ready.';}finally{button.disabled=false;button.textContent='Launch pitch card';}
}

function renderCard(){
  const{keywords,result,number}=generatedCard;
  $('#deck').innerHTML=`<article class="trading-card" id="trading-card" aria-label="Generated ${esc(result.title)} pitch card"><div class="card-inner"><div class="card-top"><span>${esc(result.rarity)}</span><span>${mode==='roast'?'Roast':'Boost'} #${number}</span></div><div class="card-art" aria-hidden="true"><span class="card-orbit card-orbit-outer"></span><span class="card-orbit card-orbit-inner"></span><span class="card-signal card-signal-one"></span><span class="card-signal card-signal-two"></span><span class="card-signal card-signal-three"></span><span class="card-core"></span><span class="card-art-label">SIGNAL MAP</span></div><h2>${esc(result.title)}</h2><p class="card-pitch">${esc(result.pitch)}</p><div class="card-keywords">${keywords.map(word=>`<span>${esc(word)}</span>`).join('')}</div><div class="card-stats"><span>Skill fit</span><strong>${esc(result.power)}</strong></div></div></article><div class="card-actions"><button class="button" data-action="copy-pitch">Copy pitch</button><button class="button" data-action="copy-share-link">Copy share link</button><button class="button button-primary" data-action="share-card">Share</button><button class="button" data-action="save-card">Submit RE-audit</button></div><p class="card-status" id="card-status" role="status"></p>`;
  attachTilt();
}

function attachTilt(){const card=$('#trading-card'),update=(clientX,clientY)=>{const bounds=card.getBoundingClientRect(),x=(clientX-bounds.left)/bounds.width-.5,y=(clientY-bounds.top)/bounds.height-.5;card.style.transform=`rotateY(${x*20}deg) rotateX(${-y*20}deg)`;card.style.setProperty('--mx',`${(x+.5)*100}%`);};card.addEventListener('pointermove',event=>update(event.clientX,event.clientY));card.addEventListener('pointerleave',()=>{card.style.transform='';});card.addEventListener('pointercancel',()=>{card.style.transform='';});}
function shareUrl(){const params=new URLSearchParams();params.set('k',generatedCard.keywords.join(','));return`${location.origin}/recruiterhub.html?${params}`;}
async function copyText(value){if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(value);return true;}catch{/* Fall through when clipboard permission is denied. */}}const field=document.createElement('textarea');field.value=value;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();const copied=document.execCommand('copy');field.remove();return copied;}
export async function copyPitch(){if(!generatedCard)return;const{result}=generatedCard,copied=await copyText(`${result.title}\n\n"${result.pitch}"\n\nGenerated at Neural Hub`);status(copied?'Pitch copied to clipboard.':'Clipboard access is unavailable in this browser.');}
export async function copyShareLink(){if(!generatedCard)return;const copied=await copyText(shareUrl());status(copied?'Share link copied with your keywords.':'Clipboard access is unavailable in this browser.');}
export async function shareCard(){if(!generatedCard)return;const{result}=generatedCard;if(navigator.share){try{await navigator.share({title:`${result.title} | Neural Hub`,text:result.pitch,url:shareUrl()});status('Card shared.');return;}catch(error){if(error.name==='AbortError')return;}}await copyPitch();}
function speakLaunchThanks(name){
  const message=`Thank you, ${name}. Your pitch card is launching now.`;
  status(message);
  if(!('speechSynthesis' in window)||!window.SpeechSynthesisUtterance){status(`${message} Voice playback is not available in this browser.`);return;}
  window.speechSynthesis.cancel();
  const utterance=new window.SpeechSynthesisUtterance(message);
  utterance.lang=navigator.language||'en-US';
  utterance.rate=.96;
  utterance.onend=()=>status(`Your pitch card is ready, ${name}. Thank you for exploring with us.`);
  utterance.onerror=()=>status(`${message} Please check your browser audio settings.`);
  window.speechSynthesis.speak(utterance);
}
export async function saveCardToHub(){
  if(!generatedCard)return;
  const recruiterName=$('#recruiter-name').value.trim();
  if(!recruiterName){status('Add your name before submitting the RE-audit.');$('#recruiter-name').focus();return;}
  const company=$('#company-name').value.trim()||'Recruiter Lead',{keywords,result}=generatedCard,referralName=$('#referral-name').value.trim(),referralEmail=$('#referral-email').value.trim(),referralContext=$('#referral-context').value.trim();
  const file=$('#audit-attachment').files[0];let attachmentPath='';
  if(file){status(`Uploading ${file.name}...`);try{attachmentPath=await uploadSharedFile(file);}catch(error){status(error.message||'The attachment could not be uploaded.');return;}}
  const saved=await saveNote({id:crypto.randomUUID(),company,site:'',offer:'Met at career fair showcase',job:`Generated pitch card: ${result.title}`,notes:`Keywords used: ${keywords.join(', ')}\n\n${result.pitch}`,status:'Interview',source:'recruiter-re-audit',submittedAt:new Date().toISOString(),recruiterName,referralName,referralEmail,referralContext,attachmentPath});
  if(!saved){if(attachmentPath){try{await deleteSharedFile(attachmentPath);}catch{}}status('Could not save this RE-audit. Check your Firebase connection and try again.');return;}
  status(`RE-audit saved for ${company}. It is now available in the Info Hub.`);
}