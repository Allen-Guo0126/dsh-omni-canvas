import { argosTranslateFast, argosReady, warmArgos } from "../lib/text/argos-worker.js";

const TEXT = `subject_definitions:
<Subject 1> is Lu Yuan, shown in <Picture 1>.

summary:
The door opens and she bows in greeting.

detailed_description:
[Shot 1] Static medium shot; she bows.`;

// 复刻路由里的切分
const rawBlocks = String(TEXT).split(/(\n\s*\n)/);
const blocks = [];
for (const b of rawBlocks) {
  if (!b || /^\s*$/.test(b) || b.length <= 1000) { blocks.push(b); continue; }
  const lines = b.split(/(\n)/);
  let buf = "";
  for (const ln of lines) {
    if (buf.length + ln.length > 900 && buf.trim()) { blocks.push(buf); buf = ""; }
    buf += ln;
  }
  if (buf) blocks.push(buf);
}

console.log("段数:", blocks.length);
await warmArgos().catch((e) => console.log("warm 失败:", String(e.message)));
console.log("ready:", argosReady());

for (const [i, b] of blocks.entries()) {
  if (!b || /^\s*$/.test(b)) { console.log(i, "skipped(blank)"); continue; }
  try {
    const out = await argosTranslateFast(b);
    console.log(i, "ok", JSON.stringify(b.slice(0, 30)), "→", out.slice(0, 30));
  } catch (e) {
    console.log(i, "FAIL", JSON.stringify(b.slice(0, 40)), String(e.message).slice(0, 120));
  }
}
