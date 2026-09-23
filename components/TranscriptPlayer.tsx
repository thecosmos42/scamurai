"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  CHUNK_LINE_COUNT,
  LINE_REVEAL_INTERVAL_MS,
  MIN_REQUEST_INTERVAL_MS,
  SCAM_THRESHOLD,
} from "../lib/config";
import type { ClassificationResult } from "../lib/nebius";

export function TranscriptPlayer() {
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("");
  const [transcriptLines, setTranscriptLines] = useState<string[]>([]);
  const [revealedLines, setRevealedLines] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [linesSinceLastCall, setLinesSinceLastCall] = useState(0);
  const [latestClassification, setLatestClassification] = useState<ClassificationResult | null>(null);
  const [uploadedTranscript, setUploadedTranscript] = useState<{ name: string; lines: string[] } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastCallTimestampRef = useRef<number>(0);
  const latestRequestIdRef = useRef<number>(0);

  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        const response = await fetch("/api/transcripts");
        const data = (await response.json()) as string[];
        setScenarios(data);
        if (data.length > 0) {
          setSelectedScenario(data[0]);
        }
      } catch (error) {
        console.error("Failed to load transcripts", error);
      }
    };

    void fetchScenarios();
  }, []);

  useEffect(() => {
    if (!selectedScenario) {
      return;
    }

    if (uploadedTranscript?.name === selectedScenario) {
      setTranscriptLines(uploadedTranscript.lines);
      setRevealedLines([]);
      setLinesSinceLastCall(0);
      setLatestClassification(null);
      setIsClassifying(false);
      setIsLoaded(true);
      return;
    }

    const loadSelectedTranscript = async () => {
      try {
        const response = await fetch(`/api/transcripts/${encodeURIComponent(selectedScenario)}`);
        const data = (await response.json()) as string[];
        setTranscriptLines(data);
        setRevealedLines([]);
        setLinesSinceLastCall(0);
        setLatestClassification(null);
        setIsClassifying(false);
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to load selected transcript", error);
      }
    };

    void loadSelectedTranscript();
  }, [selectedScenario, uploadedTranscript]);

  const triggerClassification = (rollingTranscript: string) => {
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    const now = Date.now();
    const sinceLastCall = now - lastCallTimestampRef.current;
    const delay = Math.max(0, MIN_REQUEST_INTERVAL_MS - sinceLastCall);

    const runRequest = async () => {
      setIsClassifying(true);
      lastCallTimestampRef.current = Date.now();
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transcript: rollingTranscript }),
          signal: controller.signal,
        });

        const data = (await response.json()) as ClassificationResult;

        if (requestId !== latestRequestIdRef.current) {
          return;
        }

        setLatestClassification(data);
      } catch (error) {
        const isAbortError = error instanceof DOMException && error.name === "AbortError";

        if (!isAbortError) {
          console.error("Classification request failed", error);
        }

        if (requestId === latestRequestIdRef.current) {
          setLatestClassification({
            score: 0,
            verdict: "uncertain",
            flagged_phrase: null,
            reason: isAbortError ? "classification timed out" : "classification error",
          });
        }
      } finally {
        window.clearTimeout(timeoutId);

        if (requestId === latestRequestIdRef.current) {
          setIsClassifying(false);
        }
      }
    };

    if (delay > 0) {
      window.setTimeout(() => {
        void runRequest();
      }, delay);
      return;
    }

    void runRequest();
  };

  useEffect(() => {
    if (!isPlaying || revealedLines.length >= transcriptLines.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRevealedLines((current) => {
        const nextIndex = current.length;

        if (nextIndex >= transcriptLines.length) {
          setIsPlaying(false);
          return current;
        }

        const nextLines = [...current, transcriptLines[nextIndex]];

        setLinesSinceLastCall((count) => {
          const nextCount = count + 1;

          if (nextCount >= CHUNK_LINE_COUNT) {
            triggerClassification(nextLines.join("\n"));
            return 0;
          }

          return nextCount;
        });

        return nextLines;
      });
    }, LINE_REVEAL_INTERVAL_MS);

    return () => window.clearTimeout(timeout);
  }, [isPlaying, revealedLines, transcriptLines]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [revealedLines]);

  const startCall = () => {
    if (!selectedScenario || transcriptLines.length === 0) {
      return;
    }

    setRevealedLines([]);
    setLinesSinceLastCall(0);
    setLatestClassification(null);
    setIsClassifying(false);
    setIsPlaying(true);
  };

  const pauseCall = () => {
    setIsPlaying(false);
  };

  const resetCall = () => {
    setRevealedLines([]);
    setLinesSinceLastCall(0);
    setLatestClassification(null);
    setIsClassifying(false);
    setIsPlaying(false);
  };

  const uploadTranscript = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !file.name.toLowerCase().endsWith(".txt")) {
      return;
    }

    const lines = (await file.text()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      return;
    }

    setUploadedTranscript({ name: file.name, lines });
    setSelectedScenario(file.name);
    setIsPlaying(false);
  };

  const riskScore = latestClassification?.score ?? 0;
  const riskMeterWidth = `${Math.min(100, Math.max(0, riskScore))}%`;
  const flaggedPhrase = latestClassification?.flagged_phrase?.trim() ?? null;
  const isAlertState = riskScore >= SCAM_THRESHOLD;

  useEffect(() => {
    if (isAlertState) {
      setIsPlaying(false);
    }
  }, [isAlertState]);

  const renderHighlightedLine = (line: string) => {
    if (!flaggedPhrase) {
      return line;
    }

    const lowerLine = line.toLowerCase();
    const lowerPhrase = flaggedPhrase.toLowerCase();
    const matchIndex = lowerLine.indexOf(lowerPhrase);

    if (matchIndex === -1) {
      return line;
    }

    const before = line.slice(0, matchIndex);
    const match = line.slice(matchIndex, matchIndex + flaggedPhrase.length);
    const after = line.slice(matchIndex + flaggedPhrase.length);

    return (
      <>
        {before}
        <mark className="rounded bg-red-200 px-1 font-semibold text-red-900">{match}</mark>
        {after}
      </>
    );
  };

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="flex min-h-[500px] flex-col rounded-[24px] border border-[#e5ddd1] bg-[#fffdfa] p-6 shadow-[0_2px_3px_rgba(38,29,18,0.07)] sm:p-7">
        <div className="flex items-start justify-between border-b border-[#e9e1d5] pb-5">
          <div className="flex items-center gap-4">
            <div className="grid size-14 place-items-center rounded-[18px] bg-[#f3eee5] text-sm font-bold text-[#173b70]">TEL</div>
            <div>
              <p className="text-lg font-bold text-[#10284b]">Unknown caller</p>
              <p className="mt-1 text-sm text-[#7b8190]">{selectedScenario || "Choose a transcript"}</p>
            </div>
          </div>
          <div className="text-right">
            <span className={`mt-2 size-3 rounded-full ${isPlaying ? "animate-pulse bg-[#378d5e]" : "bg-[#c9c3b9]"}`} />
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5">
          {isLoaded && revealedLines.length === 0 ? (
            <div className="grid min-h-[240px] place-items-center text-center"><div><p className="text-sm font-medium text-[#536783]">Transcript ready</p><p className="mt-1 text-sm text-[#8a8e99]">Start the demo to reveal the conversation.</p></div></div>
          ) : (
            revealedLines.map((line, index) => {
              const speakerMatch = line.match(/^([^:]+):\s*/);
              const speaker = speakerMatch?.[1] ?? "Unknown caller";
              const isCaller = /unknown caller|caller/i.test(speaker);
              const visibleLine = line.replace(/^[^:]+:\s*/, "");
              return <div key={`${line}-${index}`} className={`flex ${isCaller ? "justify-start" : "justify-end"}`}><div className={`max-w-[88%] rounded-[20px] px-5 py-4 ${isCaller ? "bg-[#f2eee6]" : "bg-[#edf3fa]"}`}><p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[#536783]">USER &nbsp;{speaker}</p><p className="text-base leading-6 text-[#173b70]">{renderHighlightedLine(visibleLine)}</p></div></div>;
            })
          )}
        </div>

        <div className="border-t border-[#e9e1d5] pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="scenario" className="shrink-0 text-sm font-medium text-[#536783]">Transcript file</label>
            <select id="scenario" className="h-10 min-w-0 flex-1 rounded-full border border-[#e2dbd0] bg-[#f8f5ef] px-4 text-sm text-[#173b70] outline-none transition focus:border-[#173b70]" value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)}>
              {uploadedTranscript ? <option value={uploadedTranscript.name}>{uploadedTranscript.name} (uploaded)</option> : null}
              {scenarios.map((scenario) => <option key={scenario} value={scenario}>{scenario}</option>)}
            </select>
            <label className="cursor-pointer rounded-full border border-[#dcd4c8] bg-white px-4 py-2 text-sm font-semibold text-[#536783] transition hover:bg-[#f5f0e8]">
              Upload .txt
              <input type="file" accept=".txt,text/plain" className="sr-only" onChange={uploadTranscript} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={startCall} disabled={!isLoaded} className="rounded-full bg-[#173b70] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#24518d] disabled:cursor-not-allowed disabled:opacity-50">Start</button>
              <button type="button" onClick={isPlaying ? pauseCall : resetCall} className="rounded-full border border-[#dcd4c8] bg-white px-4 py-2 text-sm font-semibold text-[#536783] transition hover:bg-[#f5f0e8]">{isPlaying ? "Pause" : "Reset"}</button>
            </div>
          </div>
          <p className="mt-4 text-sm text-[#6d7890]">Transcribing live — text is scored, then discarded.</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-rows-[220px_1fr]">
        <section className="rounded-[24px] border border-[#e5ddd1] bg-[#fffdfa] p-6 shadow-[0_2px_3px_rgba(38,29,18,0.07)] sm:p-7">
          <div className="flex items-start justify-between"><p className="text-lg font-bold text-[#10284b]">Scam risk</p><span className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${isAlertState ? "bg-[#c45743]" : "bg-[#378d5e]"}`}>{isAlertState ? "High risk" : riskScore >= 40 ? "Needs attention" : "Sounds normal"}</span></div>
          <p className={`mt-1 text-6xl font-bold tracking-tight ${isAlertState ? "text-[#c45743]" : "text-[#378d5e]"}`}>{riskScore}<span className="text-3xl">%</span></p>
          <div className="relative mt-4 h-6 rounded-full bg-[#f0ede6]"><div className={`h-full rounded-full transition-all ${isAlertState ? "bg-[#c45743]" : "bg-[#378d5e]"}`} style={{ width: riskMeterWidth }} /><div className="absolute top-0 h-6 w-px -translate-x-1/2 bg-[#77808b]" style={{ left: `${SCAM_THRESHOLD}%` }} /></div>
          <p className="mt-2 text-sm text-[#536783]">Hang-up threshold: {SCAM_THRESHOLD}%</p>
        </section>

        <section className="rounded-[24px] border border-[#e5ddd1] bg-[#fffdfa] p-6 shadow-[0_2px_3px_rgba(38,29,18,0.07)] sm:p-7">
          <div className="flex items-center justify-between"><p className="text-lg font-bold text-[#10284b]">Why the score is rising</p>{isClassifying ? <span className="text-sm text-[#6d7890]">Analyzing...</span> : null}</div>
          <p className="mt-5 text-lg leading-7 text-[#6d7890]">{latestClassification?.reason ?? "Nothing suspicious heard yet."}</p>
          {flaggedPhrase ? <p className="mt-5 border-t border-[#e9e1d5] pt-4 text-sm font-medium text-[#c45743]">Flagged phrase: “{flaggedPhrase}”</p> : null}
        </section>
      </div>
    </div>
  );
}
