import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/server/auth/session";
import { commitUpload } from "@/server/import/importService";

export const runtime = "nodejs";
export const maxDuration = 300;

const body = z.object({
  token: z.string().uuid(),
  sheets: z.array(z.object({ sheetName: z.string(), reportDate: z.string().nullable().optional() })),
  importBranchDirectory: z.boolean(),
  budgetFiscalYear: z.string().regex(/^\d{4}\/\d{2}$/).nullable(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const result = await commitUpload({ ...parsed.data, userId: user.id });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 422 });
  }
}
