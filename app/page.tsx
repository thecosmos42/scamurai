import { TranscriptPlayer } from "../components/TranscriptPlayer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f8f5ef] text-[#10284b]">
      <div className="mx-auto flex min-h-screen max-w-[1240px] flex-col px-5 sm:px-8">
        <header className="-mx-5 flex h-20 items-center justify-between border-b border-[#ebe5dc] bg-[#fffdfa] px-5 sm:-mx-8 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-[#173b70] text-sm font-bold text-white shadow-sm">S</div>
            <div>
              <p className="text-xl font-bold tracking-tight text-[#10284b]">Scamurai</p>
              <p className="text-sm text-[#6d7890]">Live call protection — demo simulation</p>
            </div>
          </div>
        </header>

        <section className="flex flex-1 flex-col py-8 sm:py-9">
          <TranscriptPlayer />
        </section>

        <footer className="pb-5 text-xs text-[#8991a0]">Scamurai monitors language patterns. Always verify unexpected requests independently.</footer>
      </div>
    </main>
  );
}
