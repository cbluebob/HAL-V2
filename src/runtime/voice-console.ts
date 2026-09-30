import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { synthesizeHALSpeech } from "../adapters/openai-tts";
import { runHostedHALMission } from "../core/hosted-hal";
import { streamHostedAgentResponse } from "../adapters/openai-agents-session";

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
#eye{width:150px;height:150px;margin:8px auto 22px;border-radius:50%;background:#ff0000;box-shadow:0 0 45px #ff0000,0 0 90px #ff0000;transition:.2s;opacity:.45}
#eye.listening,#eye.active{opacity:1;background:#ff2020;box-shadow:0 0 70px #ff0000,0 0 130px #ff0000;animation:halPulse .8s ease-in-out infinite}@keyframes halPulse{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.04);filter:brightness(1.45)}}
#status{font-size:13px;letter-spacing:.12em;color:#8c8c8c;text-transform:uppercase}
#conversation{margin:28px 0;min-height:180px;border:1px solid #242424;background:#080a0b;padding:18px;line-height:1.55;white-space:pre-wrap}
.line{margin:0 0 14px}.you{color:#aaa}.hal{color:#eee}
.controls{display:flex;gap:10px}
button{flex:1;padding:14px;border:1px solid #444;background:#111;color:#eee;font:inherit;cursor:pointer}
button:hover{background:#191919}button:disabled{opacity:.4;cursor:not-allowed}
.textbox{display:flex;gap:10px;margin-bottom:10px}.textbox input{flex:1;padding:14px;border:1px solid #444;background:#111;color:#eee;font:inherit;outline:none}.textbox input:focus{border-color:#777}
small{display:block;text-align:center;color:#555;margin-top:16px}
</style>
</head>
<body>
<main>
<header><div id="eye"></div><div id="status">HAL_V4 — STANDBY</div></header>
<section id="conversation"></section>
<div class="textbox"><input id="message" type="text" placeholder="Écrivez un message à HAL..." autocomplete="off"><button id="send" type="button">ENVOYER</button></div>
<div class="controls">
<button id="talk">DÉMARRER LA CONVERSATION</button><button id="stop" disabled>ARRÊTER</button>
</div>
<small>La clé API reste côté serveur. La voix est une interprétation synthétique, pas l'imitation d'un comédien.</small>
</main>
<script src="/app.js?v=5"></script>
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

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
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
    if (req.method === "GET" && new URL(req.url ?? "/", `http://${HOST}:${PORT}`).pathname === "/") {
      res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"});
      res.end(HTML);
      return;
    }
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, service: "HAL_V4 voice console" });
      return;
    }
    if (req.method === "GET" && new URL(req.url ?? "/", `http://${HOST}:${PORT}`).pathname === "/app.js") {
      const appJs = await readFile(new URL("./hal-console.js", import.meta.url), "utf8");
      res.writeHead(200, {"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-store"});
      res.end(appJs);
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/test")) {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const message = url.searchParams.get("message")?.trim() ?? "";
      if (!message) {
        res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"});
        res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>HAL Test</title><style>body{background:#030506;color:#eee;font:20px ui-monospace;padding:40px}a{color:#ff6666}</style></head><body><h1>HAL — test texte</h1><p>Message vide.</p><a href="/">Retour à la console HAL</a></body></html>`);
        return;
      }
      try {
        const result = await runHostedHALMission(message);
        const text = result.failed || !result.completed
          ? `Erreur HAL : session non terminée ou non vérifiée. Statut : ${String(result.status)}`
          : extractHALText(result.events);
        res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"});
        res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>HAL Test</title><style>body{background:#030506;color:#eee;font:20px ui-monospace;padding:40px;line-height:1.6}.box{max-width:900px;margin:auto;border:1px solid #333;padding:30px}a{color:#ff6666}</style></head><body><div class="box"><h1>HAL</h1><p><strong>VOUS :</strong> ${htmlEscape(message)}</p><p><strong>HAL :</strong> ${htmlEscape(text)}</p><p><a href="/">Retour à la console HAL</a></p></div></body></html>`);
      } catch (error) {
        res.writeHead(500, {"Content-Type":"text/html; charset=utf-8"});
        res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>HAL Erreur</title></head><body style="background:#030506;color:#eee;font:20px ui-monospace;padding:40px"><h1>Erreur HAL</h1><pre>${htmlEscape(error instanceof Error ? error.message : "Erreur inconnue")}</pre><a href="/">Retour à la console HAL</a></body></html>`);
      }
      return;
    }
    if (req.method === "POST" && req.url === "/api/chat-stream") {
      const body = await readJson(req);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return sendJson(res, 400, { error: "Message HAL vide." });
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        "Connection": "keep-alive",
      });
      try {
        await streamHostedAgentResponse(
          { input: message, instructions: HAL_HOSTED_SYSTEM_INSTRUCTIONS },
          (delta) => res.write(`data: ${JSON.stringify({ delta })}\\n\\n`),
        );
        res.write(`data: ${JSON.stringify({ done: true })}\\n\\n`);
        res.end();
      } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Erreur HAL" })}\\n\\n`);
        res.end();
      }
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
