# Loan Portfolio Monitor

An intranet web app that replaces the consolidated loan-monitoring workbook
(`Report_Consoliated.xlsm`). It imports the core-banking **Loan Master List**
exports, keeps every export as a dated snapshot, and provides dashboards,
provisioning analysis, watchlists and a print-ready management report (PDF and
Excel) with role-based access for senior management, province managers and
branch managers.

---

## What it does

| Workbook sheet(s) | App page |
|---|---|
| Report, Loan Status Reports, Rank, Cross Tab Analysis | **Dashboard**, **Portfolio** (by branch, province or product, down to individual loans) |
| Credit Movement, New Disbursement | **Movement**: new, closed, top-up, repayment, provision up/down, branch roll-forward |
| Recovery Analysis | **Recovery**: principal, interest and penalty collected between snapshots |
| LLP Work, LLP as Per IR, LLP Review Module | **Provisioning**: classification, projected slippage to quarter or year end, interest-based DPD check, class migration matrix, manual "Add: LLP" |
| Budget, Budget Analysis | **Budget vs Actual**: target for the Nepali fiscal month |
| DPD Mismatch, Interest Stopped, Renewal Followup | **Watchlist**: about to slip, DPD jumps, maturing soon, expired but outstanding, interest stopped |
| Wildcard Search, LLP Review Module (account lookup) | **Account Search** and the account 360° view, with follow-up notes |
| Email macros | Reports and CSV exports (email is a planned addition) |
| — | **Management Report**: an A4 pack with PDF and Excel download |

### Business rules (single source of truth: `src/domain/`)

- **Classification and provisioning by DPD:** 0–90 days → Pass 1%; 91–182 → Substandard 25%; 183–365 → Doubtful 50%; over 365 → Bad 100% of principal outstanding.
- **Staff loans** (products starting with "Staff") are excluded from provisioning and, by default, from analytics. This can be changed per product under **Admin → Products**.
- **Required to close** = accrued penalty + accrued interest + penal balance + interest balance + principal outstanding.
- **Daily interest** = principal × rate / 36500. **Daily penalty** = 2% p.a. on overdue principal once DPD ≥ 15, and never for Corporate Office.
- **Interest-based DPD** = max(reported DPD, interest due ÷ daily interest).
- **NPL** = outstanding with DPD over 90.
- Money is held as integer paisa inside the engine, so totals are exact. Each loan's provision is rounded to the paisa.

The engine is **verified against the workbook**. `tests/parity.test.ts`
recomputes LLP %, LLP amount, required-to-close, daily interest and daily
penalty for every loan and compares them with the values Excel cached. All
2,019 loans match within Rs 0.05, the same tolerance as the workbook's own
`Report!AM` check, and movement totals match *Credit Movement*.

---

## Architecture

```
src/
  domain/          Pure TypeScript business logic (no DB, no UI): money, provisioning
                   policy, loan formulas, snapshot comparison, aggregation, Nepali calendar
  server/
    excel/         Adapters: Excel → validated rows (header-based, order-independent)
    import/        Import service: analyse (preview) → commit (transactional)
    repo/          Repositories: snapshot positions (cached, immutable), SQL trends
    auth/          Session (signed JWT cookie), role checks, row-level data scope
    views/         View models shared by pages and the report
    actions/       Server actions (admin, provisioning overrides, follow-ups)
    pdf.ts         Headless Chromium PDF renderer
  app/             Next.js App Router pages and API routes
  components/      UI kit (tables, stat tiles, charts)
prisma/            Schema and migrations
scripts/           seed (first admin), import-workbook (bootstrap)
tests/             Unit and parity tests
```

**Patterns used:**
- **Layered (hexagonal) architecture:** the domain has no dependencies, and Excel, the database and PDF sit behind adapters.
- **Repository:** snapshots are immutable, so each is loaded once and cached.
- **Strategy and policy object:** `PROVISION_BUCKETS` is the single place to change provisioning rules.
- **DTO validation at the boundary:** Zod validates every imported row.
- **Command plus audit log:** every import, edit, export and account view is recorded.
- **Row-level security:** every data query passes through a `Scope`, so a branch manager can never load another branch's loans.

