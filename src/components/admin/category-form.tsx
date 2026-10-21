"use client";

import { useActionState } from "react";
import { saveCategory } from "@/server/catalogue-actions";

interface Values {
  slug: string;
  label: string;
  audience: string;
  cooking: string;
  supply: string;
  covers: string;
  image: string;
  description: string;
}

export function CategoryForm({ values, existing }: { values: Values; existing: boolean }) {
  const [state, run, pending] = useActionState(saveCategory, {});
  return (
    <form className="form" action={run}>
      <input type="hidden" name="existing" value={existing ? "1" : "0"} />
      {existing && <input type="hidden" name="slug" value={values.slug} />}
      {!existing && (
        <label className="field"><span>Address slug <i>*</i></span><input name="slug" required defaultValue={values.slug} pattern="[a-z0-9][a-z0-9_-]*" /><small>Lower case letters, digits, - and _. It becomes /ovens/slug.</small></label>
      )}
      <label className="field"><span>Name <i>*</i></span><input name="label" required defaultValue={values.label} /></label>
      <label className="field"><span>Who it is for</span><textarea name="audience" rows={3} defaultValue={values.audience} /></label>
      <label className="field"><span>Banner image</span><input name="image" defaultValue={values.image} /><small>An address such as /assets/img/banners/banner-109.jpg, shown at the top of the category page.</small></label>
      <label className="field"><span>Page introduction</span><textarea name="description" rows={6} defaultValue={values.description} /><small>Shown under the banner and used as the search description. Leave a blank line between paragraphs.</small></label>
      <label className="field"><span>Cooking tags</span><input name="cooking" defaultValue={values.cooking} /><small>Comma separated, used by the finder.</small></label>
      <label className="field"><span>Supply tags</span><input name="supply" defaultValue={values.supply} /></label>
      <label className="field"><span>Covers tags</span><input name="covers" defaultValue={values.covers} /></label>
      {state.error && <p className="alert" role="alert">{state.error}</p>}
      {state.ok && <p className="okmsg" role="status">Saved.</p>}
      <button className="btn btn-navy" type="submit" disabled={pending}>{pending ? "Saving..." : existing ? "Save changes" : "Add category"}</button>
    </form>
  );
}
