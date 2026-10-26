# Version / Release Log

What changed and when, for people using the app — not a technical changelog. This app
doesn't use formal version numbers, so each release below is labeled by the date it
shipped and groups together whatever landed as one batch of related updates. Newest first.

This is the continuing history of the Equipment Register system across **both**
applications: the original legacy web app, and its replacement — the current app — which
took over from it in mid-2026.

---

## 2026.10.18 — Inspection file icons fixed

- **Folder icons open only their own folder.** Clicking a folder icon in the **Documents**
  columns now shows just that folder's files (for example, only the two Major Inspection
  Certificate files), with the upload folder already set to match. A **Show all folders**
  link above the list brings the rest back.
- **Files button no longer overlaps the last folder column.** The row's file button used to
  sit on top of the Major Inspection Certificate column and look like a duplicate folder
  icon. It now has its own paperclip icon, the hover text **View or upload files**, and room
  beside Edit and Delete. Use it to open a record's files, or to upload the first file when
  no folder icon is showing yet.

---

## 2026.10.15 — Shared Documents for several rigs, document columns on Inspection

**Share a document set with more than one rig.** When you create a document set you can
now pick several rigs instead of one. The files are stored once and are available to every
rig on the set.

- **Edit rigs.** On a set's page, **Edit rigs** adds or removes rigs later. If you remove a
  rig that has linked inspection records, you are told how many records will be unlinked
  before anything is saved.
- **Who can change a shared set.** Anyone with access to one of the set's rigs can open it,
  download its files and link or unlink their own rig's records. Adding files, changing the
  rigs or deleting the set needs access to **every** rig on it; those buttons are hidden
  otherwise.
- **You only see your own rigs' records.** On a set shared with a rig you can't access, the
  linked records and counts shown are only those on your rigs.
- **Linking records.** When a set has more than one rig, pick the rig in the **Rig** box
  above the records list. Your ticks are kept when you switch rigs, so you can tick records
  on several rigs and save once.
- **Rigs column.** The Shared Documents list shows all of a set's rigs, and the rig filter
  finds a set by any of them.

**Files grouped by category.** On a set's page the files are shown in one panel per
category, with a count, so you can see at a glance what is in the set. Files without a
category are listed last. The category box above **Add more files** is now labelled
*Category for the new files*. Each upload can have its own category.

**Fixed: "You don't have access to this rig" when linking records.** The records list for
linking could show records from rigs that aren't on the set, and saving them was refused.
It now shows only the selected rig's records. If a link is ever refused, the message now
says why.

**Search the Rig box when linking records.** The **Rig** box above the records list now has a
search field, so you can type part of a rig's name instead of scrolling.

**Standard categories for shared documents.** The category box (on a new set and above
**Add more files**) now offers the six standard inspection folders: *OEM Certificate*,
*User Manual*, *Spare Parts Manual*, *Drawing*, *Inspection Certificate* and *Major
Inspection Certificate*. You can still type your own category. Use the standard names
so the files show up in the new **Documents** columns on the Inspection screen.

**Documents columns on the Inspection screen.** The inspection table has a new
**Documents** group with one narrow column for each of the six standard folders. A folder
icon means the record has a file in that folder, either uploaded to the record itself or
from a shared document set linked to it. An empty cell means it doesn't. Click the icon
to open the record's files. The column titles are written vertically to save space;
hover a title to see its full name. Files in other folders still open from the **Files**
button but don't get a column. On phones these columns are hidden and the **Files**
button opens the record's files.

---

## 2026.10.12 — Certificate upload review screen tidied, Upload button moved

- **Cleaner review table.** The "Guessed, not read from the certificate — check it" note under
  guessed fields is gone; the amber outline still marks them.
- **Fields have room to work in.** Each column on the certificate review table now has a
  minimum width, so Manufacturer, Certifying company and the other fields are no longer
  squeezed or clipped when you edit them or add more files. The table scrolls sideways when
  it needs more space.
- **Upload certificates button moved.** On a register's page it now sits under the
  **Instruments** count instead of at the top of the page.

---

## 2026.10.07 — Calibration Register: qualification code, TMMD fills itself in, colour filter

**On the register list**

