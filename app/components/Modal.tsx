type ModalProps = {
  message: string;
  onClose: () => void;
};

export const Modal = ({ onClose, message }: ModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 border border-red-800">
      <h2 className="mb-2 text-xl font-semibold">Confirm</h2>

      <p className="mb-4 text-zinc-400">{message}</p>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg bg-zinc-800 px-4 py-2">
          Ok
        </button>
      </div>
    </div>
  </div>
);
