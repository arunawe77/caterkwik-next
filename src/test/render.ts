import { prerender } from "react-dom/static";

// Server components that await data (the category pages) cannot go through renderToStaticMarkup; prerender waits for them.
export async function renderAsync(el: React.ReactNode): Promise<string> {
  const { prelude } = await prerender(el as React.ReactElement);
  return (await new Response(prelude).text()).replaceAll("<!-- -->", "");
}
