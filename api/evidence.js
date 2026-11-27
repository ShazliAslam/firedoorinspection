import supabase from './db-client.js';
import { setCors, requireAuth, hasRole, ROLES, logAudit } from './_auth.js';

const BUCKET = 'doorproof-evidence';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const orgId = ctx.organizationId;
  const isClient = ctx.member.role === ROLES.CLIENT;
  const clientScopeId = isClient ? ctx.member.client_id : null;

  try {
    // GET: list evidence files with short-lived signed URLs from private Storage bucket
    if (req.method === 'GET') {
      let q = supabase
        .from('evidence_files')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (isClient) {
        q = q.eq('client_id', clientScopeId).eq('approved_for_client', true);
      }
      if (req.query.inspection_id) q = q.eq('inspection_id', req.query.inspection_id);
      if (req.query.deficiency_id) q = q.eq('deficiency_id', req.query.deficiency_id);
      if (req.query.remediation_task_id) q = q.eq('remediation_task_id', req.query.remediation_task_id);
      if (req.query.fire_door_id) q = q.eq('fire_door_id', req.query.fire_door_id);

      const { data: files = [], error } = await q.limit(100);
      if (error) throw error;

      // Sign URLs for private bucket access (valid for 1 hour)
      const signedFiles = await Promise.all(
        files.map(async (file) => {
          let signedUrl = null;
          if (file.storage_path) {
            const { data: urlData } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(file.storage_path, 3600);
            signedUrl = urlData?.signedUrl || null;
          }
          return { ...file, signed_url: signedUrl };
        })
      );

      return res.status(200).json(signedFiles);
    }

    // POST: Upload evidence image/PDF to private Supabase Storage with type & size validation
    if (req.method === 'POST') {
      if (isClient) {
        return res.status(403).json({ error: 'Client portal users have read-only access to evidence.' });
      }

      const {
        fileName,
        fileBase64,
        contentType,
        evidence_type = 'inspection_original',
        client_id,
        building_id,
        fire_door_id,
        inspection_id,
        deficiency_id,
        remediation_task_id,
        caption,
        tags = [],
      } = req.body;

      if (!fileName || !fileBase64 || !contentType) {
        return res.status(400).json({ error: 'fileName, fileBase64, and contentType are required.' });
      }

      if (!ALLOWED_MIME_TYPES.includes(contentType)) {
        return res.status(400).json({
          error: `Unsupported file type (${contentType}). Allowed types: JPEG, PNG, WebP, PDF.`,
        });
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      if (buffer.length > MAX_FILE_BYTES) {
        return res.status(400).json({ error: 'File exceeds the 10 MB maximum upload limit.' });
      }

      // Derive client_id/building_id if not explicitly sent
      let resolvedClientId = client_id || null;
      let resolvedBuildingId = building_id || null;
      if (!resolvedClientId && fire_door_id) {
        const { data: d } = await supabase
          .from('fire_doors')
          .select('client_id, building_id')
          .eq('id', fire_door_id)
          .maybeSingle();
        if (d) {
          resolvedClientId = d.client_id;
          resolvedBuildingId = resolvedBuildingId || d.building_id;
        }
      } else if (!resolvedClientId && deficiency_id) {
        const { data: df } = await supabase
          .from('deficiencies')
          .select('client_id, building_id')
          .eq('id', deficiency_id)
          .maybeSingle();
        if (df) {
          resolvedClientId = df.client_id;
          resolvedBuildingId = resolvedBuildingId || df.building_id;
        }
      }

      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${orgId}/${evidence_type}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType, upsert: false });
      if (upErr) throw upErr;

      const isOriginalInspection = evidence_type === 'inspection_original';

      const { data: record, error: dbErr } = await supabase
        .from('evidence_files')
        .insert({
          organization_id: orgId,
          client_id: resolvedClientId,
          building_id: resolvedBuildingId,
          fire_door_id: fire_door_id || null,
          inspection_id: inspection_id || null,
          deficiency_id: deficiency_id || null,
          remediation_task_id: remediation_task_id || null,
          evidence_type,
          immutable: isOriginalInspection,
          file_name: fileName,
          storage_path: storagePath,
          mime_type: contentType,
          file_size: buffer.length,
          caption: caption || '',
          tags: Array.isArray(tags) ? tags : [],
          uploaded_by_name: ctx.profile?.full_name || ctx.user.email,
          approved_for_client: true,
        })
        .select()
        .single();
      if (dbErr) throw dbErr;

      const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);

      await logAudit(ctx, {
        action: 'evidence.uploaded',
        entityType: 'evidence_file',
        entityId: record.id,
        details: { fileName, evidence_type, immutable: isOriginalInspection },
      });

      return res.status(201).json({ ...record, signed_url: urlData?.signedUrl || null });
    }

    // DELETE: Strictly prevent deleting immutable original inspection evidence!
    if (req.method === 'DELETE') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can remove non-immutable evidence.' });
      }
      const { id } = req.body;
      const { data: file } = await supabase
        .from('evidence_files')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .single();
      if (!file) return res.status(404).json({ error: 'Evidence record not found.' });

      if (file.immutable) {
        return res.status(403).json({
          error: 'Original inspection evidence is immutable and retained for audit compliance. It cannot be deleted.',
        });
      }

      if (file.storage_path) {
        await supabase.storage.from(BUCKET).remove([file.storage_path]);
      }
      await supabase.from('evidence_files').delete().eq('id', id).eq('organization_id', orgId);

      await logAudit(ctx, {
        action: 'evidence.deleted',
        entityType: 'evidence_file',
        entityId: id,
        details: { file_name: file.file_name },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('[api/evidence] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