**Stack:** Next.js 15 (App Router, Server Components), TypeScript, Tailwind CSS 4,
PostgreSQL 16 + Prisma, ExcelJS, Recharts, Playwright-core with Chromium for PDF,
`nepali-date-converter`, Vitest, Docker.

---

## Roles

| Role | Sees | Can do |
|---|---|---|
| Administrator | everything | import data, manage users, branches and products, view the audit log |
| Senior Management | everything | reports, manual additional provision |
| Province Manager | branches in their province | reports and follow-up notes for their province |
| Branch Manager | their branch only | reports and follow-up notes for their branch |

---

## Deploying on the intranet (Docker)

Requirements: a Linux server (or Windows with Docker Desktop) with Docker Engine 24+ and the Compose plugin.

```bash
cp .env.example .env
```

Edit `.env`: set `DB_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`) and `ADMIN_PASSWORD`.

```bash
docker compose up -d --build
```

Open `http://<server>:3000` and sign in as `admin`. You will be asked to set a new password.

This starts three containers:
- **db:** PostgreSQL. It is not exposed outside the Docker network.
- **app:** the web app. On start it applies database migrations and creates the first admin.
- **backup:** a nightly compressed `pg_dump` into `./backups`, keeping 30 days by default.

**Server without internet access:** build on a machine that has internet, then copy the images across:

```bash
docker compose build
```

```bash
docker save loan-portal:latest postgres:16-alpine | gzip > loan-portal-images.tar.gz
```

On the intranet server, load the images, then start without building:

```bash
gunzip -c loan-portal-images.tar.gz | docker load
```

```bash
docker compose up -d --no-build
```

**HTTPS:** put the app behind your usual reverse proxy (IIS, nginx, Caddy) with an internal certificate, then set `COOKIE_SECURE=true`.

**Restore a backup:**

```bash
gunzip -c backups/loanportal-YYYYMMDD-HHMM.sql.gz | docker compose exec -T db psql -U loanportal -d loanportal
```

### First data load

Either use **Admin → Import Data** in the browser, or the CLI:

```bash
docker compose cp Report_Consoliated.xlsm app:/tmp/workbook.xlsm
```

```bash
docker compose exec app node scripts/import-workbook.js /tmp/workbook.xlsm
```

This imports the branch directory (provinces, emails, province managers), both
master lists as dated snapshots, and the budget for the current fiscal year.

### Routine use

1. Export the **Loan Master List** from core banking as usual and save it as `.xlsx`.
2. Go to **Admin → Import Data**, upload it, review the preview and validation, then confirm.
3. Every page now compares it with the previous snapshot automatically. Older snapshots can be selected in the toolbar.

Re-uploading the same export is detected and skipped.

---

## Development

```bash
npm install
```

```bash
cp .env.example .env
```

Set `DATABASE_URL`, `SESSION_SECRET` and `CHROMIUM_PATH` in `.env`, then:

```bash
npx prisma migrate dev
```

```bash
ADMIN_PASSWORD='ChangeMe@123' npm run seed
```

```bash
npm run dev
```

Tests:

```bash
npm test
```

To also run the parity tests, point them at the workbook. The workbook holds customer data and must never be committed.

```bash
PARITY_WORKBOOK=/path/to/Report_Consoliated.xlsm npm test
```

## Known limitations and next steps

- Email digests to branch and province managers (replacing the Outlook macros) are not built yet. The branch and province emails are already imported.
- Collateral (the *(N) Collateral* sheet) is not modelled yet.
- Uploads must be `.xlsx` or `.xlsm`. Save `.xls` or `.csv` exports as `.xlsx` first.
- The login lockout is per app instance (in memory). Run a single app container, or move the lockout to the database if you scale out.
