import supabase from './db-client.js';
import { setCors, requireAuth, hasRole, ROLES, logAudit, dispatchNotification } from './_auth.js';

const BUCKET = 'doorproof-evidence';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const orgId = ctx.organizationId;
  const isClient = ctx.member.role === ROLES.CLIENT;
  const clientScopeId = isClient ? ctx.member.client_id : null;

  try {
    if (req.method === 'GET') {
      if (req.query.action === 'dataset') {
        if (isClient) {
          return res.status(403).json({ error: 'Only contractor personnel can generate new reports.' });
        }
        const { client_id, building_id, fire_door_id, inspection_id, report_type } = req.query;
        if (!client_id) return res.status(400).json({ error: 'client_id is required to compile report data.' });

        const [orgRes, clientRes, bldsRes, doorsRes, insRes, itemsRes, defsRes, remsRes, evRes] =
          await Promise.all([
            supabase.from('organizations').select('*').eq('id', orgId).single(),
            supabase.from('clients').select('*').eq('id', client_id).eq('organization_id', orgId).single(),
            (() => {
              let q = supabase.from('buildings').select('*').eq('organization_id', orgId).eq('client_id', client_id);
              if (building_id) q = q.eq('id', building_id);
              return q;
            })(),
            (() => {
              let q = supabase.from('fire_doors').select('*').eq('organization_id', orgId).eq('client_id', client_id);
              if (building_id) q = q.eq('building_id', building_id);
              if (fire_door_id) q = q.eq('id', fire_door_id);
              return q;
            })(),
            (() => {
              let q = supabase.from('inspections').select('*').eq('organization_id', orgId).eq('client_id', client_id).order('created_at', { ascending: false });
              if (building_id) q = q.eq('building_id', building_id);
              if (inspection_id) q = q.eq('id', inspection_id);
              return q;
            })(),
            inspection_id
              ? supabase.from('inspection_items').select('*').eq('inspection_id', inspection_id).eq('organization_id', orgId)
              : Promise.resolve({ data: [] }),
            (() => {
              let q = supabase.from('deficiencies').select('*').eq('organization_id', orgId).eq('client_id', client_id).order('created_at', { ascending: false });
              if (building_id) q = q.eq('building_id', building_id);
              if (fire_door_id) q = q.eq('fire_door_id', fire_door_id);
              if (inspection_id) q = q.eq('inspection_id', inspection_id);
              if (report_type === 'Outstanding Deficiencies') {
                q = q.not('status', 'in', '("Verified","Closed")');
              }
              return q;
            })(),
            (() => {
              let q = supabase.from('remediation_tasks').select('*').eq('organization_id', orgId).eq('client_id', client_id);
              if (building_id) q = q.eq('building_id', building_id);
              if (fire_door_id) q = q.eq('fire_door_id', fire_door_id);
              return q;
            })(),
            (() => {
              let q = supabase.from('evidence_files').select('*').eq('organization_id', orgId).eq('client_id', client_id).order('created_at', { ascending: false }).limit(24);
              if (building_id) q = q.eq('building_id', building_id);
              if (fire_door_id) q = q.eq('fire_door_id', fire_door_id);
              if (inspection_id) q = q.eq('inspection_id', inspection_id);
              return q;
            })(),
          ]);

        const signedEvidence = await Promise.all(
          (evRes.data || []).map(async (f) => {
            const { data: u } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 3600);
            return { ...f, signed_url: u?.signedUrl || null };
          })
        );

        return res.status(200).json({
          organization: orgRes.data,
          client: clientRes.data,
          buildings: bldsRes.data || [],
          doors: doorsRes.data || [],
          inspections: insRes.data || [],
          inspectionItems: itemsRes.data || [],
          deficiencies: defsRes.data || [],
          remediations: remsRes.data || [],
          evidence: signedEvidence,
        });
      }

      let q = supabase
        .from('reports')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (isClient) {
        q = q.eq('client_id', clientScopeId).eq('shared_with_client', true);
      } else if (req.query.client_id) {
        q = q.eq('client_id', req.query.client_id);
      }

      const { data: reports = [], error } = await q;
      if (error) throw error;

      const [cRes, bRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('organization_id', orgId),
        supabase.from('buildings').select('id, name').eq('organization_id', orgId),
      ]);
      const cMap = Object.fromEntries((cRes.data || []).map((c) => [c.id, c.name]));
      const bMap = Object.fromEntries((bRes.data || []).map((b) => [b.id, b.name]));

      const enriched = await Promise.all(
        reports.map(async (r) => {
          let downloadUrl = null;
          if (r.storage_path) {
            const { data: u } = await supabase.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600);
            downloadUrl = u?.signedUrl || null;
          }
          return {
            ...r,
            client_name: cMap[r.client_id] || 'Unknown Client',
            building_name: r.building_id ? bMap[r.building_id] || 'All Buildings' : 'All Portfolio Buildings',
            download_url: downloadUrl,
          };
        })
      );

      return res.status(200).json(enriched);
    }

    if (req.method === 'POST') {
      // Generate a time-limited expiring signed link for secure client delivery
      if (req.body?.action === 'create_share_link') {
        if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
          return res.status(403).json({ error: 'Only Owners, Admins, and Inspectors can create expiring report links.' });
        }
        const { id, expires_in_hours = 72 } = req.body;
        const seconds = Math.min(7 * 86400, Math.max(3600, Number(expires_in_hours) * 3600));
        const { data: rpt } = await supabase
          .from('reports')
          .select('*')
          .eq('id', id)
          .eq('organization_id', orgId)
          .single();
        if (!rpt || !rpt.storage_path) return res.status(404).json({ error: 'Report file not found.' });

        const { data: u, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(rpt.storage_path, seconds);
        if (signErr) throw signErr;

        const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
        await logAudit(ctx, {
          action: 'report.expiring_link_created',
          entityType: 'report',
          entityId: id,
          details: { report_code: rpt.report_code, expires_in_hours: seconds / 3600 },
        });
        return res.status(200).json({ url: u.signedUrl, expiresAt });
      }

      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Only Owners, Admins, and Inspectors can publish reports.' });
      }
      const {
        client_id,
        building_id,
        fire_door_id,
        inspection_id,
        report_type,
        title,
        pdfBase64,
        shared_with_client = false,
        metadata = {},
      } = req.body;

      if (!client_id || !report_type || !title || !pdfBase64) {
        return res.status(400).json({ error: 'Client, report type, title, and generated PDF payload are required.' });
      }

      const buffer = Buffer.from(pdfBase64, 'base64');
      const reportCode = `RPT-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      const storagePath = `${orgId}/reports/${reportCode}.pdf`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
      if (upErr) throw upErr;

      const shareToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

      const { data: report, error: dbErr } = await supabase
        .from('reports')
        .insert({
          organization_id: orgId,
          client_id,
          building_id: building_id || null,
          fire_door_id: fire_door_id || null,
          inspection_id: inspection_id || null,
          report_code: reportCode,
          report_type,
          title,
          storage_path: storagePath,
          share_token: shareToken,
          shared_with_client: Boolean(shared_with_client),
          generated_by_name: ctx.profile?.full_name || ctx.user.email,
          metadata,
        })
        .select()
        .single();
      if (dbErr) throw dbErr;

      const { data: u } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);

      await logAudit(ctx, {
        action: 'report.generated',
        entityType: 'report',
        entityId: report.id,
        details: { reportCode, report_type, shared_with_client },
      });

      if (shared_with_client) {
        const { data: client } = await supabase.from('clients').select('contact_email, name').eq('id', client_id).maybeSingle();
        await dispatchNotification({
          organizationId: orgId,
          recipientEmail: client?.contact_email || null,
          eventType: 'report_delivered',
          dedupeKey: `rpt-deliver-${report.id}`,
          title: `Report Available: ${title}`,
          message: `A new ${report_type} PDF package (${reportCode}) is ready for secure download in your DoorProof AI Client Portal.`,
          linkPath: '/portal',
        });
      }

      return res.status(201).json({ ...report, download_url: u?.signedUrl || null });
    }

    if (req.method === 'PUT') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can publish or revoke client report sharing.' });
      }
      const { id, shared_with_client } = req.body;
      const { data: report, error } = await supabase
        .from('reports')
        .update({ shared_with_client: Boolean(shared_with_client) })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();
      if (error) throw error;

      if (shared_with_client) {
        const { data: client } = await supabase.from('clients').select('contact_email').eq('id', report.client_id).maybeSingle();
        await dispatchNotification({
          organizationId: orgId,
          recipientEmail: client?.contact_email || null,
          eventType: 'report_delivered',
          dedupeKey: `rpt-share-${report.id}`,
          title: `Report Shared: ${report.title}`,
          message: `Report ${report.report_code} (${report.report_type}) has been published to the Client Portal for secure download.`,
          linkPath: '/portal',
        });
      }

      await logAudit(ctx, {
        action: shared_with_client ? 'report.shared_with_client' : 'report.unshared',
        entityType: 'report',
        entityId: id,
        details: { report_code: report.report_code },
      });

      return res.status(200).json(report);
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('[api/reports] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
