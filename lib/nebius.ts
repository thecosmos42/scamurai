import OpenAI from "openai";

export type ClassificationResult = {
  score: number;
  verdict: "likely_legitimate" | "uncertain" | "likely_scam";
  flagged_phrase: string | null;
  reason: string;
};

const fallbackResult: ClassificationResult = {
  score: 0,
  verdict: "uncertain",
  flagged_phrase: null,
  reason: "classification error",
};

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

function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function isValidClassificationResult(value: unknown): value is ClassificationResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.score === "number" &&
    (candidate.verdict === "likely_legitimate" ||
      candidate.verdict === "uncertain" ||
      candidate.verdict === "likely_scam") &&
    (candidate.flagged_phrase === null || typeof candidate.flagged_phrase === "string") &&
    typeof candidate.reason === "string"
  );
}

async function parseClassificationResponse(content: string): Promise<ClassificationResult> {
  const cleaned = stripMarkdownFences(content);

  try {
    const parsed = JSON.parse(cleaned) as unknown;

    if (!isValidClassificationResult(parsed)) {
      throw new Error("Invalid classification payload");
    }

    return parsed;
  } catch {
    throw new Error("Failed to parse JSON classification response");
  }
}

export async function classifyTranscript(rollingTranscript: string): Promise<ClassificationResult> {
  const apiKey = process.env.NEBIUS_API_KEY;

  if (!apiKey) {
    return {
      ...fallbackResult,
      reason: "missing NEBIUS_API_KEY",
    };
  }

  const client = new OpenAI({
    baseURL: "https://api.tokenfactory.nebius.com/v1/",
    apiKey,
  });

  const userMessage = `Transcript so far:\n\n${rollingTranscript}\n\nReturn the JSON classification now.`;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const requestConfig: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: process.env.NEBIUS_MODEL_ID ?? "meta-llama/llama-3.3-70b-instruct-fast",
    messages,
    temperature: 0.2,
    max_tokens: 200,
  };

  try {
    const response = await client.chat.completions.create(requestConfig);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      return fallbackResult;
    }

    return await parseClassificationResponse(content);
  } catch (error) {
    console.error("Nebius classification failed", error);

    try {
      const retryResponse = await client.chat.completions.create({
        ...requestConfig,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${userMessage}\n\nYour last response was not valid JSON. Return ONLY the JSON object, nothing else.` },
        ],
      } satisfies OpenAI.ChatCompletionCreateParamsNonStreaming);

      const retryContent = retryResponse.choices[0]?.message?.content;

      if (!retryContent) {
        return fallbackResult;
      }

      return await parseClassificationResponse(retryContent);
    } catch {
      return fallbackResult;
    }
  }
}
