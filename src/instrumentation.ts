// Runs once when the server starts, before it takes requests: load the catalogue from the database
// (seeding it from the scrape on a fresh install) so the first visitor sees what staff last saved.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureCatalogue } = await import("@/server/catalogue-store");
  await ensureCatalogue();
}
