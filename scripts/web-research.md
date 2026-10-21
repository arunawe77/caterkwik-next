# Web research protocol

You are researching catering equipment on behalf of Caterkwik (a UK commercial catering supplier). The goal is a
product dossier that holds **every detail the open web publishes about each exact model**: specifications to the last
small figure, what is in the box, materials, certifications, options and accessories, documents, and images.

You are given a queue file `src/data/web-queue/batch-NNN.json`: an array of products
`{ id, name, brand, mpn, caterkwikUrl, known }`. `known` is what Caterkwik's own page already states.
You write `src/data/web/batch-NNN.json`: a JSON array with **one record per queued product**, in the same order.

## How to research each product
1. Search for the exact model: brand + manufacturer part number (MPN) + product name. Try the MPN alone, and the
   manufacturer's own site. Prefer, in order: the **manufacturer's** product page or datasheet PDF; other UK
   catering suppliers (e.g. nisbets, nelsons, advantage-catering-equipment, catering-appliance, easyequipment,
   buyaparcel, nextday-catering); review or spec aggregators. Open at least two sources when two exist, and read the
   page, not just the search snippet (use the fetch tool).
2. Make sure it is the **same model**. A different size, fuel, voltage or series is a different product: do not use it.
   If you cannot find a source for this exact model, record `found: false`, an empty `facts` array, and say why in `notes`.
3. Record **every** specification any source states, however small: dimensions (external, internal, packed), weights,
   capacities, power and gas ratings and connections, voltage, plug, water connection, materials and grades, finish,
   thermostat range, timers, number of shelves/baskets/burners, door type, feet/castors, noise, IP rating, certifications,
   warranty, country of origin, EAN/GTIN, what is supplied in the box, optional extras, replacement parts.
   Each is one fact: `{ "label", "value", "unit"?, "key"?, "section"?, "source" }`.
   - `label`: the source's own label ("Capacity", "Gas inlet").
   - `key`: use a registry key from `src/lib/product-schema.ts` when one clearly fits (e.g. `capacityL`, `weight`,
     `electricKw`, `gasKw`, `width`, `material`). Omit it when none fits; the fact is still kept.
   - `value`: a number for measured figures (put the unit in `unit`: mm, kg, litres, kW, W, °C, A, BTU/hr), otherwise text.
     Convert nothing; record what the source says. Dimensions in mm where the source gives mm; if it gives inches or cm,
     record it as given with that unit.
   - `source`: index into the record's `sources` array.
4. If two sources disagree on a figure, record **both** as separate facts (different `source`), and mention it in `notes`.
   Never average, guess, round, or convert-and-assume. If you did not see it written, it does not go in.

## What to write in prose fields
- `summary`: 2 to 4 sentences **in your own words** saying what the product is and who it suits. Never paste or lightly
  reword a seller's marketing copy.
- `highlights`: short factual feature statements, each from one source (`{ "text", "source" }`). Facts, not slogans.
- `faqs`: only if a source answers a real buyer question (installation, compatibility, fuel); keep the answer factual.

## Other fields
- `sources`: every page you actually used: `{ "kind": "manufacturer" | "datasheet" | "retailer" | "other", "url", "title", "read": "2026-10-12" }`.
  Use `datasheet` for a PDF spec sheet or manual. Real URLs only, ones you opened.
- `included`: what is supplied in the box. `documents`: manuals, datasheets, brochures with their URLs.
  `images`: up to 6 direct image URLs of this exact product (manufacturer first), with `alt`. `alternatives`: model codes
  a source names as the successor or replacement. `notes`: conflicts, doubts, and anything a human should check.

## Rules that matter more than coverage
- **A wrong figure on a £5,000 oven is the failure we cannot have.** Leave a field out rather than guess.
- No figures from memory. No figures from a similar model. No invented sources.
- Do not copy a seller's prose. Facts and figures are fine; their wording is not.
- Stay inside the batch file: do not edit any other file.

## Output
Validate before you finish: `node scripts/validate-web.mjs src/data/web/batch-NNN.json`. It must print `ok`. Fix what it reports.
Your final message: the batch name, how many products had `found: true`, and anything a human should look at.
