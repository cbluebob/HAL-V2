import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { synthesizeHALSpeech } from "../adapters/openai-tts";
import { runHostedHALMission } from "../core/hosted-hal";

const HOST = process.env.HAL_VOICE_HOST ?? "127.0.0.1";
const PORT = Number(process.env.HAL_VOICE_PORT ?? "8787");

const HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HAL Console</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#030506;color:#d7d7d7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;min-height:100vh;display:grid;place-items:center}
main{width:min(900px,94vw);padding:28px}
header{text-align:center}
#eye{width:150px;height:150px;margin:8px auto 22px;border-radius:50%;background:radial-gradient(circle,#ff5b5b 0 8%,#9b0000 10% 24%,#250000 25% 62%,#080808 64%);box-shadow:0 0 35px #9b000055,0 0 8px #ff000099;transition:.2s}
#eye.listening{box-shadow:0 0 45px #ff0000aa,0 0 15px #ff4444}
#status{font-size:13px;letter-spacing:.12em;color:#8c8c8c;text-transform:uppercase}
#conversation{margin:28px 0;min-height:180px;border:1px solid #242424;background:#080a0b;padding:18px;line-height:1.55;white-space:pre-wrap}
.line{margin:0 0 14px}.you{color:#aaa}.hal{color:#eee}
.controls{display:flex;gap:10px}
button{flex:1;padding:14px;border:1px solid #444;background:#111;color:#eee;font:inherit;cursor:pointer}
button:hover{background:#191919}button:disabled{opacity:.4;cursor:not-allowed}
small{display:block;text-align:center;color:#555;margin-top:16px}
</style>
</head>
<body>
<main>
<header><div id="eye"></div><div id="status">HAL_V4 — STANDBY</div></header>
<section id="conversation"></section>
<div class="controls">
<button id="talk">DÉMARRER LA CONVERSATION</button><button id="text">TESTER PAR TEXTE</button>
<button id="stop" disabled>ARRÊTER</button>
</div>
<small>La clé API reste côté serveur. La voix est une interprétation synthétique, pas l'imitation d'un comédien.</small>
</main>
<script>
const eye=document.getElementById("eye"),status=document.getElementById("status"),conversation=document.getElementById("conversation"),talk=document.getElementById("talk"),stop=document.getElementById("stop");
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
  await audio.play(); window.__halAudio=audio;
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
  }catch(e){add("HAL",String(e.message||e));status.textContent="HAL_V4 — ERREUR";conversationMode=false;talk.disabled=false}
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
text.onclick=()=>{const value=prompt("Message à envoyer à HAL :");if(value&&value.trim())ask(value.trim())};
stop.onclick=()=>{conversationMode=false;try{recognition&&recognition.stop()}catch{};try{recorder&&recorder.stop()}catch{};if(window.__halAudio){window.__halAudio.pause();window.__halAudio.currentTime=0;window.__halAudio=null}speaking=false;eye.classList.remove("listening");status.textContent="HAL_V4 — STANDBY";talk.disabled=false;stop.disabled=true};
</script>
</body>
</html>`;


async function transcribeRequest(req: IncomingMessage): Promise<string>{
  const chunks=[]; for await(const chunk of req) chunks.push(Buffer.from(chunk));
  const contentType=String(req.headers["content-type"]||"");
  if(!contentType.startsWith("multipart/form-data")) throw new Error("Audio upload must be multipart/form-data.");
  const body=Buffer.concat(chunks);
  const match=contentType.match(/boundary=([^;]+)/); if(!match) throw new Error("Missing multipart boundary.");
  const boundary=Buffer.from("--"+match[1].replace(/^"|"$/g,""));
  const headerEnd=body.indexOf(Buffer.from("\r\n\r\n")); if(headerEnd<0) throw new Error("Invalid audio multipart body.");
  const dataStart=headerEnd+4, dataEnd=body.indexOf(boundary,dataStart)-2; if(dataEnd<=dataStart) throw new Error("Invalid audio multipart body.");
  const audio=body.subarray(dataStart,dataEnd);
  const form=new FormData(); form.append("file",new Blob([audio],{type:"audio/webm"}),"hal-input.webm"); form.append("model","gpt-4o-mini-transcribe"); form.append("language","fr");
  const key=process.env.HAL_OPENAI_API_KEY??process.env.OPENAI_API_KEY; if(!key) throw new Error("HAL_OPENAI_API_KEY is not configured.");
  const response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:"Bearer "+key},body:form});
  if(!response.ok) throw new Error("OpenAI transcription failed ("+response.status+"): "+await response.text());
  const json=await response.json(); return String(json.text??"").trim();
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function collectText(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    const clean = value.trim();
    if (clean.length > 20) output.push(clean);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "text" || key === "output_text" || key === "content") collectText(item, output);
      else if (typeof item === "object" && item !== null) collectText(item, output);
    }
  }
  return output;
}

function extractHALText(events: unknown[]): string {
  const candidates = collectText(events);
  const filtered = candidates.filter((text, index) => candidates.indexOf(text) === index);
  return filtered.sort((a, b) => b.length - a.length)[0] ?? "Je n'ai pas reçu de réponse exploitable.";
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"});
      res.end(HTML);
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, service: "HAL_V4 voice console" });
      return;
    }
    if (req.method === "POST" && req.url === "/api/chat") {
      const body = await readJson(req);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return sendJson(res, 400, { error: "Message HAL vide." });
      const result = await runHostedHALMission(message);
      if (result.failed || !result.completed) {
        return sendJson(res, 502, { error: "HAL n'a pas obtenu une session terminée et vérifiée.", status: result.status });
      }
      return sendJson(res, 200, {
        text: extractHALText(result.events),
        sessionId: result.sessionId,
        status: result.status,
      });
    }
    if (req.method === "POST" && req.url === "/api/transcribe") { const text=await transcribeRequest(req); return sendJson(res,200,{text}); }
    if (req.method === "POST" && req.url === "/api/speak") {
      const body = await readJson(req);
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return sendJson(res, 400, { error: "Texte HAL vide." });
      const audio = await synthesizeHALSpeech(text);
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Content-Length": audio.byteLength,
        "Cache-Control": "no-store",
      });
      res.end(Buffer.from(audio));
      return;
    }
    res.writeHead(404); res.end("Not found");
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "HAL voice console error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`HAL_V4 voice console listening on http://${HOST}:${PORT}`);
});
