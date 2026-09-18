-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_email_idx`(`email`),
    INDEX `users_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` VARCHAR(191) NOT NULL,
    `partNumber` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `items_partNumber_key`(`partNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `master_cartons` (
    `id` VARCHAR(191) NOT NULL,
    `cartonCode` VARCHAR(191) NOT NULL,
    `toyName` VARCHAR(191) NOT NULL,
    `partNumberCode` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `master_cartons_cartonCode_key`(`cartonCode`),
    INDEX `master_cartons_partNumberCode_idx`(`partNumberCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `shift` INTEGER NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `daily_schedules_date_shift_idx`(`date`, `shift`),
    INDEX `daily_schedules_itemId_idx`(`itemId`),
    UNIQUE INDEX `daily_schedules_date_shift_itemId_key`(`date`, `shift`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_schedules` (
    `id` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `weekNumber` INTEGER NOT NULL,
    `weekStartDate` DATE NOT NULL,
    `weekEndDate` DATE NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `weekly_schedules_year_weekNumber_idx`(`year`, `weekNumber`),
    INDEX `weekly_schedules_itemId_idx`(`itemId`),
    UNIQUE INDEX `weekly_schedules_year_weekNumber_itemId_key`(`year`, `weekNumber`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fg_stocks` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `date` DATE NOT NULL,
    `shift` INTEGER NULL,
    `notes` TEXT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fg_stocks_itemId_idx`(`itemId`),
    INDEX `fg_stocks_date_idx`(`date`),
    UNIQUE INDEX `fg_stocks_itemId_date_key`(`itemId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wips` (
    `id` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `progressPercent` INTEGER NOT NULL DEFAULT 0,
    `date` DATE NOT NULL,
    `shift` INTEGER NOT NULL,
    `status` ENUM('IN_PROGRESS', 'ON_HOLD', 'DELAYED', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
    `notes` TEXT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wips_itemId_idx`(`itemId`),
    INDEX `wips_location_idx`(`location`),
    INDEX `wips_status_idx`(`status`),
    INDEX `wips_date_shift_idx`(`date`, `shift`),
    UNIQUE INDEX `wips_itemId_location_date_shift_key`(`itemId`, `location`, `date`, `shift`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `dataBefore` JSON NULL,
    `dataAfter` JSON NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_userId_idx`(`userId`),
    INDEX `audit_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('SHORTAGE', 'DELAY', 'STALE_DATA', 'INFO') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `itemCode` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_userId_isRead_idx`(`userId`, `isRead`),
    INDEX `notifications_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `daily_schedules` ADD CONSTRAINT `daily_schedules_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_schedules` ADD CONSTRAINT `weekly_schedules_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fg_stocks` ADD CONSTRAINT `fg_stocks_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fg_stocks` ADD CONSTRAINT `fg_stocks_updatedBy_fkey` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wips` ADD CONSTRAINT `wips_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wips` ADD CONSTRAINT `wips_updatedBy_fkey` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
