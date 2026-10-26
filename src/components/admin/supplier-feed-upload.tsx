"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Posts the price file as the raw request body (with progress) and shows what the import found.
export function SupplierFeedUpload({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  function send(form: HTMLFormElement) {
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size) return setError("Choose a CSV file first.");
    setError(""); setDone(""); setBusy(true);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/suppliers/${encodeURIComponent(supplierId)}/feed?${new URLSearchParams({ name: file.name })}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setPercent(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setBusy(false);
      try {
        const b = JSON.parse(xhr.responseText) as { error?: string; rows?: number; matched?: number; unmatched?: number; created?: number; changed?: number; warnings?: string[] };
        if (xhr.status === 200) {
          setDone(`${b.rows} rows read: ${b.matched} matched to our products, ${b.unmatched} not on our site, ${b.created} new, ${b.changed} changed. ${(b.warnings ?? []).join(" ")}`);
          router.refresh();
        } else setError(b.error ?? "The upload failed.");
      } catch { setError("The upload failed."); }
    };
    xhr.onerror = () => { setBusy(false); setError("The upload failed. Check your connection and try again."); };
    xhr.send(file);
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); send(e.currentTarget); }}>
      <label className="field"><span>Price file (.csv) <i>*</i></span><input type="file" name="file" accept=".csv,text/csv" required disabled={busy} /></label>
      {error && <p className="alert" role="alert">{error}</p>}
      {done && <p className="okmsg" role="status">{done}</p>}
      {busy && <p className="muted" role="status">{percent < 100 ? `Uploading ${percent}%` : "Reading the file..."}</p>}
      <button className="btn btn-navy" type="submit" disabled={busy}>Upload and load</button>
    </form>
  );
}
