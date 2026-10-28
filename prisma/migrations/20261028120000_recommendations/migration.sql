-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kicker" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "recommender" TEXT NOT NULL,
    "picks" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recommendation_categorySlug_sortOrder_idx" ON "Recommendation"("categorySlug", "sortOrder");
