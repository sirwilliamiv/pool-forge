-- Projects a customer had already signed, still sitting at Draft.
--
-- Accepting a proposal did not advance the project until the command that does
-- it was written, so any project accepted before then kept whatever status it
-- had. The builder's board showed Draft against a signed document, which is the
-- same wrong answer the fix was for, just written down earlier.
--
-- Forward only. A project further along than APPROVED is left where it is, and
-- so is an archived one: archiving is a builder's own decision and a signature
-- from before that decision does not undo it.
UPDATE "Project"
SET "status" = 'APPROVED'
WHERE "proposalAcceptedAt" IS NOT NULL
  AND "status" IN ('DRAFT', 'READY_FOR_REVIEW', 'PROPOSAL_SENT');
