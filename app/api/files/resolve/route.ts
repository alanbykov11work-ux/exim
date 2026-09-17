import { NextResponse, type NextRequest } from "next/server";
import { authorizeActor } from "@/lib/auth/authorize";
import { sameOrigin } from "@/lib/auth/request";
import { query } from "@/lib/db";
import { deleteFile, FOLDER_RE, loadFile, safeDownloadName } from "@/lib/files/storage";

export const runtime = "nodejs";

type DocumentRow = { id: string; storage_key: string; name: string; mime_type: string };

async function findDocument(request: NextRequest, userId: string, workspaceId: string) {
  const folder = String(request.nextUrl.searchParams.get("folder") || "");
  const name = String(request.nextUrl.searchParams.get("name") || "");
  if (!FOLDER_RE.test(folder) || !name || name.length > 255) return null;
  const result = await query<DocumentRow>(
    `select id, storage_key, name, mime_type from documents
      where workspace_id = $1 and uploaded_by = $2 and folder = $3 and name = $4
      order by created_at desc limit 1`,
    [workspaceId, userId, folder, name]
  );
  return result.rows[0] || null;
}

export async function GET(request: NextRequest) {
  const access = await authorizeActor({ moduleKey: "private_os" });
  if (!access.ok) return access.response;
  const { actor } = access;
  const document = await findDocument(request, actor.id, actor.workspaceId);
  if (!document) return NextResponse.json({ error: "not found" }, { status: 404 });
  const bytes = await loadFile(document.storage_key);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": document.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeDownloadName(document.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const access = await authorizeActor({ moduleKey: "private_os" });
  if (!access.ok) return access.response;
  const { actor } = access;
  const document = await findDocument(request, actor.id, actor.workspaceId);
  if (!document) return NextResponse.json({ error: "not found" }, { status: 404 });
  await query("delete from documents where id = $1 and workspace_id = $2 and uploaded_by = $3", [document.id, actor.workspaceId, actor.id]);
  await deleteFile(document.storage_key);
  return NextResponse.json({ ok: true });
}
