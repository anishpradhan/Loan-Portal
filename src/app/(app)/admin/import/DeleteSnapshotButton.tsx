"use client";

export function DeleteSnapshotButton({ id, label, action }: { id: number; label: string; action: (fd: FormData) => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete the snapshot of ${label}? Its loan rows are removed; this cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-xs text-critical-text hover:underline">Delete</button>
    </form>
  );
}
