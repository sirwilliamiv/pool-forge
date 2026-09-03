-- Active price-book lookup on the project-page hot path: filter orgId +
-- isActive, order by version desc. Without this only the plain orgId index
-- was usable and the isActive/version work fell to a sort.
CREATE INDEX "PriceBook_orgId_isActive_version_idx" ON "PriceBook"("orgId", "isActive", "version");
