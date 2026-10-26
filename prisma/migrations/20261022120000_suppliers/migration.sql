-- CreateEnum
CREATE TYPE "SupplierKind" AS ENUM ('FEED', 'DIRECT');

-- CreateEnum
CREATE TYPE "CostSource" AS ENUM ('FEED', 'MANUAL');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SupplierKind" NOT NULL DEFAULT 'DIRECT',
    "website" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "feedMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierBrand" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,

    CONSTRAINT "SupplierBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPrice" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "mpn" TEXT,
    "brand" TEXT,
    "name" TEXT,
    "costExPence" INTEGER,
    "stockQty" INTEGER,
    "source" "CostSource" NOT NULL DEFAULT 'FEED',
    "note" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SupplierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierFeedRun" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,

    CONSTRAINT "SupplierFeedRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierBrand_brand_idx" ON "SupplierBrand"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierBrand_supplierId_brand_key" ON "SupplierBrand"("supplierId", "brand");

-- CreateIndex
CREATE INDEX "SupplierPrice_productId_idx" ON "SupplierPrice"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPrice_supplierId_sku_key" ON "SupplierPrice"("supplierId", "sku");

-- CreateIndex
CREATE INDEX "SupplierFeedRun_supplierId_createdAt_idx" ON "SupplierFeedRun"("supplierId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupplierBrand" ADD CONSTRAINT "SupplierBrand_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierFeedRun" ADD CONSTRAINT "SupplierFeedRun_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

