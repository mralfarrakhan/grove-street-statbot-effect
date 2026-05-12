export const App = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl shadow-black/30">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">
          Add User
        </h1>

        <form className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium text-zinc-300"
            >
              Username
            </label>

            <input
              id="username"
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
              placeholder="Password"
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

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              Riot ID
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name"
                className="
                  w-full rounded-lg border border-zinc-700
                  bg-zinc-800 px-4 py-2 text-zinc-100
                  placeholder:text-zinc-500
                  outline-none transition
                  focus:border-lime-400
                  focus:ring-2 focus:ring-lime-400/20
                "
              />

              <input
                type="text"
                placeholder="Tag"
                className="
                  w-28 rounded-lg border border-zinc-700
                  bg-zinc-800 px-4 py-2 text-zinc-100
                  placeholder:text-zinc-500
                  outline-none transition
                  focus:border-lime-400
                  focus:ring-2 focus:ring-lime-400/20
                "
              />
            </div>
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
