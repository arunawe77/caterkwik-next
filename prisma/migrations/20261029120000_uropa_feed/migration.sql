-- Uropa's price, stock and product files carry more than a cost: the published retail and web prices, a dropped-line flag,
-- a description and the supplier's own category, which is how new products are described and placed.
ALTER TABLE "SupplierPrice" ADD COLUMN "rrpPence" INTEGER,
ADD COLUMN "webPence" INTEGER,
ADD COLUMN "dropped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "description" TEXT,
ADD COLUMN "groupName" TEXT;
