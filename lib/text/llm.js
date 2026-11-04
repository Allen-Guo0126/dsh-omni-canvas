/**
 * 调 DSH 自己的大模型（用户默认模型）做一次文本生成。
 *
 * 参考官方 dsh-experimental-translator 的用法：
 *   const llm = ctx.get("llm");
 *   const prepared = await llm.prepareCall({ provider, model, reasoningEffort: "off", maxTokens });
 *   for await (const chunk of prepared.stream({ ...prepared.config, system, messages })) { ... }
 *
 * 默认模型来自 ctx.get("agentDefaultModel").config.{provider,model}。
 */

/** 读用户默认模型（路由参数可覆盖） */
export function resolveModel(ctx, override) {
  const dm = ctx?.get?.("agentDefaultModel");
  const pick = (getter) => {
    try {
      return getter();
    } catch {
      return undefined;
    }
  };
  const provider = String(override?.provider || pick(() => dm?.config?.provider?.get?.()) || "");
  const model = String(override?.model || pick(() => dm?.config?.model?.get?.()) || "");
  return { provider, model };
}

/** 列可用 provider（用于诊断与兜底） */
export function listProviders(ctx) {
  try {
    const llm = ctx?.get?.("llm");
    return (llm?.listProviders?.() || []).map((row) => row?.id || row).filter(Boolean);
  } catch {
    return [];
  }
}

/** 拼接文本增量（不依赖 BlockAssembler） */
function pushChunk(acc, chunk) {
  if (!chunk || typeof chunk !== "object") return acc;
  const t = chunk.type;
  if (t === "text-delta" && typeof chunk.text === "string") return acc + chunk.text;
  if (t === "text-delta" && typeof chunk.delta === "string") return acc + chunk.delta;
  if (t === "block-end" && chunk.block?.type === "text" && typeof chunk.block.text === "string") {
    return acc + chunk.block.text;
  }
  return acc;
}

/**
 * 调用默认模型生成文本。
 * @returns {Promise<{text: string, provider: string, model: string, chunks: number}>}
 */
export async function generateText(ctx, { system, user, maxTokens = 4096, timeoutMs = 90000, override }) {
  const llm = ctx?.get?.("llm");
  if (!llm || typeof llm.prepareCall !== "function") {
    throw new Error("DSH 模型服务不可用（ctx.llm 不存在）");
  }
  let { provider, model } = resolveModel(ctx, override);
  const providers = listProviders(ctx);
  if (!provider && providers.length) provider = providers[0];

  // 有些 provider/模型不接受 reasoningEffort（会直接抛错），逐级降级
  const attempts = [
    { provider, model, reasoningEffort: "off", maxTokens },
    { provider, model, reasoningEffort: "low", maxTokens },
    { provider, model, maxTokens },
  ];
  let prepared = null;
  let lastErr = null;
  for (const args of attempts) {
    try {
      prepared = await llm.prepareCall(args);
      break;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      // 只有"参数不支持"类错误才继续降级，其它（鉴权/不存在）直接抛
      if (!/reasoning|effort|unsupported|not support|invalid param/i.test(msg)) throw e;
    }
  }
  if (!prepared) throw lastErr || new Error("模型调用准备失败");

  const signal = AbortSignal.timeout(timeoutMs);
  const buildMessages = (withSystem) => withSystem
    ? [{ role: "user", content: [{ type: "text", text: user }] }]
    : [{ role: "user", content: [{ type: "text", text: `${system}\n\n${user}` }] }];

  let acc = "";
  let chunks = 0;
  let terminal = null;
  let usedSystem = true;
  try {
    const options = { ...prepared.config, system, messages: buildMessages(true), signal };
    for await (const chunk of prepared.stream(options)) {
      chunks += 1;
      acc = pushChunk(acc, chunk);
      if (chunk?.type === "finish") terminal = chunk.reason || chunk;
    }
  } catch (e) {
    const msg = String(e?.message || e);
    // 某些模型不接受 system 角色：合并进 user 再试一次
    if (!/system|role/i.test(msg)) throw e;
    usedSystem = false;
    acc = "";
    chunks = 0;
    terminal = null;
    const options = { ...prepared.config, messages: buildMessages(false), signal: AbortSignal.timeout(timeoutMs) };
    for await (const chunk of prepared.stream(options)) {
      chunks += 1;
      acc = pushChunk(acc, chunk);
      if (chunk?.type === "finish") terminal = chunk.reason || chunk;
    }
  }
  if (terminal && terminal.kind && terminal.kind !== "stop") {
    throw new Error(`模型未正常结束：${terminal.kind}`);
  }
  const text = String(acc || "").trim();
  if (!text) throw new Error("模型返回空文本");
  return { text, provider: prepared.config?.provider || provider, model: prepared.config?.model || model, chunks };
}
