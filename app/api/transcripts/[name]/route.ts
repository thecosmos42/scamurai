import { NextResponse } from "next/server";

import { loadTranscript } from "../../../../lib/transcripts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const transcript = await loadTranscript(name);
    return NextResponse.json(transcript);
  } catch (error) {
    console.error("Failed to load transcript", error);
    return NextResponse.json(
      { error: "Transcript not found." },
      { status: 404 },
    );
  }
}
