import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { getSessionUser } from "@/server/auth/session";
import { SESSION_COOKIE } from "@/server/auth/token";
import { renderPdf } from "@/server/pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Re-render the report page as the same user (scope rules apply unchanged)
  const q = new URLSearchParams(req.nextUrl.searchParams);
  q.set("pdf", "1");
  const title = q.get("title") || "Loan Portfolio Report";
  try {
    const pdf = await renderPdf({
      path: `/report?${q.toString()}`,
      cookie: { name: SESSION_COOKIE, value: token },
      footerLabel: `${title} · Confidential`,
    });
    await audit(user.id, "report.export_pdf", "report", undefined, { params: Object.fromEntries(q) });
    const fname = `${title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("PDF export failed", e);
    return NextResponse.json({ error: "PDF export failed. Use Print → Save as PDF from the preview instead." }, { status: 500 });
  }
}
