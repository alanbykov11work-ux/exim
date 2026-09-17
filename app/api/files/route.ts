import { NextResponse, type NextRequest } from "next/server";
import { authorizeActor } from "@/lib/auth/authorize";
import { sameOrigin } from "@/lib/auth/request";
import { query } from "@/lib/db";
import { deleteFile, FOLDER_RE, MAX_FILE_BYTES, storeFile } from "@/lib/files/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await authorizeActor({ moduleKey: "private_os" });
  if (!access.ok) return access.response;
  const { actor } = access;
  const folder = String(request.nextUrl.searchParams.get("folder") || "");
  if (!FOLDER_RE.test(folder)) return NextResponse.json({ error: "invalid folder" }, { status: 400 });
  const result = await query<{ id: string; name: string; created_at: string }>(
    `select id, name, created_at from documents
      where workspace_id = $1 and uploaded_by = $2 and folder = $3
      order by created_at desc`,
    [actor.workspaceId, actor.id, folder]
  );
  return NextResponse.json({
    data: result.rows.map((row) => ({ id: row.id, name: row.name, created_at: row.created_at })),
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const access = await authorizeActor({ moduleKey: "private_os" });
  if (!access.ok) return access.response;
  const { actor } = access;
  const form = await request.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") || "");
  if (!(file instanceof File) || !FOLDER_RE.test(folder) || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "invalid file" }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile(bytes);
  try {
    const result = await query<{ id: string }>(
      `insert into documents
         (workspace_id, client_company_id, uploaded_by, folder, storage_key, name, mime_type, size_bytes, sha256)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [actor.workspaceId, actor.clientCompanyId, actor.id, folder, stored.storageKey, file.name.slice(0, 255), file.type || "application/octet-stream", file.size, stored.checksum]
    );
    return NextResponse.json({ ok: true, id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    await deleteFile(stored.storageKey);
    throw error;
  }
}
