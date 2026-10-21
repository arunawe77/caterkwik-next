import { revalidatePath } from "next/cache";
import { refreshCatalogue } from "@/server/catalogue-store";

// After a real import: reload the storefront's in-memory catalogue and drop cached pages.
export async function afterImport() {
  await refreshCatalogue();
  try {
    revalidatePath("/", "layout");
  } catch {
    /* the import outlived the request that started it */
  }
}
