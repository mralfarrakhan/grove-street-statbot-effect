import { Effect } from 'effect';
import { useEffect, useState } from 'react';
import { listProgram, type Player } from '../lib/list';

export const List = () => {
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoading(true);
        const data = await Effect.runPromise(listProgram);
        setPlayers(data);
      } catch (err) {
        console.error('Failed to fetch players:', err);
        setError('Failed to load player data.');
      } finally {
        setIsLoading(false);
      }
    };

    void run();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 justify-center items-center p-12 text-zinc-400 font-medium">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-lime-400" />
        <span>Loading watchlist...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <div
          className="p-4 text-sm text-red-400 rounded-lg bg-red-950/30 border border-red-900/40"
          role="alert"
        >
          <span className="font-semibold">Error:</span> {error}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto py-2">
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
        <table className="w-full border-collapse text-left text-sm text-zinc-400">
          <thead className="bg-zinc-900 text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-700">
            <tr>
              <th scope="col" className="px-6 py-4">
                Player{' '}
                <span className="text-lime-400/70 lowercase font-normal">(name#tag)</span>
              </th>
              <th scope="col" className="px-6 py-4 font-mono tracking-normal">
                PUUID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700/50">
            {players.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-12 text-center text-zinc-500">
                  No active players on the watchlist.
                </td>
              </tr>
            ) : (
              players.map((player) => (
                <tr
                  key={player.puuid}
                  className="hover:bg-zinc-700/30 transition-colors group"
                >
                  <td className="px-6 py-4 font-medium text-zinc-100 group-hover:text-lime-400 transition-colors">
                    {player.name}
                    <span className="text-zinc-500 font-normal group-hover:text-lime-500/60 transition-colors ml-0.5">
                      #{player.tag}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors select-all">
                    {player.puuid}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
