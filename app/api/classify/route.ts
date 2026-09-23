import { NextResponse } from "next/server";

import { classifyTranscript } from "../../../lib/nebius";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { transcript?: string };
    const transcript = body.transcript ?? "";

    if (!transcript.trim()) {
      return NextResponse.json(
        {
          score: 0,
          verdict: "uncertain",
          flagged_phrase: null,
          reason: "empty transcript",
        },
        { status: 400 },
      );
    }

    const result = await classifyTranscript(transcript);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Classification route error", error);
    return NextResponse.json(
      {
        score: 0,
        verdict: "uncertain",
        flagged_phrase: null,
        reason: "classification error",
      },
      { status: 500 },
    );
  }
}
