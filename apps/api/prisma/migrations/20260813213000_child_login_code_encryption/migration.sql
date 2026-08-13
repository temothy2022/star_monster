ALTER TABLE "ChildProfile"
ADD COLUMN "loginCodeCiphertext" TEXT,
ADD COLUMN "loginCodeEncryptionIv" TEXT,
ADD COLUMN "loginCodeEncryptionTag" TEXT;
