import supabase from './db-client.js';
import { setCors, requireAuth, hasRole, ROLES, logAudit } from './_auth.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const entity = req.query.entity || req.body?.entity;
  const orgId = ctx.organizationId;
  const isClient = ctx.member.role === ROLES.CLIENT;
  const clientScopeId = isClient ? ctx.member.client_id : null;

  if (isClient && !clientScopeId) {
    return res.status(403).json({ error: 'Client portal account is missing a client assignment.' });
  }

  try {
    // ================= GLOBAL SEARCH (Clients, Buildings, Doors, QR Tokens, Deficiencies) =================
    if (entity === 'global_search' && req.method === 'GET') {
      const q = String(req.query.q || '').trim().toLowerCase();
      if (!q) return res.status(200).json({ clients: [], buildings: [], doors: [], deficiencies: [] });

      const scope = (query) => {
        let s = query.eq('organization_id', orgId);
        if (isClient) s = s.eq('client_id', clientScopeId);
        return s;
      };

      const [cRes, bRes, dRes, defRes] = await Promise.all([
        isClient
          ? supabase.from('clients').select('id, name, company_code, contact_name').eq('organization_id', orgId).eq('id', clientScopeId)
          : supabase.from('clients').select('id, name, company_code, contact_name').eq('organization_id', orgId).eq('archived', false),
        scope(supabase.from('buildings').select('id, name, building_code, address, city').eq('archived', false)),
        scope(supabase.from('fire_doors').select('id, door_code, room_location, floor, status, qr_token, building_id').eq('archived', false)),
        scope(supabase.from('deficiencies').select('id, deficiency_code, title, category, severity, status, fire_door_id')),
      ]);

      const bMap = Object.fromEntries((bRes.data || []).map((b) => [b.id, b.name]));

      return res.status(200).json({
        clients: (cRes.data || [])
          .filter((c) => `${c.name} ${c.company_code || ''} ${c.contact_name || ''}`.toLowerCase().includes(q))
          .slice(0, 6),
        buildings: (bRes.data || [])
          .filter((b) => `${b.name} ${b.building_code || ''} ${b.address || ''} ${b.city || ''}`.toLowerCase().includes(q))
          .slice(0, 6),
        doors: (dRes.data || [])
          .filter((d) => `${d.door_code} ${d.room_location || ''} ${d.qr_token || ''} ${d.floor || ''}`.toLowerCase().includes(q))
          .slice(0, 8)
          .map((d) => ({ ...d, building_name: bMap[d.building_id] || '' })),
        deficiencies: (defRes.data || [])
          .filter((df) => `${df.deficiency_code} ${df.title} ${df.category}`.toLowerCase().includes(q))
          .slice(0, 6),
      });
    }

    // ================= BULK ACTIONS & CSV IMPORT (Doors & Buildings) =================
    if (entity === 'doors_bulk' && req.method === 'POST') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Only Owners, Admins, and Inspectors can run bulk door operations.' });
      }
      const { operation, ids = [], status, next_inspection_due, rows = [], building_id } = req.body;

      if (operation === 'import_csv') {
        if (!building_id || !Array.isArray(rows) || rows.length === 0) {
          return res.status(400).json({ error: 'Select a target building and supply at least one valid CSV row.' });
        }
        const { data: bld } = await supabase
          .from('buildings')
          .select('id, client_id')
          .eq('id', building_id)
          .eq('organization_id', orgId)
          .single();
        if (!bld) return res.status(404).json({ error: 'Target building not found.' });

        const insertRows = rows.slice(0, 200).map((r) => {
          const code = (r.door_code || `FD-${Math.floor(1000 + Math.random() * 9000)}`).trim();
          return {
            organization_id: orgId,
            client_id: bld.client_id,
            building_id: bld.id,
            door_code: code,
            floor: r.floor || 'Floor 1',
            room_location: (r.room_location || 'Main Corridor').trim(),
            door_reference: r.door_reference || null,
            manufacturer: r.manufacturer || 'Steelcraft',
            door_type: r.door_type || 'Hollow Metal',
            fire_rating: r.fire_rating || '90-Min',
            frame_material: r.frame_material || 'Hollow Metal Steel',
            next_inspection_due: r.next_inspection_due || null,
            status: 'Needs Inspection',
            qr_token: `DP-${orgId.slice(0, 6).toUpperCase()}-${code}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            archived: false,
          };
        });

        const { data, error } = await supabase.from('fire_doors').insert(insertRows).select();
        if (error) throw error;

        await logAudit(ctx, {
          action: 'fire_door.csv_imported',
          entityType: 'fire_door',
          details: { building_id, imported_count: data.length },
        });
        return res.status(201).json({ imported: data.length, doors: data });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Select at least one fire door.' });
      }

      const patch = {};
      if (operation === 'update_status' && status) patch.status = status;
      else if (operation === 'schedule_due' && next_inspection_due) patch.next_inspection_due = next_inspection_due;
      else if (operation === 'archive') patch.archived = true;
      else return res.status(400).json({ error: 'Unsupported bulk door operation.' });

      const { data, error } = await supabase
        .from('fire_doors')
        .update(patch)
        .in('id', ids)
        .eq('organization_id', orgId)
        .select('id');
      if (error) throw error;

      await logAudit(ctx, {
        action: `fire_door.bulk_${operation}`,
        entityType: 'fire_door',
        details: { count: data.length, patch },
      });
      return res.status(200).json({ updated: data.length });
    }

    if (entity === 'buildings_bulk' && req.method === 'POST') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can import buildings.' });
      }
      const { client_id, rows = [] } = req.body;
      if (!client_id || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'Select a client and provide valid CSV rows.' });
      }
      const insertRows = rows.slice(0, 100).map((r) => ({
        organization_id: orgId,
        client_id,
        name: (r.name || 'Unnamed Facility').trim(),
        building_code: r.building_code || `BLD-${Math.floor(100 + Math.random() * 900)}`,
        address: (r.address || 'Address Pending').trim(),
        city: r.city || null,
        state: r.state || null,
        zip: r.zip || null,
        building_type: r.building_type || 'Commercial Office',
        total_floors: Number(r.total_floors) || 1,
        contact_name: r.contact_name || null,
        contact_phone: r.contact_phone || null,
        archived: false,
      }));
      const { data, error } = await supabase.from('buildings').insert(insertRows).select();
      if (error) throw error;
      await logAudit(ctx, { action: 'building.csv_imported', entityType: 'building', details: { count: data.length } });
      return res.status(201).json({ imported: data.length, buildings: data });
    }

    // ================= CLIENTS =================
    if (entity === 'clients') {
      if (req.method === 'GET') {
        let q = supabase
          .from('clients')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });

        if (isClient) q = q.eq('id', clientScopeId);
        if (req.query.include_archived !== 'true') q = q.eq('archived', false);

        const { data: clients, error } = await q;
        if (error) throw error;

        const [bRes, dRes, defRes] = await Promise.all([
          supabase.from('buildings').select('id, client_id').eq('organization_id', orgId).eq('archived', false),
          supabase.from('fire_doors').select('id, client_id').eq('organization_id', orgId).eq('archived', false),
          supabase.from('deficiencies').select('id, client_id, status').eq('organization_id', orgId),
        ]);

        const enriched = (clients || []).map((c) => ({
          ...c,
          building_count: (bRes.data || []).filter((b) => b.client_id === c.id).length,
          door_count: (dRes.data || []).filter((d) => d.client_id === c.id).length,
          open_deficiency_count: (defRes.data || []).filter(
            (df) => df.client_id === c.id && !['Verified', 'Closed'].includes(df.status)
          ).length,
        }));

        return res.status(200).json(enriched);
      }

      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can create or modify clients.' });
      }

      if (req.method === 'POST') {
        const { name, company_code, contact_name, contact_email, contact_phone, billing_address, service_tier, notes } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Client name is required.' });

        const code = company_code?.trim() || `CL-${Math.floor(1000 + Math.random() * 9000)}`;
        const { data, error } = await supabase
          .from('clients')
          .insert({
            organization_id: orgId,
            name: name.trim(),
            company_code: code,
            contact_name: contact_name || null,
            contact_email: contact_email || null,
            contact_phone: contact_phone || null,
            billing_address: billing_address || null,
            service_tier: service_tier || 'Annual Inspection',
            notes: notes || null,
            archived: false,
          })
          .select()
          .single();
        if (error) throw error;

        await logAudit(ctx, { action: 'client.created', entityType: 'client', entityId: data.id, details: { name: data.name } });
        return res.status(201).json(data);
      }

      if (req.method === 'PUT') {
        const { id, name, company_code, contact_name, contact_email, contact_phone, billing_address, service_tier, notes, archived } = req.body;
        if (!id) return res.status(400).json({ error: 'Client ID is required.' });

        const patch = { updated_at: new Date().toISOString() };
        if (name !== undefined) patch.name = name.trim();
        if (company_code !== undefined) patch.company_code = company_code;
        if (contact_name !== undefined) patch.contact_name = contact_name;
        if (contact_email !== undefined) patch.contact_email = contact_email;
        if (contact_phone !== undefined) patch.contact_phone = contact_phone;
        if (billing_address !== undefined) patch.billing_address = billing_address;
        if (service_tier !== undefined) patch.service_tier = service_tier;
        if (notes !== undefined) patch.notes = notes;
        if (archived !== undefined) patch.archived = Boolean(archived);

        const { data, error } = await supabase
          .from('clients')
          .update(patch)
          .eq('id', id)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (error) throw error;

        await logAudit(ctx, { action: archived ? 'client.archived' : 'client.updated', entityType: 'client', entityId: id, details: patch });
        return res.status(200).json(data);
      }
    }

    // ================= BUILDINGS =================
    if (entity === 'buildings') {
      if (req.method === 'GET') {
        let q = supabase
          .from('buildings')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false });

        if (isClient) q = q.eq('client_id', clientScopeId);
        else if (req.query.client_id) q = q.eq('client_id', req.query.client_id);
        if (req.query.include_archived !== 'true') q = q.eq('archived', false);

        const { data: buildings, error } = await q;
        if (error) throw error;

        const [cRes, fRes, dRes, defRes, insRes] = await Promise.all([
          supabase.from('clients').select('id, name').eq('organization_id', orgId),
          supabase.from('floors_or_areas').select('*').eq('organization_id', orgId).order('floor_number', { ascending: true }),
          supabase.from('fire_doors').select('id, building_id, status').eq('organization_id', orgId).eq('archived', false),
          supabase.from('deficiencies').select('id, building_id, status').eq('organization_id', orgId),
          supabase.from('inspections').select('id, building_id, status, completed_at, scheduled_date').eq('organization_id', orgId),
        ]);

        const clientMap = Object.fromEntries((cRes.data || []).map((c) => [c.id, c.name]));
        const enriched = (buildings || []).map((b) => {
          const bDoors = (dRes.data || []).filter((d) => d.building_id === b.id);
          const bDefs = (defRes.data || []).filter((df) => df.building_id === b.id && !['Verified', 'Closed'].includes(df.status));
          const bIns = (insRes.data || []).filter((i) => i.building_id === b.id);
          return {
            ...b,
            client_name: clientMap[b.client_id] || 'Unknown Client',
            floors: (fRes.data || []).filter((f) => f.building_id === b.id),
            door_count: bDoors.length,
            failed_door_count: bDoors.filter((d) => ['Deficient', 'In Remediation'].includes(d.status)).length,
            open_deficiency_count: bDefs.length,
            inspection_count: bIns.length,
          };
        });

        return res.status(200).json(enriched);
      }

      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can manage buildings.' });
      }

      if (req.method === 'POST') {
        const { client_id, name, building_code, address, city, state, zip, building_type, total_floors, contact_name, contact_phone, contact_email, notes } = req.body;
        if (!client_id || !name?.trim() || !address?.trim()) {
          return res.status(400).json({ error: 'Client, building name, and street address are required.' });
        }

        const { data, error } = await supabase
          .from('buildings')
          .insert({
            organization_id: orgId,
            client_id,
            name: name.trim(),
            building_code: building_code?.trim() || `BLD-${Math.floor(100 + Math.random() * 900)}`,
            address: address.trim(),
            city: city || null,
            state: state || null,
            zip: zip || null,
            building_type: building_type || 'Commercial Office',
            total_floors: Number(total_floors) || 1,
            contact_name: contact_name || null,
            contact_phone: contact_phone || null,
            contact_email: contact_email || null,
            notes: notes || null,
            archived: false,
          })
          .select()
          .single();
        if (error) throw error;

        await logAudit(ctx, { action: 'building.created', entityType: 'building', entityId: data.id, details: { name: data.name, client_id } });
        return res.status(201).json(data);
      }

      if (req.method === 'PUT') {
        const { id, name, building_code, address, city, state, zip, building_type, total_floors, contact_name, contact_phone, contact_email, notes, archived } = req.body;
        if (!id) return res.status(400).json({ error: 'Building ID is required.' });

        const patch = {};
        if (name !== undefined) patch.name = name.trim();
        if (building_code !== undefined) patch.building_code = building_code;
        if (address !== undefined) patch.address = address;
        if (city !== undefined) patch.city = city;
        if (state !== undefined) patch.state = state;
        if (zip !== undefined) patch.zip = zip;
        if (building_type !== undefined) patch.building_type = building_type;
        if (total_floors !== undefined) patch.total_floors = Number(total_floors) || 1;
        if (contact_name !== undefined) patch.contact_name = contact_name;
        if (contact_phone !== undefined) patch.contact_phone = contact_phone;
        if (contact_email !== undefined) patch.contact_email = contact_email;
        if (notes !== undefined) patch.notes = notes;
        if (archived !== undefined) patch.archived = Boolean(archived);

        const { data, error } = await supabase
          .from('buildings')
          .update(patch)
          .eq('id', id)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (error) throw error;

        await logAudit(ctx, { action: archived ? 'building.archived' : 'building.updated', entityType: 'building', entityId: id, details: patch });
        return res.status(200).json(data);
      }
    }

    // ================= FLOORS / AREAS =================
    if (entity === 'floors') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Insufficient permissions to manage floors/areas.' });
      }
      if (req.method === 'POST') {
        const { building_id, name, floor_number, area_type, notes } = req.body;
        if (!building_id || !name?.trim()) {
          return res.status(400).json({ error: 'Building and area name are required.' });
        }
        const { data, error } = await supabase
          .from('floors_or_areas')
          .insert({
            organization_id: orgId,
            building_id,
            name: name.trim(),
            floor_number: floor_number || '1',
            area_type: area_type || 'Corridor',
            notes: notes || null,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }
      if (req.method === 'DELETE') {
        const { id } = req.body;
        const { error } = await supabase
          .from('floors_or_areas')
          .delete()
          .eq('id', id)
          .eq('organization_id', orgId);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
    }

    // ================= FIRE DOORS =================
    if (entity === 'doors') {
      if (req.method === 'GET') {
        let q = supabase
          .from('fire_doors')
          .select('*')
          .eq('organization_id', orgId)
          .order('door_code', { ascending: true });

        if (isClient) q = q.eq('client_id', clientScopeId);
        else if (req.query.client_id) q = q.eq('client_id', req.query.client_id);
        if (req.query.building_id) q = q.eq('building_id', req.query.building_id);
        if (req.query.status) q = q.eq('status', req.query.status);
        if (req.query.include_archived !== 'true') q = q.eq('archived', false);

        const { data: doors, error } = await q;
        if (error) throw error;

        const [cRes, bRes, defRes] = await Promise.all([
          supabase.from('clients').select('id, name').eq('organization_id', orgId),
          supabase.from('buildings').select('id, name, address').eq('organization_id', orgId),
          supabase.from('deficiencies').select('id, fire_door_id, status').eq('organization_id', orgId),
        ]);

        const clientMap = Object.fromEntries((cRes.data || []).map((c) => [c.id, c.name]));
        const buildingMap = Object.fromEntries((bRes.data || []).map((b) => [b.id, b]));

        const enriched = (doors || []).map((d) => ({
          ...d,
          client_name: clientMap[d.client_id] || 'Unknown Client',
          building_name: buildingMap[d.building_id]?.name || 'Unknown Building',
          building_address: buildingMap[d.building_id]?.address || '',
          open_deficiencies: (defRes.data || []).filter(
            (df) => df.fire_door_id === d.id && !['Verified', 'Closed'].includes(df.status)
          ).length,
        }));

        return res.status(200).json(enriched);
      }

      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN, ROLES.INSPECTOR])) {
        return res.status(403).json({ error: 'Only Owners, Admins, and Inspectors can register or edit fire doors.' });
      }

      if (req.method === 'POST') {
        const {
          building_id,
          floor_area_id,
          door_code,
          floor,
          room_location,
          door_reference,
          manufacturer,
          door_type,
          fire_rating,
          frame_material,
          installation_date,
          next_inspection_due,
          notes,
        } = req.body;

        if (!building_id || !room_location?.trim()) {
          return res.status(400).json({ error: 'Building and room/location are required.' });
        }

        const { data: building, error: bErr } = await supabase
          .from('buildings')
          .select('id, client_id')
          .eq('id', building_id)
          .eq('organization_id', orgId)
          .single();
        if (bErr || !building) return res.status(404).json({ error: 'Building not found in organization.' });

        const [subRes, countRes] = await Promise.all([
          supabase.from('subscriptions').select('max_doors').eq('organization_id', orgId).maybeSingle(),
          supabase
            .from('fire_doors')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('archived', false),
        ]);
        const maxDoors = subRes.data?.max_doors || 500;
        if ((countRes.count || 0) >= maxDoors) {
          return res.status(403).json({
            error: `Plan limit reached (${maxDoors} active fire doors). Upgrade subscription to add more doors.`,
          });
        }

        const finalDoorCode = door_code?.trim() || `FD-${Math.floor(1000 + Math.random() * 9000)}`;
        const qrToken = `DP-${orgId.slice(0, 6).toUpperCase()}-${finalDoorCode}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

        const { data, error } = await supabase
          .from('fire_doors')
          .insert({
            organization_id: orgId,
            client_id: building.client_id,
            building_id,
            floor_area_id: floor_area_id || null,
            door_code: finalDoorCode,
            floor: floor || 'Floor 1',
            room_location: room_location.trim(),
            door_reference: door_reference || null,
            manufacturer: manufacturer || 'Steelcraft',
            door_type: door_type || 'Hollow Metal',
            fire_rating: fire_rating || '90-Min',
            frame_material: frame_material || 'Hollow Metal Steel',
            installation_date: installation_date || null,
            next_inspection_due: next_inspection_due || null,
            status: 'Needs Inspection',
            qr_token: qrToken,
            notes: notes || null,
            archived: false,
          })
          .select()
          .single();
        if (error) throw error;

        await logAudit(ctx, {
          action: 'fire_door.registered',
          entityType: 'fire_door',
          entityId: data.id,
          details: { door_code: data.door_code, building_id },
        });
        return res.status(201).json(data);
      }

      if (req.method === 'PUT') {
        const {
          id,
          door_code,
          floor,
          room_location,
          door_reference,
          manufacturer,
          door_type,
          fire_rating,
          frame_material,
          installation_date,
          next_inspection_due,
          status,
          notes,
          archived,
        } = req.body;
        if (!id) return res.status(400).json({ error: 'Door ID is required.' });

        const patch = {};
        if (door_code !== undefined) patch.door_code = door_code.trim();
        if (floor !== undefined) patch.floor = floor;
        if (room_location !== undefined) patch.room_location = room_location;
        if (door_reference !== undefined) patch.door_reference = door_reference;
        if (manufacturer !== undefined) patch.manufacturer = manufacturer;
        if (door_type !== undefined) patch.door_type = door_type;
        if (fire_rating !== undefined) patch.fire_rating = fire_rating;
        if (frame_material !== undefined) patch.frame_material = frame_material;
        if (installation_date !== undefined) patch.installation_date = installation_date;
        if (next_inspection_due !== undefined) patch.next_inspection_due = next_inspection_due;
        if (status !== undefined) patch.status = status;
        if (notes !== undefined) patch.notes = notes;
        if (archived !== undefined) patch.archived = Boolean(archived);

        const { data, error } = await supabase
          .from('fire_doors')
          .update(patch)
          .eq('id', id)
          .eq('organization_id', orgId)
          .select()
          .single();
        if (error) throw error;

        await logAudit(ctx, { action: 'fire_door.updated', entityType: 'fire_door', entityId: id, details: patch });
        return res.status(200).json(data);
      }
    }

    return res.status(400).json({ error: 'Invalid entity or HTTP method.' });
  } catch (err) {
    console.error('[api/portfolio] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
