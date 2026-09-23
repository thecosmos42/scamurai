import { promises as fs } from "fs";
import path from "path";

function resolveTranscriptsDir(): string {
  const candidates = [
    path.join(process.cwd(), "transcripts"),
    path.join(process.cwd(), "..", "transcripts"),
    path.join(process.cwd(), "scamurai", "transcripts"),
    path.resolve(process.cwd(), "..", "scamurai", "transcripts"),
  ];

  for (const candidate of candidates) {
    try {
      if (require("fs").existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore filesystem probe failures and continue to the next candidate.
    }
  }

  return path.join(process.cwd(), "transcripts");
}

export async function listTranscripts(): Promise<string[]> {
  const dir = resolveTranscriptsDir();
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function loadTranscript(filename: string): Promise<string[]> {
  const dir = resolveTranscriptsDir();
  const safeName = path.basename(decodeURIComponent(filename));
  const filePath = path.join(dir, safeName);

  const content = await fs.readFile(filePath, "utf-8");

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
