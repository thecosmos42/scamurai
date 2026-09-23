import { NextResponse } from "next/server";

import { listTranscripts } from "../../../lib/transcripts";

export async function GET() {
  try {
    const transcripts = await listTranscripts();
    return NextResponse.json(transcripts);
  } catch (error) {
    console.error("Failed to list transcripts", error);
    return NextResponse.json(
      { error: "Unable to list transcripts." },
      { status: 500 },
    );
  }
}
