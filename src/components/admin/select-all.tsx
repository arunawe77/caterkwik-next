"use client";

// Ticks or clears every row checkbox in the same form.
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all on this page"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((box) => (box.checked = e.currentTarget.checked));
      }}
    />
  );
}