- **Qualification code replaces Project no.** It is the form number printed at the top of
  your register sheet (for example `MNT-MS-FM-02-110`). Upload a register and it is picked up
  automatically.
- **Title is now one of four:** *Mechanical*, *Electrical*, *Workshop* or *Operations* TMMDE
  calibration Register — a dropdown when you create or edit a register, and a filter on the list.

**On the instruments table**

- **The Result column is gone.**
- **TMMD fills itself in.** Type the **Instrument** and leave the cell — TMMD is filled from
  your TMMD mapping for that register's title. An exact name match wins; a partial match is
  used when only one or two lines fit; if nothing fits (or more than two partial lines fit),
  it stays empty for you to type. A value you typed is never overwritten.
- **Row selection** works like the Inspection screen: tick a row and it is highlighted.
- **Red / amber / green.** An **Overdue / Due Soon / Compliant** filter above the table, and
  due dates are coloured red (past due), amber (within 30 days) or green (all good).
- **Acceptance criteria are read from certificate PDFs.** When you create instruments from
  certificate PDFs, the acceptance criteria (for example *+/- 1.0% of FS and as per OEM
  Instructions*) are filled in, and can be corrected on the review screen.

**Reminder emails** now go out at least a month before the due date. (They looked only
30 days ahead before, which with a weekly email could mean as little as three weeks' notice.)

---

## 2026.10.06 — Company certification check, a Vendor Companies screen, calibration due dates

**See whether a company is certified, right where you pick it.** Pick an **OEM** or
**Inspection Company** on the Inspection form and a line appears underneath: **Certified**
if the company has an active certification on the API MyCerts website, **Not currently
certified** if it has certifications but none are active, or **No exact match** if MyCerts
has nothing under that name.

- **It's for information only.** Nothing is blocked or changed because of it — you can save
  the record whatever it says.
- **On the Calibration Register**, **Manufacturer** and **Certifying company** have a small
  shield button when you edit an instrument. Click it to check that company. (It checks
  only when you click, so a big register isn't slowed down.)
- **The name has to match in full.** "Terra Tech" won't count as "Terra Tech Services".
  Upper or lower case and extra spaces don't matter. If you only know part of the name, the
  message points you to the Vendor Companies screen to find the full one.
- **If MyCerts can't be reached** you'll see a short "Unable to fetch the company
  certifications list" message and carry on as normal. If it was reachable a little earlier,
  you'll see the last result it gave, marked with its date.

**A new Vendor Companies screen** (sidebar, under **Organization**) lists every company
behind the OEM, Inspection Company, Manufacturer and Certifying company suggestions.

- **Add a company or fix a name** from this screen. A company can be switched to inactive so
  it stops appearing in the suggestions, without losing the records that already use it.
- **Same company, different capitals is the same company.** "abc company", "ABC Company" and
  "abc   company" are treated as one, so you can't add a duplicate by accident.
- **Each company shows its certifications** from MyCerts — the type (for example ISO 9001
  or API Spec Q2), the number, whether it's active, and the date of that status. Open a
  company to see only that company; **Include similar names** widens it to anything
  containing the name.
- **Adding a new company?** Start typing its name in the search box under the form. Matching
  companies from MyCerts appear, and **Use this name** copies the exact registered name
  into the form.
- **Access is by permission.** An administrator gives people the Vendor Companies
  permissions (view, create, update) from the Roles screen. The certification check on the
  forms is open to everyone who is signed in.

**Calibrations that are overdue now show on the Dashboard.** A new **Calibration** section
shows how many instruments are overdue and how many are due soon, how late the worst one is,
and a rig-by-rig list with the worst rig first. Click a rig to open its register. It counts
the same way as the register's own **Overdue** column, so the two always agree, and you only
see the rigs you have access to.

**Weekly calibration email.** The same overdue and due-soon list can now be emailed to you
each week, like the Inspection email, as a table of rig, instrument, serial number,
certificate and due date. It's **opt-in**: an administrator ticks **notify** under
**Calibration** on the Roles screen for the people who should get it. You only get an email
when something on your rigs is overdue or due soon, and one person's email failing no longer
stops everyone else's.

## 2026.09.21 — Upload the Calibration Register from Excel, certificates in the app

**The TMMDE calibration register can now be uploaded from Excel.** Instead of typing
instruments in one at a time, you load the rig's existing spreadsheet and the whole sheet
goes in at once — the real registers this was built against are 200-300 rows each. Open
**Calibration Register** in the sidebar and click **Upload register**, top right.

- **Nothing is written until you say so.** The file is read and counted first, and you get
  a summary — how many instruments are **new**, how many will be **updated**, how many rows
  couldn't be read — before anything is saved. Press Back instead and the register is
  untouched.
- **Your own sheet works as it is.** Columns are matched by their heading, not their
  position, so they can be in any order; a column your sheet doesn't have (no Model, no
  Range) is left alone rather than blanked out. Dates written as text, merged cells, the
  ± and ½ symbols and blank rows in the middle of the sheet are all handled.
- **Problems are listed row by row** — the row number, the column, and what to do about it.
  A problem that only affects one cell keeps the instrument; one that would put a wrong
  calibration date on it drops that row instead. A date written as 03/04/2026 is refused
  rather than guessed at, because a due date a year out is a rig running on an expired
  gauge.
- **Uploading the same rig twice is safe.** An instrument is recognised by its
  **certificate number plus serial number** together, so a row already there is updated and
  a new one is added — nothing is ever deleted by an upload, and nothing left out of the
  file is disturbed. You can fix a sheet and upload it again as many times as you like.
- **The rig is the one you pick**, never the one written in the file — a typo in the sheet's
  Location would otherwise file hundreds of instruments against the wrong rig. If the file
  names a different rig, a red warning appears and the load is held until you tick a box to
  confirm, because loading onto the wrong rig doesn't fail — it just adds every row there
  as new.
- **Export** on a rig's register writes the same document back out, logo and header block
  included, and it's **the same file the upload accepts** — export it, fix a few cells in
  Excel, upload it straight back. **Blank template** gives you an empty one in the right
  shape if you don't have a register yet.

Alongside it, two changes to certificates:

- Clicking a certificate's **file name now opens it inside the app**, beside its row,
  instead of downloading it and leaving you to find it in your Downloads folder. The
  download button is still there, next to the name.
- Attached a certificate to the wrong instrument? There's now a **detach** button that
  takes it off without deleting the instrument and retyping it.

And on the Inspection entry form:

- A major or intermediate schedule's **date and frequency now go together** — entering one
  without the other is refused, and clearing the date clears the frequency and the due date
  with it, instead of leaving a stale due date behind. Frequency now has a clear button of
  its own.
- Validation messages now appear **under the field they belong to** rather than collected in
  one block at the top.

## 2026.09.12 — Company name suggestions for OEM, Inspection Company, Manufacturer and Certifying company

**OEM** and **Inspection Company** on the Inspection entry form, and **Manufacturer** and
**Certifying company** on the Calibration Register, now suggest company names as you type,
drawn from a master list of over 4,000 companies imported from the eQUIP register.

- Free text always wins — typing a company that isn't in the list still saves exactly what
  you typed. The list assists, it never blocks or forces a choice.
- A value you type that isn't already in the list is quietly added to it (case and spacing
  differences are treated as the same company, so "abc corp" and "ABC Corp" never become two
  entries), so the suggestions get better the more the app is used.
