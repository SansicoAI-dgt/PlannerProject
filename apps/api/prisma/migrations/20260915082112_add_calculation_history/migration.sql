/*
  Warnings:

  - You are about to drop the column `itemCode` on the `items` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[partNumber]` on the table `items` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `partNumber` to the `items` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `items_itemCode_idx` ON `items`;

-- DropIndex
DROP INDEX `items_itemCode_key` ON `items`;

-- AlterTable
ALTER TABLE `items` DROP COLUMN `itemCode`,
    ADD COLUMN `partNumber` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `hotlists` (
    `id` VARCHAR(191) NOT NULL,
    `partNumber` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `previousDate` DATE NULL,
    `biTotal` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hotlists_partNumber_key`(`partNumber`),
    INDEX `hotlists_partNumber_idx`(`partNumber`),
    INDEX `hotlists_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_raw_materials` (
    `id` VARCHAR(191) NOT NULL,
    `itemDesc` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `supplier` VARCHAR(191) NULL,
    `qty` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `stock_raw_materials_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outstanding_pos` (
    `id` VARCHAR(191) NOT NULL,
    `planReceivedDate` DATE NOT NULL,
    `supplierName` VARCHAR(191) NOT NULL,
    `itemDesc` VARCHAR(191) NOT NULL,
    `qtyOrder` DOUBLE NOT NULL,
    `qtyOrderUnit` VARCHAR(191) NOT NULL,
    `qtyDelivered` DOUBLE NOT NULL,
    `qtyDeliveredUnit` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `outstanding_pos_planReceivedDate_idx`(`planReceivedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `npof_materials` (
    `id` VARCHAR(191) NOT NULL,
    `npofId` INTEGER NOT NULL,
    `partNumber` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `material` VARCHAR(191) NULL,
    `gramatur` VARCHAR(191) NULL,
    `supplier` VARCHAR(191) NULL,
    `sheetedSize` VARCHAR(191) NULL,
    `formulaMaterial` TEXT NULL,
    `ups` VARCHAR(191) NULL,
    `isEdited` BOOLEAN NOT NULL DEFAULT false,
    `lastSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `npof_materials_npofId_idx`(`npofId`),
    INDEX `npof_materials_partNumber_idx`(`partNumber`),
    UNIQUE INDEX `npof_materials_npofId_partNumber_key`(`npofId`, `partNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calculation_histories` (
    `id` VARCHAR(191) NOT NULL,
    `monthKey` VARCHAR(191) NOT NULL,
    `periodStartDate` DATE NOT NULL,
    `periodEndDate` DATE NOT NULL,
    `periodWeeks` INTEGER NOT NULL,
    `calculatedAt` DATETIME(3) NOT NULL,
    `savedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `savedBy` VARCHAR(191) NOT NULL,
    `resultSnapshot` JSON NOT NULL,

    INDEX `calculation_histories_monthKey_idx`(`monthKey`),
    INDEX `calculation_histories_savedAt_idx`(`savedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `calculation_source_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `historyId` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL,
    `dataSnapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `calculation_source_snapshots_sourceType_idx`(`sourceType`),
    UNIQUE INDEX `calculation_source_snapshots_historyId_sourceType_key`(`historyId`, `sourceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `items_partNumber_key` ON `items`(`partNumber`);

-- CreateIndex
CREATE INDEX `items_partNumber_idx` ON `items`(`partNumber`);

-- AddForeignKey
ALTER TABLE `calculation_histories` ADD CONSTRAINT `calculation_histories_savedBy_fkey` FOREIGN KEY (`savedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calculation_source_snapshots` ADD CONSTRAINT `calculation_source_snapshots_historyId_fkey` FOREIGN KEY (`historyId`) REFERENCES `calculation_histories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
