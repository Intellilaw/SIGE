ALTER TABLE "FinanceRecord" ADD COLUMN "paymentReceived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceRecord" ADD COLUMN "paymentReceived2" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceRecord" ADD COLUMN "paymentReceived3" BOOLEAN NOT NULL DEFAULT false;

UPDATE "FinanceRecord"
SET "paymentReceived" = true
WHERE "paymentMethod" = 'E_RECEIVED';

UPDATE "FinanceRecord"
SET "paymentReceived2" = true
WHERE "paymentMethod2" = 'E_RECEIVED';

UPDATE "FinanceRecord"
SET "paymentReceived3" = true
WHERE "paymentMethod3" = 'E_RECEIVED';

UPDATE "FinanceRecord"
SET "paymentMethod" = 'E'
WHERE "paymentMethod" IN ('E_RECEIVED', 'E_PENDING');

UPDATE "FinanceRecord"
SET "paymentMethod2" = 'E'
WHERE "paymentMethod2" IN ('E_RECEIVED', 'E_PENDING');

UPDATE "FinanceRecord"
SET "paymentMethod3" = 'E'
WHERE "paymentMethod3" IN ('E_RECEIVED', 'E_PENDING');
