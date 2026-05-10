type RoundOption = {
  number: number;
  status: 'PENDING' | 'ACTIVE' | 'FINISHED';
};

export function RoundSelector({
  rounds,
  selectedRound,
  onSelect,
}: {
  rounds: RoundOption[];
  selectedRound: number | null;
  onSelect: (roundNumber: number) => void;
}) {
  if (rounds.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {rounds.map((round) => {
        const active = round.number === selectedRound;
        return (
          <button
            key={round.number}
            type="button"
            onClick={() => onSelect(round.number)}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
              active
                ? 'bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)]'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            <span>Round {round.number}</span>
          </button>
        );
      })}
    </div>
  );
}
