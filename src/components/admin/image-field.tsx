"use client";

import { useState } from "react";

// The product image: pick a file and it is uploaded to the media server, which fills the path. The path can still
// be typed (an existing /assets/... or /media/... address), and the server checks it on save as before.
export function ImageField({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/media", { method: "POST", body });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "Upload failed.");
      setValue(out.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="field wide"><span>Image</span>
      <input name="image" value={value} onChange={(e) => setValue(e.target.value)} placeholder="/media/products/..." />
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      <small>{busy ? "Uploading..." : error ? <b role="alert">{error}</b> : "Choose a file to upload it (JPG, PNG, WebP, AVIF or GIF, 25 MB max). Leave empty for the placeholder."}</small>
      {value && !busy && <img src={value} alt="" width={96} height={96} style={{ objectFit: "contain", marginTop: 8 }} />}
    </label>
  );
}
