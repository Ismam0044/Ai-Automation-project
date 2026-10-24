import { AlertDialog } from "radix-ui";
import { Button } from "./button.jsx";

export function ConfirmDeleteDialog({ name, onConfirm, disabled, children }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-slate-900/35" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-lg focus:outline-none">
          <AlertDialog.Title className="text-lg font-bold text-[#172b4d]">Delete {name}?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-6 text-[#667085]">
            Its check history and alerts will also be removed. This action cannot be undone.
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild><Button variant="secondary">Cancel</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><Button variant="destructive" disabled={disabled} onClick={onConfirm}>Delete monitor</Button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