- Suggestions appear as you type, or click the small arrow beside the box to see options
  before typing anything. If you don't know the exact spelling, scroll down inside the list
  for more — it loads further matches rather than stopping at the first handful.
- The suggestion list opens **above** the field instead of below it when there isn't room
  underneath — the last row of a long table, for example — so it's never mostly off-screen.
- The Calibration Register's **Manufacturer** and **Certifying company** columns are wider
  and no longer wrap onto a second line.

## 2026.09.10 — New Calibration Register module, and Data View colour and layout

**Introduced the Calibration Register (TMMDE)** — a register of calibrated instruments per
rig, replacing the spreadsheet the same information was kept in. For now the instruments
are entered by hand; uploading an existing register from Excel is planned as a follow-up.

- Each rig has **one register**, listing its instruments with instrument name, serial
  number, certificate number, manufacturer, last-calibration and due dates, acceptance
  criteria, result and remarks.
- Instruments are added and edited **directly in the table** — "New instrument" drops in a
  blank row you fill in and save. You can add several at a time, and each row saves on its
  own, so entering ten instruments no longer means ten trips through a separate form.
- Each instrument can carry **one calibration certificate** (PDF or image). It's uploaded
  when the row is saved, replaced if you upload again, and removed with the row.
- The **due date fills itself in** as one year after the last calibration when you leave it
  blank — but a date you enter yourself is always kept, since some instruments (gas
  detection, for example) are on a six-month interval.
