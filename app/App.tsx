import type React from 'react';

const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
  e.preventDefault();

  const form = e.currentTarget;
  const data = new FormData(form);

  const username = String(data.get('username'));
  const password = String(data.get('password'));

  const body = {
    name: String(data.get('name')),
    tag: String(data.get('tag')),
    discord_tag: String(data.get('discord_tag') ?? null),
  };

  const basicAuth = btoa(`${username}:${password}`);

  const response = await fetch('/api/players', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error('request failed');
    return;
  }

  form.reset();
};

export const App = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl shadow-black/30">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">
          Add User
        </h1>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium text-zinc-300"
            >
              Username
            </label>

            <input
              id="username"
              name="username"
              type="text"
              placeholder="Username"
              className="
                w-full rounded-lg border border-zinc-700
                bg-zinc-800 px-4 py-2 text-zinc-100
                placeholder:text-zinc-500
                outline-none transition
                focus:border-lime-400
                focus:ring-2 focus:ring-lime-400/20
              "
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-300"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              name="password"
              placeholder="Password"
              className="
                w-full rounded-lg border border-zinc-700
                bg-zinc-800 px-4 py-2 text-zinc-100
                placeholder:text-zinc-500
                outline-none transition
                focus:border-lime-400
                focus:ring-2 focus:ring-lime-400/20
              "
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Riot ID
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name"
                name="name"
                className="
                  w-full rounded-lg border border-zinc-700
                  bg-zinc-800 px-4 py-2 text-zinc-100
                  placeholder:text-zinc-500
                  outline-none transition
                  focus:border-lime-400
                  focus:ring-2 focus:ring-lime-400/20
                "
                required
              />

              <input
                type="text"
                placeholder="Tag"
                name="tag"
                className="
                  w-28 rounded-lg border border-zinc-700
                  bg-zinc-800 px-4 py-2 text-zinc-100
                  placeholder:text-zinc-500
                  outline-none transition
                  focus:border-lime-400
                  focus:ring-2 focus:ring-lime-400/20
                "
                required
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="discord_tag"
              className="mb-1 block text-sm font-medium text-zinc-300"
            >
              Discord Tag
            </label>

            <input
              id="discord_tag"
              type="discord_tag"
              name="discord_tag"
              placeholder="discord_tag"
              className="
                w-full rounded-lg border border-zinc-700
                bg-zinc-800 px-4 py-2 text-zinc-100
                placeholder:text-zinc-500
                outline-none transition
                focus:border-lime-400
                focus:ring-2 focus:ring-lime-400/20
              "
            />
          </div>

          <button
            type="submit"
            className="
              w-full rounded-lg bg-lime-400
              py-2 font-medium text-zinc-950
              transition hover:bg-lime-300
              active:scale-[0.99]
            "
          >
            Submit
          </button>
        </form>
      </div>
    </main>
  );
};
