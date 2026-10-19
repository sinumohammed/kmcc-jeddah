-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AssistantUsage" (
    "userKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("userKey","day")
);

-- CreateTable
CREATE TABLE "ChannelLink" (
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelLink_pkey" PRIMARY KEY ("channel","externalId")
);

-- CreateTable
CREATE TABLE "ChannelLinkCode" (
    "codeHash" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelLinkCode_pkey" PRIMARY KEY ("codeHash")
);

-- CreateTable
CREATE TABLE "ChannelPref" (
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "voiceLanguage" TEXT NOT NULL,

    CONSTRAINT "ChannelPref_pkey" PRIMARY KEY ("channel","externalId")
);

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "updateId" BIGINT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE INDEX "ChannelLink_memberId_idx" ON "ChannelLink"("memberId");

-- AddForeignKey
ALTER TABLE "ChannelLink" ADD CONSTRAINT "ChannelLink_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelLinkCode" ADD CONSTRAINT "ChannelLinkCode_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