- A **Renumber** action re-sequences the S.N column after rows are deleted. It's a
  deliberate button rather than something a delete does on its own, so numbers never
  reshuffle under you while you're reading the register.
- Instrument, Serial no., Certificate, T/M/M/D and Manufacturer are **required** when you
  add or edit a row. Older rows that arrived with gaps are left as they are.
- An instrument is identified by its **certificate and serial number together**, not the
  serial alone — in the real registers one certificate covers several instruments, and the
  same serial legitimately appears under two different certificates.
- The columns sit in the **same left-to-right order as the Excel register**, and carry the
  names that register uses — S.N, Certificate, Instrument, TMMD, Manufacturer, Model,
  Serial no., Range, Location, Grade, Acceptance, Last calibration, Due, Result, Certifying
  company, Remarks — so you can read the screen and the sheet side by side without hunting
  for a column.
- The table is built for the full 17 columns: every column filters (a dropdown where the
  choices are fixed, Day/Month/Year/Range on the dates), the header row and the
  Save/Delete column **stay in view** while you scroll sideways, and acceptance criteria
  and remarks keep their line breaks instead of collapsing onto one line.
- The module is available to **SuperAdmin and Champion** straight away; any other role is
  granted access from the Roles screen as usual.

Alongside it, three changes to the Inspection Data View:

- Due dates in the table are now colour-coded end to end: **red** overdue, **amber** due
  soon, **green** in date. Previously an in-date one showed with no colour at all, so
  "compliant" looked the same as "nothing checked".
- The **navigation tree can now be collapsed** to a narrow strip, handing its width back to
  the table — useful on the wider views. Click it again to bring the tree back.
- The **Overdue / Due Soon / Compliant filter moved onto the same row** as the Rig,
  Equipment and Part filters, instead of sitting on a line of its own.

And this log became a screen:

- **Added a Release Log page** to the app, showing everything below as a timeline — newest
  first, with a box to search for a particular change. It's the same document you're
  reading, rendered in the app rather than kept as a separate file, so the two can't
  disagree. It's permission-gated like every other screen.

## 2026.09.08 — Inspection status filter, navigation tree, and an access-scoping fix

- Added a color-coded **Overdue / Due Soon / Compliant** filter above the Inspection Data
  View table — pick one to narrow the table to just that status; it works alongside every
  other filter, search, and Export.
- Added a **navigation tree** beside the Data View table (Company → Rig → Category →
  Equipment) — click any level to jump straight to that scope.
