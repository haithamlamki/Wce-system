# eInspection → AEMP Inspection: Cutover Plan

**Drafted:** 2026-10-27 · **Status:** draft for review · **Owner:** TBD

## Goal

Move every eInspection user onto the Inspection module at
`abraj-pid-system.vercel.app/inspection` on one agreed day. After that day,
eInspection is read-only and no compliance data is lost or entered twice.

## Approach: one cutover day, not a long parallel run

We copy data **one way only**, from eInspection to us. There is no way to send
changes back. So the longer both systems are open for editing, the more records
drift apart, and someone has to reconcile them by hand. The plan keeps that
window as short as possible:

1. eInspection stays the master until cutover day.
2. On cutover day eInspection is frozen, one last sync runs, and users switch.
3. eInspection stays readable (not editable) for a fallback period, then it
   is archived.

Running both systems in parallel for weeks was considered and rejected. It
would mean a two-way sync, which we don't have, or asking people to enter
every inspection twice, which nobody will do consistently.

## Where we are (2026-10-27)

| Data | In our production | How it is kept in step | Re-runnable? |
|---|---|---|---|
| Inspection records | 7,498 (580 pending) | eInspection Excel export → Upload page → Apply (`insp_sync_reference`) | Yes, in the app |
| Record files | 6,103 (6,102 from eInspection) | File copy script (resumes by `source_id`) | Yes, but **the script lives in a temp folder** (see G1) |
| Calibration register | Rig 103, 289 instruments + 289 certificates | Excel upload on the Calibration page | Yes, in the app; certificate copy is a script |
| Vendor companies | 4,590 | Loaded once with source ids | Script |
| Shared documents | 13 sets | Loaded once | Script |
| Users | 45 (42 created, 3 linked) | `insp_import_users` RPC | Yes, it is additive |
| Roles / templates / logs | 16 roles, 39 templates, audit + app logs | Loaded once with source ids | Script |
| Equipment types, specs, units | Synced | SQL + Upload page | Partly |

Not yet built:
- **Email notifications.** These are the weekly inspection email, the weekly calibration email and the due-date reminders. eInspection sends them; we send nothing.
- **OCR** for scanned certificates.

The 194 eInspection files that return 404 at the source are permanently missing
in both systems and are not a cutover issue.

## Go-live gates

Do not set the date until every **must** below is true.

| # | Gate | Type |
|---|---|---|
| G1 | Sync scripts moved from the temp folder into the repo (`scripts/einspection/`), with a README, and run once from there | must |
| G2 | Dress rehearsal done (see T-7), with timings recorded | must |
| G3 | User acceptance testing: 3 real users (one rig manager, one superintendent, one inspector or vendor) each do their normal week's work in our app and sign off | must |
| G4 | The 9 accounts with the app **admin** role reviewed, because admins bypass all eInspection restrictions | must |
| G5 | Someone with eInspection admin rights confirms they can make it **read-only** on the day. That means either disabling edit permissions or deactivating non-admin users | must |
| G6 | A database backup or point-in-time restore is confirmed on the Supabase plan, and a manual backup is taken just before the final sync | must |
| G7 | Email notifications live, **or** a written decision that people will check the dashboard instead until they are | must (either) |
| G8 | A one-page "what changed" note for users: URL, first sign-in, where things moved | should |
| G9 | OCR for scanned certificates | nice to have |

## Timeline

T = cutover day. Pick a **Sunday or Monday morning**, early in the working
week, so the hypercare days are working days.

### T-14: announce and test

- Announce the date to all 45 users and their managers.
- Run G3 (user testing) and fix what it finds.
- Finish G1 and G4.

### T-7: dress rehearsal

Run the full final-sync runbook (below) against production **without** freezing
eInspection. Record:
- how long each step takes (the records sync and the file delta matter most)
- the reconciliation numbers
- any step that needed manual help

If the whole runbook takes more than about 3 hours, plan the freeze for the
evening before T.

### T-1: final warning

- Remind users: "eInspection becomes read-only tomorrow at HH:MM."
- Ask approvers to clear the eInspection approval queue today, so that
  fewer records arrive pending.

### T: cutover day

| Time | Step | Who |
|---|---|---|
| 07:00 | Freeze eInspection (read-only, per G5). Post a banner or email: "use the new system from 10:00". | eInspection admin |
| 07:05 | Take a manual production backup (G6). | Us |
| 07:15 | Final sync, following the runbook below. | Us |
| 09:00 | Reconciliation checks. All must pass. | Us |
| 09:30 | Go / no-go call. | Owner + us |
| 10:00 | Send each user their sign-in details, and say the new system is live. | Owner |
| All day | Hypercare channel open. Watch sign-ins and errors. | Us |

