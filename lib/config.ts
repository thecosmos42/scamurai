const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type ScamuraiConfig = {
  NEBIUS_MODEL_ID: string;
  CHUNK_LINE_COUNT: number;
  LINE_REVEAL_INTERVAL_MS: number;
  SCAM_THRESHOLD: number;
  MIN_REQUEST_INTERVAL_MS: number;
};

export const config: ScamuraiConfig = {
  NEBIUS_MODEL_ID:
    process.env.NEBIUS_MODEL_ID ?? "meta-llama/llama-3.3-70b-instruct-fast",
  CHUNK_LINE_COUNT: parseNumber(process.env.CHUNK_LINE_COUNT, 2),
  LINE_REVEAL_INTERVAL_MS: parseNumber(process.env.LINE_REVEAL_INTERVAL_MS, 1500),
  SCAM_THRESHOLD: parseNumber(process.env.SCAM_THRESHOLD, 70),
  MIN_REQUEST_INTERVAL_MS: parseNumber(process.env.MIN_REQUEST_INTERVAL_MS, 800),
};

export const {
  NEBIUS_MODEL_ID,
  CHUNK_LINE_COUNT,
  LINE_REVEAL_INTERVAL_MS,
  SCAM_THRESHOLD,
  MIN_REQUEST_INTERVAL_MS,
} = config;
