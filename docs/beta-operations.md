# Running the invite-only beta

Everything an operator does by hand while Pool Forge is invite only. Deployment
itself is [deploy.md](deploy.md); this is about people getting in and back in.

Every command below needs `DATABASE_URL` pointing at production:

```sh
export DATABASE_URL="$(gcloud secrets versions access latest \
  --secret pool-forge-database-url --project pool-forge-prod)"
export APP_URL=https://pool-forge-zlqgqa7qkq-uc.a.run.app
```

## Why any of this is manual

No mail provider is configured. `RESEND_API_KEY` is not set, so `sendEmail`
takes its honest path: it records that nothing was sent and tells the caller so,
rather than pretending. That is the right behaviour and it has a cost, which is
that **every invite and every reset is delivered by a person copying a link.**

Both scripts below exist for that window and should be deleted when it closes.
Configuring Resend removes them: create the account, verify a sending domain,
put the key in Secret Manager as `pool-forge-resend-api-key`, set `EMAIL_FROM`,
redeploy. `deploy.sh` already mounts the secret when it exists.

## Onboarding a new builder

Each company is its own organisation with its own price book. There is no
self-service registration: `/register` redirects to `/request-access`, which is
the marketing page and the waitlist form.

```sh
pnpm tsx scripts/bootstrap-owner.ts \
  --org "Holiday Pools" \
  --email paige@example.com \
  --role OWNER \
  --app-url "$APP_URL"
```

Prints a one-use invite link, good for seven days. Send it yourself. They set
their own password on that page and land signed in, so the password never
exists anywhere an operator can see it.

Re-running replaces rather than accumulates: an organisation of the same name is
reused, and unspent invites for the same address are retired first.

Two things to do before sending the link:

- **Check the organisation name.** It prints on their proposals and permit
  sheets. Guessing it from an email address is fine for a first look and wrong
  on a contract.
- **Know that their org starts empty.** No price book, so every pool they draw
  reads "Not priced" until their spreadsheet is imported at
  `/settings/price-book/import`. A builder's first session should not be a demo
  of placeholder numbers.

### Adding somebody to an existing organisation

Same script, existing org name, lower role:

```sh
pnpm tsx scripts/bootstrap-owner.ts --org "Holiday Pools" \
  --email sam@example.com --role MEMBER --app-url "$APP_URL"
```

Or, better, let the owner do it themselves from `/settings/team`, which is the
path the product actually supports.

## When somebody is locked out

`/forgot-password` is the right path and it works. It emails the link, and until
email is configured it emails nothing, so the person waits for a message that
will never arrive. Until then:

```sh
pnpm tsx scripts/reset-password-link.ts --email sam@example.com --app-url "$APP_URL"
```

One use, sixty minutes, and any earlier unspent reset for that address dies when
this one is minted.

**An invite is not a substitute for a reset.** Re-inviting an address that
already has an account does not let them set a new password: `acceptInvite`
verifies the existing password before joining them to the org, exactly the way
sign-in does. An existing account that has lost its password needs a reset link
and nothing else.

## Where things live

| | |
|---|---|
| App | Cloud Run `pool-forge`, `us-central1`, project `pool-forge-prod` |
| Database | Neon, role and database `pool_forge` inside project `polished-brook-80300112` |
| Files | `gs://pool-forge-prod-blobs` |
| Secrets | Secret Manager, `pool-forge-*` |

The Neon organisation is managed by Vercel, so `neonctl` cannot create projects
in it. That is why production is a database inside an existing project rather
than one of its own. A new Neon project has to be created from the Vercel
dashboard.

Cloud Run is `--min-instances 0` and Neon autosuspends, so an idle beta costs
almost nothing and the first request after a quiet period is slow. That is the
intended trade, not a fault.

## One thing that was loosened

The organisation enforces domain restricted sharing
(`iam.allowedPolicyMemberDomains`, customer `C00io0ldw` only), which blocked
`allUsers` on the Cloud Run service and made the app return 403 to the public.
The constraint accepts customer IDs only, so there is no narrow exception for
public principals, and the whole constraint is overridden for
`pool-forge-prod` alone with a project-level `allowAll`.

Worth knowing because it means **any** IAM binding in that project can now name
identities outside the domain, not just the one that needed it. Contained to a
project that hosts only this app. If that stops being acceptable, the
alternative is putting the app behind IAP or authenticated invocations and
dropping the override.

## What closes the manual gap

1. **Configure Resend.** Removes both scripts above and lets an owner invite
   their own team without an operator.
2. **Point `/` at the marketing page.** It currently redirects to `/login`, so a
   builder who types the domain gets a sign-in box and no explanation.
   `/request-access` already exists and nothing links to it.
3. **Seed a starter price book on org creation**, or make the import the first
   thing a new owner sees.
