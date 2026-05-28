import { useState } from 'react';
import { Modal } from './Modal';

export const Add = () => {
  const [errorOpen, setErrorOpen] = useState(false);
  const [okOpen, setOkOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [okMessage, setOkMessage] = useState('');

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    const form = e.currentTarget;
    const data = new FormData(form);

    const username = String(data.get('username')).trim();
    const password = String(data.get('password')).trim();

    const name = String(data.get('name')).trim();
    const tag = String(data.get('tag')).trim();
    const discord_user_id = data.get('discord_user_id')
      ? String(data.get('discord_user_id')).trim()
      : null;

    const body = {
      name,
      tag,
      discord_user_id: discord_user_id,
    };

    const basicAuth = btoa(`${username}:${password}`);

    try {
      const resp = await fetch('/api/players', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const text = await resp.text();

        throw new Error(text.length > 0 ? text : `HTTP ${resp.status}`);
      }

      form.reset();

      setOkMessage(`${name}#${tag} is added to the watchlist!`);
      setOkOpen(true);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : String(e));

      setErrorOpen(true);
    }
  };

  return (
    <>
      {errorOpen && <Modal onClose={() => setErrorOpen(false)} message={errorMessage} isError />}
      {okOpen && <Modal onClose={() => setOkOpen(false)} message={okMessage} />}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-medium text-zinc-300">
            Username
          </label>

          <input
            id="username"
            name="username"
            type="text"
            placeholder="Username"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 transition outline-none placeholder:text-zinc-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-300">
            Password
          </label>

          <input
            id="password"
            type="password"
            name="password"
            placeholder="Password"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 transition outline-none placeholder:text-zinc-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Riot ID</label>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Name"
              name="name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 transition outline-none placeholder:text-zinc-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
              required
            />

            <input
              type="text"
              placeholder="Tag"
              name="tag"
              className="w-28 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 transition outline-none placeholder:text-zinc-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="discord_user_id" className="mb-1 block text-sm font-medium text-zinc-300">
            Discord User ID
          </label>

          <input
            id="discord_user_id"
            type="text"
            name="discord_user_id"
            placeholder="discord_user_id"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 transition outline-none placeholder:text-zinc-500 focus:border-lime-400 focus:ring-2 focus:ring-lime-400/20"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-lime-400 py-2 font-medium text-zinc-950 transition hover:bg-lime-300 active:scale-[0.99]"
        >
          Submit
        </button>
      </form>
    </>
  );
};
