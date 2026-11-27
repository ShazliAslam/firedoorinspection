import supabase from './db-client.js';
import { setCors, requireAuth, hasRole, ROLES, logAudit, dispatchNotification } from './_auth.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const orgId = ctx.organizationId;
  const isClient = ctx.member.role === ROLES.CLIENT;
  const clientScopeId = isClient ? ctx.member.client_id : null;

  try {
    // GET: list inspections OR get single inspection with full checklist items & evidence
    if (req.method === 'GET') {
      const inspectionId = req.query.id;

      if (inspectionId) {
        let q = supabase
          .from('inspections')
          .select('*')
          .eq('id', inspectionId)
          .eq('organization_id', orgId);
        if (isClient) q = q.eq('client_id', clientScopeId);
        const { data: inspection, error } = await q.single();
        if (error || !inspection) return res.status(404).json({ error: 'Inspection not found.' });

        const [clientRes, bldRes, itemsRes, doorsRes, evRes, defsRes] = await Promise.all([
          supabase.from('clients').select('id, name').eq('id', inspection.client_id).single(),
          supabase.from('buildings').select('id, name, address').eq('id', inspection.building_id).single(),
          supabase
            .from('inspection_items')
            .select('*')
            .eq('inspection_id', inspectionId)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: true }),
          supabase
            .from('fire_doors')
            .select('*')
            .in('id', inspection.door_ids && inspection.door_ids.length ? inspection.door_ids : ['00000000-0000-0000-0000-000000000000']),
          supabase
            .from('evidence_files')
            .select('*')
            .eq('inspection_id', inspectionId)
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false }),
          supabase
            .from('deficiencies')
            .select('id, deficiency_code, fire_door_id, inspection_item_id, category, title, severity, status')
            .eq('inspection_id', inspectionId)
            .eq('organization_id', orgId),
        ]);

        return res.status(200).json({
          ...inspection,
          client_name: clientRes.data?.name || '',
          building_name: bldRes.data?.name || '',
          building_address: bldRes.data?.address || '',
          doors: doorsRes.data || [],
          items: itemsRes.data || [],
          evidence: evRes.data || [],
          deficiencies: defsRes.data || [],
        });
      }

      // List inspections
      let q = supabase
        .from('inspections')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (isClient) q = q.eq('client_id', clientScopeId);
      else if (req.query.client_id) q = q.eq('client_id', req.query.client_id);
      if (req.query.building_id) q = q.eq('building_id', req.query.building_id);
      if (req.query.status) q = q.eq('status', req.query.status);

      const { data: inspections, error } = await q;
      if (error) throw error;

      const [cRes, bRes, itemsRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('organization_id', orgId),
        supabase.from('buildings').select('id, name, address').eq('organization_id', orgId),
        supabase.from('inspection_items').select('inspection_id, result').eq('organization_id', orgId),
      ]);

      const cMap = Object.fromEntries((cRes.data || []).map((c) => [c.id, c.name]));
      const bMap = Object.fromEntries((bRes.data || []).map((b) => [b.id, b]));

      const enriched = (inspections || []).map((ins) => {
        const insItems = (itemsRes.data || []).filter((it) => it.inspection_id === ins.id);
        return {
          ...ins,
          client_name: cMap[ins.client_id] || 'Unknown Client',
          building_name: bMap[ins.building_id]?.name || 'Unknown Building',
          building_address: bMap[ins.building_id]?.address || '',
          door_count: Array.isArray(ins.door_ids) ? ins.door_ids.length : 0,
          total_checks: insItems.length,
          pass_count: insItems.filter((i) => i.result === 'Pass').length,
          fail_count: insItems.filter((i) => i.result === 'Fail').length,
          na_count: insItems.filter((i) => i.result === 'N/A').length,
        };
      });

      return res.status(200).json(enriched);
    }

    // POST: Create new inspection and hydrate checklist items from template for every selected door
    if (req.method === 'POST') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Only Owners, Admins, and Inspectors can create inspections.' });
      }

      const { building_id, template_id, title, inspector_id, scheduled_date, door_ids = [], summary_notes } = req.body;
      if (!building_id || !Array.isArray(door_ids) || door_ids.length === 0) {
        return res.status(400).json({ error: 'Select a building and at least one fire door.' });
      }

      const { data: building } = await supabase
        .from('buildings')
        .select('id, client_id, name')
        .eq('id', building_id)
        .eq('organization_id', orgId)
        .single();
      if (!building) return res.status(404).json({ error: 'Building not found.' });

      // Resolve inspector details
      let inspectorName = ctx.profile?.full_name || ctx.user.email;
      let inspectorEmail = ctx.user.email;
      let resolvedInspectorId = inspector_id || ctx.user.id;
      if (inspector_id) {
        const { data: mem } = await supabase
          .from('organization_members')
          .select('user_id, full_name, email')
          .eq('organization_id', orgId)
          .or(`id.eq.${inspector_id},user_id.eq.${inspector_id}`)
          .maybeSingle();
        if (mem) {
          inspectorName = mem.full_name || mem.email;
          inspectorEmail = mem.email;
          resolvedInspectorId = mem.user_id || inspector_id;
        }
      }

      // Resolve template & items
      let activeTemplateId = template_id;
      if (!activeTemplateId) {
        const { data: defTpl } = await supabase
          .from('inspection_templates')
          .select('id')
          .eq('organization_id', orgId)
          .order('is_default', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeTemplateId = defTpl?.id || null;
      }

      let templateItems = [];
      if (activeTemplateId) {
        const { data: tItems } = await supabase
          .from('inspection_template_items')
          .select('*')
          .eq('template_id', activeTemplateId)
          .order('sort_order', { ascending: true });
        templateItems = tItems || [];
      }

      const code = `INS-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}`;
      const { data: inspection, error } = await supabase
        .from('inspections')
        .insert({
          organization_id: orgId,
          client_id: building.client_id,
          building_id,
          template_id: activeTemplateId,
          inspection_code: code,
          title: title?.trim() || `${building.name} Fire Door Inspection`,
          inspector_id: resolvedInspectorId,
          inspector_name: inspectorName,
          scheduled_date: scheduled_date || new Date().toISOString().slice(0, 10),
          status: 'Draft',
          door_ids,
          summary_notes: summary_notes || '',
          reviewer_disclaimer_accepted: false,
        })
        .select()
        .single();
      if (error) throw error;

      // Create inspection_items for every selected door x template item
      if (templateItems.length > 0) {
        const itemRows = [];
        for (const doorId of door_ids) {
          for (const tItem of templateItems) {
            itemRows.push({
              organization_id: orgId,
              inspection_id: inspection.id,
              fire_door_id: doorId,
              template_item_id: tItem.id,
              category: tItem.category,
              item_label: tItem.label,
              result: 'Pending',
              observation: '',
              severity_suggested: 'Medium',
              deficiency_created: false,
            });
          }
        }
        if (itemRows.length > 0) {
          const { error: itemErr } = await supabase.from('inspection_items').insert(itemRows);
          if (itemErr) throw itemErr;
        }
      }

      await logAudit(ctx, {
        action: 'inspection.created',
        entityType: 'inspection',
        entityId: inspection.id,
        details: { code, building: building.name, doors: door_ids.length, inspectorName },
      });

      await dispatchNotification({
        organizationId: orgId,
        recipientUserId: resolvedInspectorId,
        recipientEmail: inspectorEmail,
        eventType: 'inspection_assigned',
        dedupeKey: `ins-assign-${inspection.id}`,
        title: `Inspection Assigned: ${code}`,
        message: `You have been assigned inspection "${inspection.title}" (${door_ids.length} doors) at ${building.name} scheduled for ${inspection.scheduled_date}.`,
        linkPath: '/inspections',
      });

      return res.status(201).json(inspection);
    }

    // PUT: Update inspection items, create deficiencies from failed items, or submit inspection
    if (req.method === 'PUT') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Insufficient permissions to update inspections.' });
      }

      const { action = 'save_progress', id, items = [], summary_notes, status, reviewer_disclaimer_accepted, auto_create_deficiencies = true } = req.body;
      if (!id) return res.status(400).json({ error: 'Inspection ID is required.' });

      const { data: inspection, error: insErr } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', id)
        .eq('organization_id', orgId)
        .single();
      if (insErr || !inspection) return res.status(404).json({ error: 'Inspection not found.' });

      // Update individual checklist items
      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          if (!item.id) continue;
          await supabase
            .from('inspection_items')
            .update({
              result: item.result,
              observation: item.observation ?? '',
              severity_suggested: item.severity_suggested || 'Medium',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)
            .eq('organization_id', orgId);
        }
      }

      // Action: convert a specific failed item (or all failed items on submit) to deficiencies
      let createdDeficiencies = [];
      if (action === 'create_deficiency_from_item') {
        const { item_id, severity = 'High', priority = 'P2', due_date, description } = req.body;
        const { data: item } = await supabase
          .from('inspection_items')
          .select('*')
          .eq('id', item_id)
          .eq('organization_id', orgId)
          .single();
        if (!item) return res.status(404).json({ error: 'Checklist item not found.' });

        const defCode = `DEF-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
        const { data: def, error: defErr } = await supabase
          .from('deficiencies')
          .insert({
            organization_id: orgId,
            client_id: inspection.client_id,
            building_id: inspection.building_id,
            fire_door_id: item.fire_door_id,
            inspection_id: inspection.id,
            inspection_item_id: item.id,
            deficiency_code: defCode,
            category: item.category,
            title: `${item.category}: ${item.item_label.slice(0, 75)}`,
            description: description || item.observation || `Failed checklist item during ${inspection.inspection_code}: ${item.item_label}`,
            severity,
            priority,
            status: 'Open',
            due_date: due_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            status_history: [
              {
                status: 'Open',
                changed_by: ctx.profile?.full_name || ctx.user.email,
                note: `Logged from inspection ${inspection.inspection_code}`,
                at: new Date().toISOString(),
              },
            ],
          })
          .select()
          .single();
        if (defErr) throw defErr;

        await supabase
          .from('inspection_items')
          .update({ deficiency_created: true, result: 'Fail' })
          .eq('id', item.id);

        await supabase
          .from('fire_doors')
          .update({ status: 'Deficient' })
          .eq('id', item.fire_door_id);

        await logAudit(ctx, {
          action: 'deficiency.created_from_inspection',
          entityType: 'deficiency',
          entityId: def.id,
          details: { code: defCode, inspection_code: inspection.inspection_code },
        });

        return res.status(201).json(def);
      }

      // Action: Submit Inspection
      if (action === 'submit') {
        if (!reviewer_disclaimer_accepted) {
          return res.status(400).json({
            error: 'A qualified professional must confirm inspection criteria review before submitting.',
          });
        }

        const { data: allItems = [] } = await supabase
          .from('inspection_items')
          .select('*')
          .eq('inspection_id', id)
          .eq('organization_id', orgId);

        // Auto-create deficiencies for any failed items not yet converted
        if (auto_create_deficiencies) {
          const failedWithoutDef = allItems.filter((i) => i.result === 'Fail' && !i.deficiency_created);
          for (const item of failedWithoutDef) {
            const defCode = `DEF-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
            const sev = item.severity_suggested || 'High';
            const prio = sev === 'Critical' ? 'P1' : sev === 'High' ? 'P2' : 'P3';
            const { data: def } = await supabase
              .from('deficiencies')
              .insert({
                organization_id: orgId,
                client_id: inspection.client_id,
                building_id: inspection.building_id,
                fire_door_id: item.fire_door_id,
                inspection_id: inspection.id,
                inspection_item_id: item.id,
                deficiency_code: defCode,
                category: item.category,
                title: `${item.category}: ${item.item_label.slice(0, 75)}`,
                description: item.observation || `Failed inspection item in ${inspection.inspection_code}: ${item.item_label}`,
                severity: sev,
                priority: prio,
                status: 'Open',
                due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
                status_history: [
                  {
                    status: 'Open',
                    changed_by: ctx.profile?.full_name || ctx.user.email,
                    note: `Auto-generated upon submission of ${inspection.inspection_code}`,
                    at: new Date().toISOString(),
                  },
                ],
              })
              .select()
              .single();
            if (def) {
              createdDeficiencies.push(def);
              await supabase.from('inspection_items').update({ deficiency_created: true }).eq('id', item.id);
            }
          }
        }

        // Update each inspected fire door's status & last_inspection_date
        const nowIso = new Date().toISOString();
        const nextYearDate = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
        for (const doorId of inspection.door_ids || []) {
          const doorItems = allItems.filter((i) => i.fire_door_id === doorId);
          const hasFail = doorItems.some((i) => i.result === 'Fail');
          await supabase
            .from('fire_doors')
            .update({
              last_inspection_date: nowIso,
              next_inspection_due: nextYearDate,
              status: hasFail ? 'Deficient' : 'Pass',
            })
            .eq('id', doorId)
            .eq('organization_id', orgId);
        }

        // Lock all inspection evidence as immutable
        await supabase
          .from('evidence_files')
          .update({ immutable: true })
          .eq('inspection_id', id)
          .eq('organization_id', orgId)
          .eq('evidence_type', 'inspection_original');

        const { data: updated, error: updErr } = await supabase
          .from('inspections')
          .update({
            status: 'Completed',
            completed_at: nowIso,
            summary_notes: summary_notes ?? inspection.summary_notes,
            reviewer_disclaimer_accepted: true,
            updated_at: nowIso,
          })
          .eq('id', id)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (updErr) throw updErr;

        await logAudit(ctx, {
          action: 'inspection.submitted',
          entityType: 'inspection',
          entityId: id,
          details: {
            code: inspection.inspection_code,
            new_deficiencies: createdDeficiencies.length,
          },
        });

        await dispatchNotification({
          organizationId: orgId,
          recipientEmail: ctx.user.email,
          eventType: 'inspection_completed',
          dedupeKey: `ins-complete-${id}`,
          title: `Inspection Completed: ${inspection.inspection_code}`,
          message: `Inspection "${inspection.title}" has been submitted with ${createdDeficiencies.length} newly logged deficiencies.`,
          linkPath: '/inspections',
        });

        return res.status(200).json({ inspection: updated, createdDeficiencies });
      }

      // Default: save draft / in-progress notes
      const nextStatus = status || (inspection.status === 'Draft' ? 'In Progress' : inspection.status);
      const { data: updated, error: updErr } = await supabase
        .from('inspections')
        .update({
          status: nextStatus,
          summary_notes: summary_notes ?? inspection.summary_notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();
      if (updErr) throw updErr;

      return res.status(200).json({ inspection: updated });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('[api/inspections] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
