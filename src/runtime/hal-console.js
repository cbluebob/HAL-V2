const eye=document.getElementById("eye"),status=document.getElementById("status"),conversation=document.getElementById("conversation"),talk=document.getElementById("talk"),stop=document.getElementById("stop"),messageInput=document.getElementById("message"),send=document.getElementById("send");
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null, recorder=null, recorderStream=null, speaking=false, conversationMode=false, restarting=false;
const history=[];
function add(who,text){const p=document.createElement("p");p.className="line "+(who==="HAL"?"hal":"you");p.textContent=who+": "+text;conversation.appendChild(p);conversation.scrollTop=conversation.scrollHeight;}
function startListening(){
  if(!recognition||speaking||!conversationMode||restarting)return;
  restarting=true;
  try{recognition.start()}catch(error){restarting=false; status.textContent="HAL_V4 — MICRO: "+(error&&error.message?error.message:"démarrage impossible"); add("HAL","Le microphone n’a pas pu démarrer. Vérifiez l’autorisation du navigateur.");}
  setTimeout(()=>{restarting=false},300);
}
async function speak(text){
  const r=await fetch("/api/speak",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text})});
  if(!r.ok) throw new Error(await r.text());
  const blob=await r.blob(), url=URL.createObjectURL(blob), audio=new Audio(url);
  speaking=true; stop.disabled=false; status.textContent="HAL_V4 — RÉPONSE";
  audio.onended=()=>{speaking=false;URL.revokeObjectURL(url);if(conversationMode){status.textContent="HAL_V4 — ÉCOUTE";startListening()}else{stop.disabled=true;status.textContent="HAL_V4 — STANDBY"}};
  audio.onerror=()=>{speaking=false;URL.revokeObjectURL(url);status.textContent="HAL_V4 — ERREUR AUDIO";if(conversationMode)startListening()};
  try{await audio.play();}catch(e){throw new Error("Lecture audio refusée par le navigateur. Cliquez d’abord sur la console HAL puis réessayez. "+(e&&e.message?e.message:""));} window.__halAudio=audio;
}

async function transcribeBlob(blob){
  const form=new FormData(); form.append("audio",blob,"hal-input.webm");
  const r=await fetch("/api/transcribe",{method:"POST",body:form});
  const data=await r.json(); if(!r.ok) throw new Error(data.error||"Transcription HAL impossible");
  return data.text||"";
}
async function recordTurn(){
  if(!conversationMode||speaking)return;
  try{
    recorderStream=await navigator.mediaDevices.getUserMedia({audio:true});
    recorder=new MediaRecorder(recorderStream); const chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onstop=async()=>{
      recorderStream.getTracks().forEach(t=>t.stop()); recorderStream=null;
      if(!conversationMode)return;
      status.textContent="HAL_V4 — TRANSCRIPTION";
      try{const text=await transcribeBlob(new Blob(chunks,{type:recorder.mimeType||"audio/webm"})); if(text.trim()) await ask(text); else {status.textContent="HAL_V4 — ÉCOUTE"; setTimeout(recordTurn,250)}}catch(e){add("HAL",String(e.message||e));status.textContent="HAL_V4 — ERREUR MICRO";conversationMode=false;talk.disabled=false}
    };
    recorder.start(); eye.classList.add("listening"); status.textContent="HAL_V4 — ÉCOUTE"; talk.disabled=true; stop.disabled=false;
    setTimeout(()=>{if(recorder&&recorder.state==="recording")recorder.stop()},5000);
  }catch(e){status.textContent="HAL_V4 — MICRO: "+(e&&e.message?e.message:"accès refusé");add("HAL","Accès au microphone impossible. Vérifiez l’autorisation du site.");conversationMode=false;talk.disabled=false}
}
async function ask(text){
  const clean=text.trim(); if(!clean)return;
  add("VOUS",clean); history.push({role:"user",content:clean});
  status.textContent="HAL_V4 — ANALYSE"; talk.disabled=true; stop.disabled=false; eye.classList.remove("listening");
  try{
    const context=history.slice(-8).map(m=>m.role==="user"?"Utilisateur: "+m.content:"HAL: "+m.content).join("\n");
    const prompt="Conserve le contexte de cette conversation et réponds naturellement en français.\n\n"+context;
    const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:prompt})});
    const data=await r.json(); if(!r.ok) throw new Error(data.error||"Erreur HAL");
    history.push({role:"assistant",content:data.text}); add("HAL",data.text); await speak(data.text);
  }catch(e){add("HAL","Erreur: "+String(e.message||e));status.textContent="HAL_V4 — ERREUR";conversationMode=false;talk.disabled=false;stop.disabled=true}
}
if(!Recognition){
  talk.disabled=true; status.textContent="NAVIGATEUR SANS RECONNAISSANCE VOCALE";
  add("HAL","La reconnaissance vocale de ce navigateur n'est pas disponible. Utilisez un navigateur compatible SpeechRecognition.");
}else{
  try{ recognition=new Recognition(); recognition.lang="fr-FR"; recognition.interimResults=false; recognition.continuous=false; }catch(error){ recognition=null; talk.disabled=true; status.textContent="HAL_V4 — MICRO INDISPONIBLE"; add("HAL","Impossible d’initialiser la reconnaissance vocale : "+(error&&error.message?error.message:"erreur inconnue")); }
  recognition.onstart=()=>{restarting=false;eye.classList.add("listening");status.textContent="HAL_V4 — ÉCOUTE";talk.disabled=true;stop.disabled=false};
  recognition.onresult=e=>ask(e.results[0][0].transcript);
  recognition.onerror=e=>{eye.classList.remove("listening");if(conversationMode&&e.error!=="aborted"){status.textContent="HAL_V4 — MICROPHONE: "+e.error;setTimeout(startListening,800)}else{talk.disabled=false}};
  recognition.onend=()=>{eye.classList.remove("listening");if(conversationMode&&!speaking)setTimeout(startListening,250)};
  talk.onclick=()=>{conversationMode=true;if(recognition){status.textContent="HAL_V4 — ÉCOUTE";startListening()}else{recordTurn()}};
}
async function sendText(){const value=messageInput.value.trim();if(!value)return;messageInput.value="";await ask(value)}
send.onclick=sendText;
messageInput.addEventListener("input",()=>{send.disabled=!messageInput.value.trim()});
send.disabled=true;
messageInput.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendText()}});

stop.onclick=()=>{conversationMode=false;try{recognition&&recognition.stop()}catch{};try{recorder&&recorder.stop()}catch{};if(window.__halAudio){window.__halAudio.pause();window.__halAudio.currentTime=0;window.__halAudio=null}speaking=false;eye.classList.remove("listening");status.textContent="HAL_V4 — STANDBY";talk.disabled=false;stop.disabled=true};
