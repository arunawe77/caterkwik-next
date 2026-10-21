-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "parentSlug" TEXT,
ADD COLUMN     "path" TEXT,
ADD COLUMN     "section" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "ProductDetail" (
    "productId" TEXT NOT NULL,
    "mpn" TEXT,
    "gtin" TEXT,
    "condition" TEXT,
    "subTitle" TEXT,
    "productType" TEXT,
    "shortDescription" TEXT,
    "section" TEXT,
    "sections" TEXT[],
    "categoryPaths" TEXT[],
    "images" JSONB,
    "documents" JSONB,
    "options" JSONB,
    "leasePlans" JSONB,
    "accessories" JSONB,
    "alsoBought" JSONB,
    "reviews" JSONB,
    "videos" JSONB,
    "attributes" JSONB,
    "dataFlags" TEXT[],
    "sourceFile" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDetail_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "actorName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" TEXT NOT NULL DEFAULT 'Waiting',
    "done" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRun_createdAt_idx" ON "ImportRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_sourceUrl_key" ON "Category"("sourceUrl");

-- AddForeignKey
ALTER TABLE "ProductDetail" ADD CONSTRAINT "ProductDetail_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

