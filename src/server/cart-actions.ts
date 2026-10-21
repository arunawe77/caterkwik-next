"use server";

import { redirect } from "next/navigation";
import { addItem, MAX_QTY, parseCart, serializeCart } from "@/lib/cart";
import { readCart, writeCart } from "@/server/cart";

const qtyOf = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), MAX_QTY) : 1;
};

export async function addToCart(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  await writeCart(addItem(await readCart(), id, qtyOf(form.get("qty"))));
  redirect("/basket");
}

// The basket page posts every quantity as `qty:<id>`, and a remove button as `remove=<id>`.
export async function updateCart(form: FormData): Promise<void> {
  const remove = form.get("remove");
  const items = [...form.entries()]
    .filter(([key]) => key.startsWith("qty:"))
    .map(([key, value]) => ({ id: key.slice(4), qty: qtyOf(value) }))
    .filter((item) => item.id !== remove);
  await writeCart(parseCart(serializeCart(items)));
  redirect("/basket");
}
