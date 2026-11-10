import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendChart } from "@/components/charts/TrendChart";
import { ClassBadge } from "@/components/ui/ClassBadge";
import { DataTable } from "@/components/ui/DataTable";
import { Card, PageHeader, Stat } from "@/components/ui/primitives";
import {
  dailyInterest,
  dailyPenalty,
  effectiveDpd,
  interestDue,
  outstanding,
  parseAccountNumber,
  penaltyDue,
  provisionFor,
  requiredToClose,
} from "@/domain/loan";
import { formatCompactNPR, formatNPR, toPaisa } from "@/domain/money";
import { bucketFor } from "@/domain/provisioning";
import { fmtDate, fmtDual, fmtDateTime } from "@/lib/dates";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth/session";
import { accountWhere, scopeFor } from "@/server/auth/scope";
import { mapRow } from "@/server/repo/positions";
import { toggleFollowUpAction } from "@/server/actions/followups";
import { FollowUpForm } from "./FollowUpForm";

export const metadata = { title: "Account" };

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-ink tabular-nums">{children}</dd>
    </div>
  );
}

export default async function AccountPage({ params }: { params: Promise<{ account: string }> }) {
  const { account: accountNumber } = await params;
  const user = await requireUser();
  const scope = await scopeFor(user);
  const account = await prisma.loanAccount.findFirst({
    where: { accountNumber, ...accountWhere(scope) },
    include: {
      branch: { include: { province: true } },
      product: true,
      borrower: true,
      rows: { include: { snapshot: true }, orderBy: { snapshot: { asOf: "asc" } } },
      followUps: { include: { author: true }, orderBy: { createdAt: "desc" } },
      overrides: { where: { effectiveTo: null }, include: { createdBy: true } },
    },
  });
  if (!account) notFound();
  await audit(user.id, "account.view", "LoanAccount", accountNumber);

  const history = account.rows.map((r) => ({ asOf: r.snapshot.asOf, pos: mapRow(r, account) }));
  const latest = history.at(-1);
  const l = latest?.pos;
  const parts = parseAccountNumber(account.accountNumber);
  const prov = l ? provisionFor(l) : null;
  const extra = account.overrides.reduce((s, o) => s + toPaisa(o.amount), 0);

  return (
    <>
      <PageHeader
        title={account.borrower.name}
        subtitle={
          <>
            Account <span className="font-mono">{account.accountNumber}</span> · {account.product.name} · {account.branch.name}
            {account.branch.province && ` · ${account.branch.province.name}`}
          </>
        }
        actions={<Link href="/accounts" className="text-sm text-accent hover:underline">← Search</Link>}
      />
      {!l ? (
        <p className="text-sm text-muted">No snapshot data for this account.</p>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            Latest data as of {fmtDual(latest!.asOf)}
            {account.product.excludeFromProvisioning && " · staff loan (excluded from provisioning)"}
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Outstanding" value={formatCompactNPR(outstanding(l))} sub={`of ${formatCompactNPR(l.principal)} disbursed`} />
            <Stat label="Days past due" value={l.dpd.toLocaleString("en-IN")} sub={<ClassBadge cls={bucketFor(l.dpd).cls} />} />
            <Stat label="Principal overdue" value={formatCompactNPR(l.overduePrincipal)} />
            <Stat label="Required to close" value={formatCompactNPR(requiredToClose(l))} sub="incl. accrued interest & penalty" />
            <Stat label="Provision" value={formatCompactNPR(l.excludeFromProvisioning ? 0 : (prov?.amount ?? 0) + extra)} sub={`${((prov?.rate ?? 0) * 100).toFixed(0)}%${extra ? ` + Rs. ${formatNPR(extra, { decimals: 0 })} manual` : ""}`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card title="Loan details">
              <dl>
                <Item label="Branch / chart / serial">{parts.branchCode} / {parts.chartCode} / {parts.serial}</Item>
                <Item label="Opened">{fmtDate(account.openingDate)}</Item>
                <Item label="Maturity">{fmtDate(account.maturityDate)}</Item>
                <Item label="Interest rate">{l.interestRate.toFixed(2)}%</Item>
                <Item label="Penal rate">{l.penalRate.toFixed(2)}%</Item>
                <Item label="Instalment">{formatNPR(l.installmentAmount)}</Item>
                <Item label="Frequency">{l.frequency ?? "—"}</Item>
                <Item label="Term (instalments)">{l.term || "—"}</Item>
                <Item label="Last transaction">{fmtDate(l.lastTransactionDate)}</Item>
              </dl>
            </Card>
            <Card title="Balances">
              <dl>
                <Item label="Principal outstanding">{formatNPR(outstanding(l))}</Item>
                <Item label="Principal paid">{formatNPR(l.principalPaid)}</Item>
                <Item label="Interest due">{formatNPR(interestDue(l))}</Item>
                <Item label="Penalty due">{formatNPR(penaltyDue(l))}</Item>
                <Item label="Accrued interest">{formatNPR(l.accruedInterest)}</Item>
                <Item label="Accrued penalty">{formatNPR(l.accruedPenalty)}</Item>
                <Item label="Interest paid (to date)">{formatNPR(l.interestPaid)}</Item>
                <Item label="Penalty & charges paid">{formatNPR(l.penalChargePaid)}</Item>
              </dl>
            </Card>
            <Card title="Risk">
              <dl>
                <Item label="Classification"><ClassBadge cls={prov?.cls} /></Item>
                <Item label="DPD implied by interest">{Math.round(effectiveDpd(l)).toLocaleString("en-IN")}</Item>
                <Item label="Class by interest DPD"><ClassBadge cls={bucketFor(effectiveDpd(l)).cls} /></Item>
                <Item label="Interest accruing / day">{formatNPR(dailyInterest(l))}</Item>
                <Item label="Penalty accruing / day">{formatNPR(dailyPenalty(l))}</Item>
                <Item label="Phone">{account.borrower.phone ?? "—"}</Item>
                <Item label="Address">{account.borrower.address ?? "—"}</Item>
              </dl>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card title="Outstanding over time">
              <TrendChart height={200} data={history.map((h) => ({ label: fmtDate(h.asOf).slice(5), value: outstanding(h.pos) }))} />
            </Card>
            <Card title="Follow-up notes" subtitle="Visible to everyone who can see this account">
              <FollowUpForm accountNumber={account.accountNumber} />
              <ul className="mt-4 divide-y divide-border">
                {account.followUps.length === 0 && <li className="py-3 text-sm text-muted">No notes yet.</li>}
                {account.followUps.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className={f.done ? "text-muted line-through" : ""}>
                      <p className="whitespace-pre-wrap">{f.note}</p>
                      <p className="mt-1 text-xs text-muted">
                        {f.author?.fullName ?? "—"} · {fmtDateTime(f.createdAt)}
                        {f.dueDate && ` · due ${fmtDate(f.dueDate)}`}
                      </p>
                    </div>
                    <form action={toggleFollowUpAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="shrink-0 text-xs text-accent hover:underline">{f.done ? "Reopen" : "Mark done"}</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Snapshot history</h2>
          <DataTable
            searchable={false}
            initialSort={{ key: "asOf", dir: "desc" }}
            columns={[
              { key: "asOf", label: "As of" },
              { key: "outstanding", label: "Outstanding", kind: "money" },
              { key: "principalOverdue", label: "Principal OD", kind: "money" },
              { key: "interestDue", label: "Interest due", kind: "money" },
              { key: "principalPaid", label: "Principal paid (cum.)", kind: "money" },
              { key: "interestPaid", label: "Interest paid (cum.)", kind: "money" },
              { key: "dpd", label: "DPD", kind: "dpd" },
              { key: "cls", label: "Class", kind: "class" },
            ]}
            rows={history.map((h) => ({
              asOf: fmtDateTime(h.asOf),
              outstanding: outstanding(h.pos),
              principalOverdue: h.pos.overduePrincipal,
              interestDue: interestDue(h.pos),
              principalPaid: h.pos.principalPaid,
              interestPaid: h.pos.interestPaid,
              dpd: h.pos.dpd,
              cls: bucketFor(h.pos.dpd).cls,
            }))}
          />
        </>
      )}
    </>
  );
}
