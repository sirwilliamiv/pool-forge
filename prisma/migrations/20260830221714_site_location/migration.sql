-- Site location for address autocomplete and satellite/parcel/building import
ALTER TABLE "Project" ADD COLUMN "siteAddress" TEXT;
ALTER TABLE "Project" ADD COLUMN "sitePlaceId" TEXT;
ALTER TABLE "Project" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "longitude" DOUBLE PRECISION;
