import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { analyseUpload } from "@/server/import/importService";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is larger than 50 MB" }, { status: 413 });
  try {
    const analysis = await analyseUpload(Buffer.from(await file.arrayBuffer()), file.name);
    await audit(user.id, "import.analyse", "upload", analysis.token, { fileName: file.name, size: file.size });
    return NextResponse.json(analysis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not read the file";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
