type ModalProps<T> = {
  message: T;
  onClose: () => void;
  isError?: boolean;
};

export const Modal = <T,>({ onClose, message, isError = false }: ModalProps<T>) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div className="w-full max-w-sm rounded-2xl border bg-zinc-900 p-6">
      <h2 className="mb-2 text-xl font-semibold">{isError ? 'Error' : 'Success'}</h2>

      <pre className="mb-4 overflow-x-auto rounded-lg bg-zinc-950/70 p-4 font-mono text-sm text-zinc-300 text-wrap">
        {JSON.stringify(message, null, 2)}
      </pre>

      {isError ? (
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-red-800 px-4 py-2 hover:bg-zinc-700"
          >
            Whoopsie
          </button>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg bg-lime-400 px-4 py-2 hover:bg-zinc-700"
          >
            Ok
          </button>
        </div>
      )}
    </div>
  </div>
);
