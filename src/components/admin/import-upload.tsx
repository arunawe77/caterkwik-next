"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Posts the workbook as the raw request body (with progress), then opens the run that checks it.
export function ImportUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");

  function send(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return setError("Choose a workbook first.");
    setError("");
    setBusy(true);
    const q = new URLSearchParams({ name: file.name, update: data.get("update") ? "1" : "0", publish: data.get("publish") ? "1" : "0" });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/import?${q}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setPercent(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setBusy(false);
      try {
        const body = JSON.parse(xhr.responseText) as { id?: string; error?: string };
        if (xhr.status === 200 && body.id) router.push(`/admin/import?run=${body.id}`);
        else setError(body.error ?? "The upload failed.");
      } catch {
        setError("The upload failed.");
      }
    };
    xhr.onerror = () => { setBusy(false); setError("The upload failed. Check your connection and try again."); };
    xhr.send(file);
  }

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); send(e.currentTarget); }}>
      <label className="field"><span>Workbook (.xlsx) <i>*</i></span><input type="file" name="file" accept=".xlsx" required disabled={busy} /></label>
      <div className="adm-checks">
        <label><input type="checkbox" name="update" disabled={busy} /> Update products already in the catalogue (name, prices, descriptions)</label>
        <label><input type="checkbox" name="publish" disabled={busy} /> Put the products on the storefront (otherwise new ones arrive as drafts; earlier imported drafts go live too)</label>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {busy && <p className="muted" role="status">{percent < 100 ? `Uploading ${percent}%` : "Upload finished, starting the check..."}</p>}
      <button className="btn btn-navy" type="submit" disabled={busy}>Upload and check</button>
      <p className="muted">Nothing is saved yet. You will see what would change and confirm on the next screen.</p>
    </form>
  );
}
