import { useState } from 'react';
import { Add } from './components/Add';
import { Remove } from './components/Remove';
import { List } from './components/List';

export const App = () => {
  const [tab, setTab] = useState<'add' | 'remove' | 'list'>('add');

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl shadow-black/30">
        <div className="mb-4 flex rounded-xl bg-zinc-800 p-1">
          <button
            type="button"
            onClick={() => setTab('add')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              tab === 'add'
                ? 'bg-lime-400 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-100'
            } `}
          >
            Add
          </button>

          <button
            type="button"
            onClick={() => setTab('list')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              tab === 'list'
                ? 'bg-lime-400 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-100'
            } `}
          >
            List
          </button>

          <button
            type="button"
            onClick={() => setTab('remove')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              tab === 'remove'
                ? 'bg-lime-400 text-zinc-950'
                : 'text-zinc-400 hover:text-zinc-100'
            } `}
          >
            Remove
          </button>
        </div>

        {tab === 'add' ? <Add /> : tab === 'list' ? <List /> : <Remove />}
      </div>
    </main>
  );
};
