-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "url" TEXT,
    "theirName" TEXT,
    "priceExPence" INTEGER,
    "priceIncPence" INTEGER,
    "inStock" BOOLEAN,
    "note" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedBy" TEXT,

    CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPriceLog" (
    "id" TEXT NOT NULL,
    "competitorPriceId" TEXT NOT NULL,
    "priceExPence" INTEGER,
    "priceIncPence" INTEGER,
    "inStock" BOOLEAN,
    "ourExPence" INTEGER,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedBy" TEXT,

    CONSTRAINT "CompetitorPriceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetitorPrice_competitorId_idx" ON "CompetitorPrice"("competitorId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorPrice_productId_competitorId_key" ON "CompetitorPrice"("productId", "competitorId");

-- CreateIndex
CREATE INDEX "CompetitorPriceLog_competitorPriceId_checkedAt_idx" ON "CompetitorPriceLog"("competitorPriceId", "checkedAt");

-- AddForeignKey
ALTER TABLE "CompetitorPrice" ADD CONSTRAINT "CompetitorPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPrice" ADD CONSTRAINT "CompetitorPrice_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPriceLog" ADD CONSTRAINT "CompetitorPriceLog_competitorPriceId_fkey" FOREIGN KEY ("competitorPriceId") REFERENCES "CompetitorPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
