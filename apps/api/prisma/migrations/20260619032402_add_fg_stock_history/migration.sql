-- CreateTable
CREATE TABLE `fg_stock_history` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `inQty` DOUBLE NOT NULL DEFAULT 0,
    `outQty` DOUBLE NOT NULL DEFAULT 0,
    `balance` DOUBLE NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `notes` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fg_stock_history_itemId_idx`(`itemId`),
    INDEX `fg_stock_history_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fg_stock_history` ADD CONSTRAINT `fg_stock_history_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fg_stock_history` ADD CONSTRAINT `fg_stock_history_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
