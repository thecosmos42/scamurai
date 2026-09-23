import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

function loadEnvFile(path) {
  return readFile(path, "utf8")
    .then((content) => {
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const separator = line.indexOf("=");
        if (separator === -1) continue;

        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        process.env[key] = value;
      }
    })
    .catch(() => undefined);
}

const projectRoot = resolve(import.meta.dirname, "..");
await loadEnvFile(resolve(projectRoot, ".env.local"));

const apiKey = process.env.NEBIUS_API_KEY;
const model = process.env.NEBIUS_MODEL_ID;

if (!apiKey) {
  throw new Error("NEBIUS_API_KEY is missing. Add it to .env.local first.");
}

if (!model) {
  throw new Error("NEBIUS_MODEL_ID is missing. Add it to .env.local first.");
}

const transcript = await readFile(resolve(projectRoot, "transcripts", "sample-call.txt"), "utf8");
const systemPrompt = `You are a real-time scam-call risk classifier for an elder-protection product called Scamurai. You receive the transcript of a phone call so far, revealed incrementally as the call happens. Judge ONLY the text provided so far — do not assume anything about how the call will continue.

Return your judgment strictly as a JSON object matching this schema, with no markdown fences, no extra commentary, and no text outside the JSON:

{
  "score": <integer 0-100, likelihood this call is a scam targeting the receiver>,
  "verdict": "likely_legitimate" | "uncertain" | "likely_scam",
  "flagged_phrase": <the exact short phrase from the transcript that most increased risk, or null if none stands out>,
  "reason": <one short sentence, maximum 20 words, explaining the score>
}

Weigh these signals heavily:
- Caller claims to be from a bank, government agency, police, or tech support
- Urgency or pressure to act immediately, or threats of arrest/suspension/legal action
- Requests for money transfers, wire transfers, or gift cards
- Requests for PINs, passwords, one-time codes, or account numbers
- Impersonation of a family member claiming to be in trouble and needing money urgently
- Requests to keep the call secret from family members

Do not flag ordinary conversation, appointment reminders, deliveries, or legitimate business calls as scams unless real risk signals are present. Score conservatively in the first few lines of a call; raise the score decisively once two or more signals stack together.

Example:
Transcript: "Caller: This is the IRS. You owe back taxes and a warrant is being issued for your arrest today unless you pay immediately with gift cards."
Response: {"score": 95, "verdict": "likely_scam", "flagged_phrase": "pay immediately with gift cards", "reason": "Government impersonation with urgent threat and gift-card payment request."}`;

const requestBody = {
  model,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Transcript so far:\n\n${transcript}\n\nReturn the JSON classification now.` },
  ],
  temperature: 0.2,
  max_tokens: 200,
};

const startedAt = performance.now();
const response = await fetch("https://api.tokenfactory.nebius.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(requestBody),
});
const latencyMs = Math.round(performance.now() - startedAt);
const payload = await response.json();

if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  throw new Error(`Nebius request failed with HTTP ${response.status}`);
}

const content = payload.choices?.[0]?.message?.content ?? "";
const usage = payload.usage ?? {};
const inputRate = Number(process.env.NEBIUS_INPUT_COST_PER_1M_TOKENS);
const outputRate = Number(process.env.NEBIUS_OUTPUT_COST_PER_1M_TOKENS);
const hasPricing = Number.isFinite(inputRate) && Number.isFinite(outputRate);
const estimatedCost =
  hasPricing && usage.prompt_tokens != null && usage.completion_tokens != null
    ? (usage.prompt_tokens * inputRate + usage.completion_tokens * outputRate) / 1_000_000
    : null;
const promptCost =
  hasPricing && usage.prompt_tokens != null ? (usage.prompt_tokens * inputRate) / 1_000_000 : null;
const completionCost =
  hasPricing && usage.completion_tokens != null
    ? (usage.completion_tokens * outputRate) / 1_000_000
    : null;

console.log("Nebius test: sample-call.txt");
console.log(`Model: ${model}`);
console.log(`HTTP status: ${response.status}`);
console.log(`Transcript lines: ${transcript.split(/\r?\n/).filter(Boolean).length}`);
console.log(`Transcript characters: ${transcript.length}`);
console.log(`Latency: ${latencyMs} ms`);
console.log(`Prompt tokens: ${usage.prompt_tokens ?? "unavailable"}`);
console.log(`Completion tokens: ${usage.completion_tokens ?? "unavailable"}`);
console.log(`Total tokens: ${usage.total_tokens ?? (usage.prompt_tokens != null && usage.completion_tokens != null ? usage.prompt_tokens + usage.completion_tokens : "unavailable")}`);
console.log(`Input cost: ${promptCost === null ? "unavailable" : `$${promptCost.toFixed(6)}`}`);
console.log(`Output cost: ${completionCost === null ? "unavailable" : `$${completionCost.toFixed(6)}`}`);
console.log(`Estimated cost: ${estimatedCost === null ? "unavailable (configure token rates)" : `$${estimatedCost.toFixed(6)}`}`);
console.log("Model response:");
console.log(content);