### T+1 to T+14: hypercare

- Daily: count first sign-ins, and chase anyone who hasn't signed in by T+3.
- Daily: check for errors, failed uploads and records stuck pending.
- T+7: the first weekly email goes out, if G7 shipped.
- T+14: a short review with the owner, then close hypercare.

### T+90: archive eInspection

- Take one last full export of eInspection: records Excel, audit log, user list.
- Store it with the module's documents.
- Then switch eInspection off or let its contract lapse.

## Final-sync runbook

Each step depends on the one before it. Run them in this order.

1. **Users delta.** Fetch the eInspection user list and run
   `insp_import_users`. It only adds, so people already imported are linked,
   not changed. Note anyone deactivated in eInspection since 27 Oct and
   deactivate them here by hand.
2. **Reference data.**
   - equipment types, parts, components, specifications, frequencies, units
   - roles, permissions and scope templates, if they changed
   - vendor companies delta
3. **Records.**
   - Export the inspection register from eInspection (the Excel export).
   - Upload page → Preview → **Apply**.
   - Then delete orphans: records here that are no longer in eInspection. Back
     them up first, the same way as on 21 and 26 Oct.
4. **Record files delta.** Run the file copy script. It skips anything
   already copied (by `source_id`), so it only fetches files added since the
   last run.
5. **Calibration.** Upload the latest calibration register Excel, then copy
   any new or changed certificate PDFs.
6. **Shared documents delta.** Bring over new document sets, their files and
   their rig links.
7. **Audit and app logs delta.** Optional; the history up to the freeze is
   enough for the record.

## Reconciliation checks

Compare these between the two systems right after the final sync. Every row
must match, or have a written explanation.

| Check | eInspection source | Ours |
|---|---|---|
| Total records | `POST /api/inspection/search`, `pagination.total` | `select count(*) from insp_records` |
| Pending approval | same, filtered by status | `approve_status` pending |
| Records per rig (all 37 units) | register by unit | grouped by unit |
| Dashboard compliance % | dashboard | dashboard (it matched at 39–40% before) |
| Overdue / due in 30 days | dashboard | dashboard |
| Files | per-record file counts (sample of 50 records) | `insp_files` for the same records |
| Calibration instruments | Rig 103 register | `insp_cal_instruments` |
| Active users | user list | `profiles` where active |
| Spot check | 10 random records opened side by side, including dates, files and approver | |

## Rollback

The rollback window is **cutover day only**, until about 14:00.

- **Roll back if:** users cannot sign in at all, the reconciliation fails
  materially, or records cannot be saved.
- **How:** take eInspection out of read-only, tell users to keep using it,
  and fix the problem. Then pick a new date and repeat the final sync.
  Anything entered in our app on cutover day gets re-entered in eInspection
  by hand, which is why the window is short.
- **After the window:** no rollback. Problems are fixed forward. eInspection
  stays readable for reference until T+90.

## Passwords and first sign-in

- Every imported account already has an initial password. The owner holds the
  rule, and it is **deliberately not written here**.
- Everyone must change their password at first sign-in; the app enforces this.
- Initial passwords follow a guessable pattern, so **send sign-in details
  only on cutover day**, through a private channel.
- Run `admin_reset_password` (or the User Management "reset password" action)
  for anyone who hasn't signed in by T+7.

## Risks

| Risk | Mitigation |
|---|---|
| Sync scripts only exist in a temp folder and get lost | G1: move them into the repo before anything else |
| Users keep editing eInspection after the freeze | G5: real read-only, not just an announcement |
| No emails, so due dates are missed | G7: ship the emails or agree a dashboard routine |
| eInspection changes its export layout again (it did in October) | Dress rehearsal at T-7 catches it; the importer maps columns by header name |
| eInspection session expires during the final sync | Scripts already re-authenticate; keep an eInspection admin on call |
| Guessable initial passwords | Send only on the day; forced change; T+7 reset sweep |
| Admin-role accounts see everything | G4 review |

## Decisions needed from the owner

1. **Cutover date**, and who signs off the go / no-go.
2. **Who can make eInspection read-only** (G5), and whether that is possible
   without deactivating everyone.
3. **Emails before go-live or after** (G7). If before, which email provider and
   sender address.
4. **How sign-in details reach users**: email, WhatsApp or in person.
5. **How long eInspection stays readable**. The plan assumes 90 days.
