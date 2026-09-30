const eye=document.getElementById("eye"),status=document.getElementById("status"),conversation=document.getElementById("conversation"),talk=document.getElementById("talk"),stop=document.getElementById("stop"),messageInput=document.getElementById("message"),send=document.getElementById("send");
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null, recorder=null, recorderStream=null, speaking=false, conversationMode=false, restarting=false;
const history=[];
function setEye(active){eye.style.background=active?"#ff2020":"#ff0000";eye.style.opacity=active?"1":".45";eye.style.boxShadow=active?"0 0 70px #ff0000,0 0 140px #ff0000":"0 0 45px #ff0000,0 0 90px #ff0000";eye.style.transform=active?"scale(1.05)":"scale(1)";}
function add(who,text){const p=document.createElement("p");p.className="line "+(who==="HAL"?"hal":"you");p.textContent=who+": "+text;conversation.appendChild(p);conversation.scrollTop=conversation.scrollHeight;}
function startListening(){
  if(!recognition||speaking||!conversationMode||restarting)return;
  restarting=true;
  try{recognition.start()}catch(error){restarting=false; status.textContent="HAL_V4 — MICRO: "+(error&&error.message?error.message:"démarrage impossible"); add("HAL","Le microphone n’a pas pu démarrer. Vérifiez l’autorisation du navigateur.");}
  setTimeout(()=>{restarting=false},300);
}
function splitSpeech(text){
  const normalized=text.trim();
  if(normalized.length<=180)return [normalized];
  const parts=normalized.match(/[^.!?]+[.!?]+(?:\\s+|$)|[^.!?]+$/g)||[normalized];
  const chunks=[]; let current="";
  for(const part of parts){
    const p=part.trim(); if(!p)continue;
    if((current+" "+p).trim().length<=220) current=(current+" "+p).trim();
    else {if(current)chunks.push(current);current=p;}
  }
  if(current)chunks.push(current);
  return chunks.length?chunks:[normalized];
}
async function fetchSpeechChunk(text){
  const r=await fetch("/api/speak",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text})});
  if(!r.ok) throw new Error(await r.text());
  return r.blob();
}
async function playSpeechBlob(blob){
  const url=URL.createObjectURL(blob), audio=new Audio(url);
  audio.playbackRate=8.0;
  audio.preservesPitch=true;
  window.__halAudio=audio;
  await new Promise((resolve,reject)=>{
    audio.onended=resolve;
    audio.onerror=()=>reject(new Error("Lecture audio impossible."));
    audio.play().catch(reject);
  });
  URL.revokeObjectURL(url);
}
async function speak(text){
  const chunks=splitSpeech(text);
  speaking=true; stop.disabled=false; status.textContent="HAL_V4 — RÉPONSE";
  try{
    let nextPromise=fetchSpeechChunk(chunks[0]);
    for(let i=0;i<chunks.length;i++){
      const blob=await nextPromise;
      if(i+1<chunks.length) nextPromise=fetchSpeechChunk(chunks[i+1]);
      await playSpeechBlob(blob);
    }
  }catch(e){
    speaking=false;
    if(window.__halAudio){try{window.__halAudio.pause()}catch{}window.__halAudio=null}
    throw e;
  }finally{
    speaking=false; eye.classList.remove("active"); setEye(false);
    if(conversationMode){status.textContent="HAL_V4 — ÉCOUTE";startListening()}
    else{stop.disabled=true;status.textContent="HAL_V4 — STANDBY"}
  }
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
async function playStreamSentence(text){
  const blob=await fetchSpeechChunk(text);
  speaking=true; stop.disabled=false; status.textContent="HAL_V4 — RÉPONSE"; eye.classList.add("active"); setEye(true);
  await playSpeechBlob(blob);
  speaking=false;
}
async function ask(text){
  const clean=text.trim(); if(!clean)return;
  add("VOUS",clean); history.push({role:"user",content:clean});
  status.textContent="HAL_V4 — ANALYSE"; eye.classList.add("active"); talk.disabled=true; stop.disabled=false; eye.classList.remove("listening"); setEye(true);
  const halLine=document.createElement("p"); halLine.className="line hal"; halLine.textContent="HAL: "; conversation.appendChild(halLine);
  let fullText="", speechBuffer="";
  const speakQueue=[]; let speakingQueue=false;
  const queueSpeech=async()=>{
    if(speakingQueue)return;
    speakingQueue=true;
    try{while(speakQueue.length){await playStreamSentence(speakQueue.shift());}}
    finally{speakingQueue=false}
  };
  const flushSpeech=()=>{
    const parts=speechBuffer.match(/^[\\s\\S]*?[.!?](?:\\s+|$)/);
    if(!parts)return;
    const sentence=parts[0].trim();
    speechBuffer=speechBuffer.slice(parts[0].length).trimStart();
    if(sentence.length>=8){speakQueue.push(sentence);void queueSpeech();}
  };
  try{
    const context=history.slice(-8).map(m=>m.role==="user"?"Utilisateur: "+m.content:"HAL: "+m.content).join("\\n");
    const prompt="Conserve le contexte de cette conversation et réponds naturellement en français.\\n\\n"+context;
    const r=await fetch("/api/chat-stream",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:prompt})});
    if(!r.ok) throw new Error(await r.text());
    if(!r.body) throw new Error("Streaming HAL indisponible.");
    const reader=r.body.getReader(), decoder=new TextDecoder(); let buffer="";
    while(true){
      const {value,done}=await reader.read(); if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const blocks=buffer.split("\\n\\n"); buffer=blocks.pop()||"";
      for(const block of blocks){
        const line=block.split("\\n").find(x=>x.startsWith("data:")); if(!line)continue;
        const data=JSON.parse(line.slice(5).trim());
        if(data.error) throw new Error(data.error);
        if(data.delta){fullText+=data.delta; speechBuffer+=data.delta; halLine.textContent="HAL: "+fullText; conversation.scrollTop=conversation.scrollHeight; flushSpeech();}
      }
    }
    speechBuffer=speechBuffer.trim();
    if(speechBuffer){speakQueue.push(speechBuffer);void queueSpeech();}
    history.push({role:"assistant",content:fullText});
    while(speakQueue.length||speakingQueue) await new Promise(resolve=>setTimeout(resolve,50));
    speaking=false;
    if(conversationMode){status.textContent="HAL_V4 — ÉCOUTE";startListening()}else{status.textContent="HAL_V4 — STANDBY";stop.disabled=true}
  }catch(e){
    speaking=false; add("HAL","Erreur: "+String(e.message||e)); status.textContent="HAL_V4 — ERREUR"; conversationMode=false; talk.disabled=false; stop.disabled=true;
  }
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
