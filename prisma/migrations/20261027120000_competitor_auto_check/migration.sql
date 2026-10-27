-- AlterTable
ALTER TABLE "CompetitorPrice" ADD COLUMN "lastError" TEXT,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