- Fixed a bug where the Rig dropdown on several screens (Data View, Data Entry, P&ID "New
  Project", Shared Documents) could show rigs a user didn't actually have access to. It now
  only lists rigs the signed-in user is scoped to.
- Equipment, Specifications, and Equipment Categories screens gained missing search
  filters, an Excel export button, and a "created by" fix showing the real person's name
  instead of a raw username.
- Every exported Excel file now has a shaded, bold header row and cell borders, so the
  header is easy to tell apart from the data.

## 2026.09.03 — Multi-rig and multi-equipment filtering

- The Inspection Data View's Rig and Equipment filters can now select **multiple** values
  at once, instead of just one at a time.

## 2026.09.01 — Account management

- Deleting a user account is now permanent (previously it could be restored, which caused
  confusion).
- Admins can now set a user's password directly, as its own dedicated permission separate
  from general user management.

## 2026.08.27 — Permissions clean-up, PDF preview, fuller inspection data, dashboard

- An audit found 14 permissions that were granted to roles but didn't actually control
  anything — each now properly gates the feature it's named for.
- PDF files in the Library can now be **previewed in the browser** instead of only
  downloaded (for reasonably-sized files).
- The Inspection Data View and Data Entry screens now show the full set of columns/fields
  the legacy app had, approver names display properly instead of usernames, and Category
  can be edited on a record.
- The Compliance-by-Rig dashboard widget now shows every rig in scope (not a partial list),
  and dashboard widgets got plain-English help text explaining what each one measures.

## 2026.08.24 — Data View grid usability

- The Inspection Data View table header now **stays visible while scrolling**, and a
  scrollbar was added at the top of the table so wide tables can be scrolled without first
  scrolling all the way down.
- Date filters gained a Day / Month / Year / Range switcher for easier filtering.
- Added a permission allowing specific users to edit fields that are normally locked once a
  record exists (Equipment, Part, Unit, Company, Serial Number) — with a same-day follow-up
  narrowing exactly which fields that covers.
- Fixed a bug that could wrongly flag two different equipment parts sharing a serial number
  as a conflict, on some older databases.

## 2026.07.10 – 2026.08.13 — Platform modernization

**The application was rebuilt on a new technology platform** — same core functionality,
faster and easier to maintain, plus a number of capabilities the legacy app never had:

- Every existing module carried over: Companies, Rigs/Units, Roles, Scope Templates,
  Equipment & Categories, the Library, and the full P&ID Builder.
- Inspection module rebuilt end-to-end: Data View, Data Entry, Data Upload (Excel),
  Approvals inbox, record file attachments, Shared Documents, equipment reclassification,
  due-date email notifications, and Excel export.
- **New**: an in-app AI assistant that can answer plain-English questions about inspection
  data.
- **New**: a real-time in-app notification center.
- **New**: an admin audit trail showing who changed what, by name.
- **New**: an analytics dashboard with scoped compliance metrics.
- Login, password reset, and account lockout after repeated failed attempts were all
  redesigned and hardened.

*(This period covers the initial rebuild only — everything from 24 Aug 2026 onward, listed
above, is regular ongoing development on the new platform.)*

---

## Legacy application (superseded mid-2026)

Releases below were shipped on the original legacy web application, before the
modernization above. It is no longer actively developed.

## 2026.07.12 — P&ID Builder

- **Introduced the P&ID Builder** — a new visual tool for building and maintaining Piping &
  Instrumentation Diagrams: diagrams scoped per company/rig and saved to the database,
  components linked to existing equipment (or new equipment created and routed to an
  approver directly from the diagram), search-and-place for existing equipment, live
  inspection status shown on the diagram with a status summary and exportable report, and a
  **Smart Build** shortcut for assembling a diagram faster.
- Replaced plain browser pop-ups with proper in-app confirmation dialogs and alerts.
- **Each rig can now only have one P&ID project** — prevents duplicates; existing
  duplicates were cleaned up.
- Several rounds of layout and usability refinements followed the initial launch.

## 2026.06.29 — User Guide and Library refinements

- Rebuilt and expanded the in-app **User Guide** to cover the current app.
- Hardened how the Library locates files.

## 2026.06.14 — Email sending limit

- Bulk notification emails are now capped at 500 rows per send, to prevent oversized or
  slow-sending emails.

## 2026.06.07 — Account access expiry

- Admins can now set a specific expiration date/time on a user's account — useful for
  temporary or contractor access that should automatically stop working after a set point.

## 2026.06.03 — Visual refresh

- Refreshed the look of several screens for a more consistent, modern appearance,
  including the Forgot Password flow, account registration, company create/edit forms, and
  the equipment data display.

## 2026.05.20 — Library section added

- **Introduced the Library section** — browse and view reference documents (manuals,
  guides, procedures) directly in the app, gated by permission.
- Refined shortly after: improved how the Library locates and organizes files, and general
  clean-up.

## 2026.05.13 — User Guide added

- Added a downloadable **User Guide (PDF)**, accessible from the app.

## 2026.05.05 — Account security

- Standardized how temporary and reset passwords are generated, for consistency and
  security.

---

*This log is generated from the applications' source history, grouped by release date
since neither project tags formal version numbers. Internal engineering/planning changes
with no visible effect on the app are not listed.*
