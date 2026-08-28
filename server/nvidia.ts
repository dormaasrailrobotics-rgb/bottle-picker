import { ALLOWED_COMMANDS, validateCommand } from "./bottlebot";

const baseUrl = "https://integrate.api.nvidia.com/v1";
const chatModel = "meta/llama-3.3-70b-instruct";
const visionModel = process.env.NVIDIA_VISION_MODEL || "nvidia/nemotron-nano-12b-v2-vl";

function key() {
  const value = process.env.NVIDIA_API_KEY;
  if (!value) throw new Error("NVIDIA_API_KEY is not configured");
  return value;
}

async function complete(model: string, messages: unknown[], maxTokens = 500) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2, top_p: 0.7, max_tokens: maxTokens, stream: false }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`NVIDIA NIM ${response.status}: ${body.slice(0, 400)}`);
  const json = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content || "NVIDIA returned an empty response";
}

export async function chatWithRobot(message: string) {
  const system = `You are BottleBot, a safety-first robot assistant. Reply naturally and concisely. If the user requests a robot action, return exactly one JSON object with keys reply and command. command must be null or one of: ${ALLOWED_COMMANDS.join(", ")}. Never invent commands, never bypass safety, and never claim a motion happened unless the Pi acknowledges it.`;
  const text = await complete(chatModel, [{ role: "system", content: system }, { role: "user", content: message }]);
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { reply: text, command: null };
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { reply?: string; command?: string | null };
    let command: string | null = null;
    if (parsed.command) command = validateCommand(parsed.command);
    return { reply: parsed.reply || text, command };
  } catch {
    return { reply: text, command: null };
  }
}

export async function diagnoseAndSelfHeal(systemContext: { status: string; telemetry: Record<string, unknown>; recentAlerts: Array<{ type: string; message: string }> }) {
  const systemPrompt = `You are BottleBot Autonomous Diagnostic AI. Analyze the system telemetry, errors, and alerts.
If an error or fault is detected, diagnose the issue and determine if a self-healing action can recover the system safely.
Allowed recovery commands: ${ALLOWED_COMMANDS.join(", ")}.
Return ONLY a valid JSON object with keys:
"diagnosis": string (clear explanation of the issue),
"selfHealAction": string or null (one allowed command to attempt recovery, e.g., "STOP", "UNLOCK", "HOME"),
"userRecommendation": string (advice or steps for the human operator).`;

  try {
    const text = await complete(chatModel, [{ role: "system", content: systemPrompt }, { role: "user", content: JSON.stringify(systemContext) }]);
    const start = text.indexOf("{"); const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      let action: string | null = null;
      if (parsed.selfHealAction) action = validateCommand(parsed.selfHealAction);
      return {
        diagnosis: String(parsed.diagnosis || "No anomaly detected"),
        selfHealAction: action,
        userRecommendation: String(parsed.userRecommendation || "System operating normally"),
      };
    }
  } catch (err: any) {
    return {
      diagnosis: `Automatic diagnosis offline: ${err.message}`,
      selfHealAction: null,
      userRecommendation: "Check physical connections and agent logs.",
    };
  }

  return {
    diagnosis: "System telemetry appears nominal.",
    selfHealAction: null,
    userRecommendation: "No action required.",
  };
}

export async function askAboutCamera(jpegBase64: string, prompt: string) {
  const clean = jpegBase64.replace(/^data:image\/jpeg;base64,/, "");
  return complete(visionModel, [{ role: "user", content: [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${clean}` } },
  ] }], 700);
}
