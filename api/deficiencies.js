import supabase from './db-client.js';
import { setCors, requireAuth, hasRole, ROLES, logAudit, dispatchNotification } from './_auth.js';

const VALID_DEFICIENCY_STATUSES = [
  'Open',
  'Assigned',
  'In Progress',
  'Awaiting Parts',
  'Ready for Verification',
  'Verified',
  'Closed',
];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const orgId = ctx.organizationId;
  const isClient = ctx.member.role === ROLES.CLIENT;
  const clientScopeId = isClient ? ctx.member.client_id : null;
  const mode = req.query.mode || req.body?.mode || 'deficiencies';

  try {
    if (req.method === 'GET') {
      const [clientsRes, bldsRes, doorsRes, defsRes, remsRes, evRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('organization_id', orgId),
        supabase.from('buildings').select('id, name, address').eq('organization_id', orgId),
        supabase.from('fire_doors').select('id, door_code, floor, room_location, fire_rating').eq('organization_id', orgId),
        (() => {
          let q = supabase.from('deficiencies').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
          if (isClient) q = q.eq('client_id', clientScopeId);
          else if (req.query.client_id) q = q.eq('client_id', req.query.client_id);
          if (req.query.building_id) q = q.eq('building_id', req.query.building_id);
          if (req.query.severity) q = q.eq('severity', req.query.severity);
          if (req.query.status) q = q.eq('status', req.query.status);
          return q;
        })(),
        (() => {
          let q = supabase.from('remediation_tasks').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
          if (isClient) q = q.eq('client_id', clientScopeId);
          return q;
        })(),
        supabase.from('evidence_files').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      ]);

      const cMap = Object.fromEntries((clientsRes.data || []).map((c) => [c.id, c.name]));
      const bMap = Object.fromEntries((bldsRes.data || []).map((b) => [b.id, b]));
      const dMap = Object.fromEntries((doorsRes.data || []).map((d) => [d.id, d]));

      const deficiencies = (defsRes.data || []).map((def) => {
        const task = (remsRes.data || []).find((r) => r.deficiency_id === def.id) || null;
        const ev = (evRes.data || []).filter(
          (e) => e.deficiency_id === def.id || (task && e.remediation_task_id === task.id)
        );
        return {
          ...def,
          client_name: cMap[def.client_id] || 'Unknown Client',
          building_name: bMap[def.building_id]?.name || 'Unknown Building',
          door_code: dMap[def.fire_door_id]?.door_code || 'N/A',
          door_location: dMap[def.fire_door_id]
            ? `${dMap[def.fire_door_id].floor || ''} • ${dMap[def.fire_door_id].room_location || ''}`
            : '',
          remediation_task: task,
          evidence: isClient ? ev.filter((e) => e.approved_for_client) : ev,
        };
      });

      if (mode === 'remediations') {
        const defMap = Object.fromEntries(deficiencies.map((d) => [d.id, d]));
        const tasks = (remsRes.data || []).map((t) => ({
          ...t,
          deficiency: defMap[t.deficiency_id] || null,
          client_name: cMap[t.client_id] || 'Unknown Client',
          building_name: bMap[t.building_id]?.name || 'Unknown Building',
          door_code: dMap[t.fire_door_id]?.door_code || 'N/A',
          door_location: dMap[t.fire_door_id]?.room_location || '',
          evidence: (evRes.data || []).filter(
            (e) => e.remediation_task_id === t.id || e.deficiency_id === t.deficiency_id
          ),
        }));
        return res.status(200).json(tasks);
      }

      return res.status(200).json(deficiencies);
    }

    if (req.method === 'POST') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Only Owners, Admins, and Inspectors can log deficiencies.' });
      }
      const { fire_door_id, category, title, description, severity = 'Medium', priority = 'P2', due_date, assigned_technician_id } = req.body;
      if (!fire_door_id || !title?.trim() || !description?.trim()) {
        return res.status(400).json({ error: 'Fire door, title, and description are required.' });
      }

      const { data: door } = await supabase
        .from('fire_doors')
        .select('id, client_id, building_id, door_code')
        .eq('id', fire_door_id)
        .eq('organization_id', orgId)
        .single();
      if (!door) return res.status(404).json({ error: 'Fire door not found.' });

      let techName = null;
      let techEmail = null;
      let techUserId = null;
      if (assigned_technician_id) {
        const { data: mem } = await supabase
          .from('organization_members')
          .select('user_id, full_name, email')
          .eq('organization_id', orgId)
          .or(`id.eq.${assigned_technician_id},user_id.eq.${assigned_technician_id}`)
          .maybeSingle();
        if (mem) {
          techName = mem.full_name || mem.email;
          techEmail = mem.email;
          techUserId = mem.user_id || assigned_technician_id;
        }
      }

      const code = `DEF-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      const initialStatus = techName ? 'Assigned' : 'Open';
      const { data: def, error } = await supabase
        .from('deficiencies')
        .insert({
          organization_id: orgId,
          client_id: door.client_id,
          building_id: door.building_id,
          fire_door_id: door.id,
          deficiency_code: code,
          category: category || 'Other Observations',
          title: title.trim(),
          description: description.trim(),
          severity,
          priority,
          status: initialStatus,
          assigned_technician_id: techUserId,
          assigned_technician_name: techName,
          due_date: due_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          status_history: [
            {
              status: initialStatus,
              changed_by: ctx.profile?.full_name || ctx.user.email,
              note: 'Deficiency logged',
              at: new Date().toISOString(),
            },
          ],
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('fire_doors').update({ status: techName ? 'In Remediation' : 'Deficient' }).eq('id', door.id);

      if (techName) {
        await supabase.from('remediation_tasks').insert({
          organization_id: orgId,
          deficiency_id: def.id,
          fire_door_id: door.id,
          building_id: door.building_id,
          client_id: door.client_id,
          assigned_technician_id: techUserId,
          assigned_technician_name: techName,
          due_date: def.due_date,
          status: 'Assigned',
        });

        await dispatchNotification({
          organizationId: orgId,
          recipientUserId: techUserId,
          recipientEmail: techEmail,
          eventType: 'repair_assigned',
          dedupeKey: `rep-assign-${def.id}`,
          title: `Repair Assigned: ${code} (${door.door_code})`,
          message: `You have been assigned remediation for "${def.title}" on door ${door.door_code}. Due: ${def.due_date}.`,
          linkPath: '/remediation',
        });
      }

      await logAudit(ctx, { action: 'deficiency.created', entityType: 'deficiency', entityId: def.id, details: { code, door_code: door.door_code, severity } });
      return res.status(201).json(def);
    }

    if (req.method === 'PUT') {
      const { action = 'update', id, ids = [], status, priority, assigned_technician_id, due_date, resolution_notes, parts_needed, repair_notes, rejection_reason } = req.body;

      // BULK ACTION for deficiencies (assign technician / update priority / update due date)
      if (action === 'bulk_update') {
        if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
          return res.status(403).json({ error: 'Only Owners, Admins, and Inspectors can run bulk deficiency actions.' });
        }
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ error: 'Select at least one deficiency.' });
        }

        let techMem = null;
        if (assigned_technician_id) {
          const { data: mem } = await supabase
            .from('organization_members')
            .select('id, user_id, full_name, email')
            .eq('organization_id', orgId)
            .or(`id.eq.${assigned_technician_id},user_id.eq.${assigned_technician_id}`)
            .maybeSingle();
          techMem = mem;
        }

        const patch = { updated_at: new Date().toISOString() };
        if (priority) patch.priority = priority;
        if (due_date) patch.due_date = due_date;
        if (techMem) {
          patch.assigned_technician_id = techMem.user_id || techMem.id;
          patch.assigned_technician_name = techMem.full_name || techMem.email;
          patch.status = 'Assigned';
        }

        const { data: updatedRows, error: bErr } = await supabase
          .from('deficiencies')
          .update(patch)
          .in('id', ids)
          .eq('organization_id', orgId)
          .select();
        if (bErr) throw bErr;

        if (techMem) {
          for (const d of updatedRows || []) {
            const { data: ex } = await supabase.from('remediation_tasks').select('id').eq('deficiency_id', d.id).maybeSingle();
            if (ex) {
              await supabase.from('remediation_tasks').update({
                assigned_technician_id: patch.assigned_technician_id,
                assigned_technician_name: patch.assigned_technician_name,
                due_date: due_date || d.due_date,
                status: 'Assigned',
              }).eq('id', ex.id);
            } else {
              await supabase.from('remediation_tasks').insert({
                organization_id: orgId,
                deficiency_id: d.id,
                fire_door_id: d.fire_door_id,
                building_id: d.building_id,
                client_id: d.client_id,
                assigned_technician_id: patch.assigned_technician_id,
                assigned_technician_name: patch.assigned_technician_name,
                due_date: due_date || d.due_date,
                status: 'Assigned',
              });
            }
          }
        }

        await logAudit(ctx, {
          action: 'deficiency.bulk_updated',
          entityType: 'deficiency',
          details: { count: (updatedRows || []).length, priority, technician: techMem?.full_name || null },
        });
        return res.status(200).json({ updated: (updatedRows || []).length });
      }

      if (!id) return res.status(400).json({ error: 'Deficiency ID is required.' });

      const { data: def, error: defErr } = await supabase
        .from('deficiencies')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .single();
      if (defErr || !def) return res.status(404).json({ error: 'Deficiency not found.' });

      const actorName = ctx.profile?.full_name || ctx.user.email;
      const history = Array.isArray(def.status_history) ? [...def.status_history] : [];

      if (action === 'assign_technician') {
        if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
          return res.status(403).json({ error: 'Only Owners, Admins, or Inspectors can assign technicians.' });
        }
        if (!assigned_technician_id) return res.status(400).json({ error: 'Select a technician.' });

        const { data: mem } = await supabase
          .from('organization_members')
          .select('id, user_id, full_name, email')
          .eq('organization_id', orgId)
          .or(`id.eq.${assigned_technician_id},user_id.eq.${assigned_technician_id}`)
          .maybeSingle();
        if (!mem) return res.status(404).json({ error: 'Technician member not found.' });

        const techName = mem.full_name || mem.email;
        const techUid = mem.user_id || mem.id;
        const nextDue = due_date || def.due_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

        history.push({ status: 'Assigned', changed_by: actorName, note: `Assigned to ${techName}`, at: new Date().toISOString() });

        const { data: updatedDef, error: uErr } = await supabase
          .from('deficiencies')
          .update({
            assigned_technician_id: techUid,
            assigned_technician_name: techName,
            due_date: nextDue,
            status: 'Assigned',
            status_history: history,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();
        if (uErr) throw uErr;

        const { data: existingTask } = await supabase
          .from('remediation_tasks')
          .select('id')
          .eq('deficiency_id', id)
          .maybeSingle();

        if (existingTask) {
          await supabase
            .from('remediation_tasks')
            .update({
              assigned_technician_id: techUid,
              assigned_technician_name: techName,
              due_date: nextDue,
              status: 'Assigned',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingTask.id);
        } else {
          await supabase.from('remediation_tasks').insert({
            organization_id: orgId,
            deficiency_id: id,
            fire_door_id: def.fire_door_id,
            building_id: def.building_id,
            client_id: def.client_id,
            assigned_technician_id: techUid,
            assigned_technician_name: techName,
            due_date: nextDue,
            status: 'Assigned',
          });
        }

        await supabase.from('fire_doors').update({ status: 'In Remediation' }).eq('id', def.fire_door_id);

        await dispatchNotification({
          organizationId: orgId,
          recipientUserId: techUid,
          recipientEmail: mem.email,
          eventType: 'repair_assigned',
          dedupeKey: `rep-assign-${id}-${techUid}`,
          title: `Repair Assigned: ${def.deficiency_code}`,
          message: `You have been assigned repair "${def.title}" due ${nextDue}.`,
          linkPath: '/remediation',
        });

        await logAudit(ctx, { action: 'remediation.assigned', entityType: 'deficiency', entityId: id, details: { techName, nextDue } });
        return res.status(200).json(updatedDef);
      }

      if (action === 'update_remediation' || action === 'submit_for_verification') {
        if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR, ROLES.TECHNICIAN])) {
          return res.status(403).json({ error: 'Only authorized field staff can update remediation progress.' });
        }

        const isSubmitting = action === 'submit_for_verification';
        const nextDefStatus = isSubmitting
          ? 'Ready for Verification'
          : status && VALID_DEFICIENCY_STATUSES.includes(status)
          ? status
          : 'In Progress';
        const nextTaskStatus = isSubmitting
          ? 'Submitted for Verification'
          : nextDefStatus === 'Awaiting Parts'
          ? 'Awaiting Parts'
          : 'In Progress';

        history.push({
          status: nextDefStatus,
          changed_by: actorName,
          note: isSubmitting
            ? `Submitted repair for verification: ${repair_notes || resolution_notes || 'Work completed'}`
            : repair_notes || `Updated status to ${nextDefStatus}`,
          at: new Date().toISOString(),
        });

        const { data: updatedDef, error: uErr } = await supabase
          .from('deficiencies')
          .update({
            status: nextDefStatus,
            resolution_notes: repair_notes ?? resolution_notes ?? def.resolution_notes,
            status_history: history,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();
        if (uErr) throw uErr;

        const { data: existingTask } = await supabase
          .from('remediation_tasks')
          .select('id')
          .eq('deficiency_id', id)
          .maybeSingle();

        const taskPatch = {
          status: nextTaskStatus,
          parts_needed: parts_needed ?? undefined,
          repair_notes: repair_notes ?? resolution_notes ?? undefined,
          submitted_at: isSubmitting ? new Date().toISOString() : undefined,
          rejection_reason: isSubmitting ? null : undefined,
          updated_at: new Date().toISOString(),
        };

        if (existingTask) {
          await supabase.from('remediation_tasks').update(taskPatch).eq('id', existingTask.id);
        } else {
          await supabase.from('remediation_tasks').insert({
            organization_id: orgId,
            deficiency_id: id,
            fire_door_id: def.fire_door_id,
            building_id: def.building_id,
            client_id: def.client_id,
            assigned_technician_id: def.assigned_technician_id || ctx.user.id,
            assigned_technician_name: def.assigned_technician_name || actorName,
            due_date: def.due_date,
            ...taskPatch,
          });
        }

        if (isSubmitting) {
          await dispatchNotification({
            organizationId: orgId,
            eventType: 'verification_requested',
            dedupeKey: `verify-req-${id}-${Date.now().toString().slice(0, 8)}`,
            title: `Verification Requested: ${def.deficiency_code}`,
            message: `${actorName} submitted completed repair for "${def.title}" and requested supervisor/inspector verification.`,
            linkPath: '/remediation',
          });
        }

        await logAudit(ctx, {
          action: isSubmitting ? 'remediation.submitted_for_verification' : 'remediation.progress_updated',
          entityType: 'deficiency',
          entityId: id,
          details: { status: nextDefStatus, parts_needed },
        });
        return res.status(200).json(updatedDef);
      }

      if (action === 'verify_approve' || action === 'verify_reject') {
        if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
          return res.status(403).json({
            error: 'Only an authorized Inspector, Admin, or Owner can approve or reject completed repairs.',
          });
        }

        if (action === 'verify_reject') {
          if (!rejection_reason?.trim()) {
            return res.status(400).json({ error: 'A clear rejection reason is required so the technician can rework the repair.' });
          }
          history.push({
            status: 'In Progress',
            changed_by: actorName,
            note: `Verification rejected: ${rejection_reason.trim()}`,
            at: new Date().toISOString(),
          });

          const { data: updatedDef, error: uErr } = await supabase
            .from('deficiencies')
            .update({
              status: 'In Progress',
              status_history: history,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();
          if (uErr) throw uErr;

          await supabase
            .from('remediation_tasks')
            .update({
              status: 'Rejected',
              rejection_reason: rejection_reason.trim(),
              updated_at: new Date().toISOString(),
            })
            .eq('deficiency_id', id);

          await logAudit(ctx, {
            action: 'remediation.rejected',
            entityType: 'deficiency',
            entityId: id,
            details: { rejection_reason: rejection_reason.trim() },
          });
          return res.status(200).json(updatedDef);
        }

        const closeNow = Boolean(req.body.close_immediately);
        const finalStatus = closeNow ? 'Closed' : 'Verified';
        const nowIso = new Date().toISOString();

        history.push({
          status: finalStatus,
          changed_by: actorName,
          note: resolution_notes || 'Repair verified against before/after photographic evidence.',
          at: nowIso,
        });

        const { data: updatedDef, error: uErr } = await supabase
          .from('deficiencies')
          .update({
            status: finalStatus,
            verified_by: actorName,
            verified_at: nowIso,
            resolution_notes: resolution_notes || def.resolution_notes,
            status_history: history,
            updated_at: nowIso,
          })
          .eq('id', id)
          .select()
          .single();
        if (uErr) throw uErr;

        await supabase
          .from('remediation_tasks')
          .update({
            status: 'Verified',
            verified_by_name: actorName,
            verified_at: nowIso,
            rejection_reason: null,
            updated_at: nowIso,
          })
          .eq('deficiency_id', id);

        const { data: remainingOpen = [] } = await supabase
          .from('deficiencies')
          .select('id, status')
          .eq('fire_door_id', def.fire_door_id)
          .eq('organization_id', orgId);

        const stillOpen = remainingOpen.some((r) => !['Verified', 'Closed'].includes(r.status));
        if (!stillOpen) {
          await supabase.from('fire_doors').update({ status: 'Pass' }).eq('id', def.fire_door_id);
        }

        await logAudit(ctx, {
          action: 'remediation.verified',
          entityType: 'deficiency',
          entityId: id,
          details: { verified_by: actorName, finalStatus, doorRestoredToPass: !stillOpen },
        });
        return res.status(200).json(updatedDef);
      }

      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Insufficient permissions to edit deficiency details.' });
      }
      const patch = { updated_at: new Date().toISOString() };
      if (status && VALID_DEFICIENCY_STATUSES.includes(status) && status !== def.status) {
        patch.status = status;
        history.push({ status, changed_by: actorName, note: resolution_notes || `Status updated to ${status}`, at: new Date().toISOString() });
        patch.status_history = history;
      }
      if (due_date !== undefined) patch.due_date = due_date;
      if (resolution_notes !== undefined) patch.resolution_notes = resolution_notes;
      if (req.body.severity) patch.severity = req.body.severity;
      if (priority) patch.priority = priority;

      const { data: updatedDef, error: uErr } = await supabase
        .from('deficiencies')
        .update(patch)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();
      if (uErr) throw uErr;

      await logAudit(ctx, { action: 'deficiency.updated', entityType: 'deficiency', entityId: id, details: patch });
      return res.status(200).json(updatedDef);
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('[api/deficiencies] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
