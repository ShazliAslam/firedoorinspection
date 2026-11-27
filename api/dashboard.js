import supabase from './db-client.js';
import { setCors, requireAuth, ROLES } from './_auth.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  try {
    const orgId = ctx.organizationId;
    const isClient = ctx.member.role === ROLES.CLIENT;
    const clientFilterId = isClient ? ctx.member.client_id : null;
    const range = req.query.range || '6m'; // 30d | 90d | 6m | all

    if (isClient && !clientFilterId) {
      return res.status(403).json({ error: 'Client account is not assigned to a client portfolio.' });
    }

    const now = new Date();
    let cutoffIso = null;
    if (range === '30d') cutoffIso = new Date(now.getTime() - 30 * 86400000).toISOString();
    else if (range === '90d') cutoffIso = new Date(now.getTime() - 90 * 86400000).toISOString();
    else if (range === '6m') cutoffIso = new Date(now.getTime() - 180 * 86400000).toISOString();

    const scopeQuery = (q) => {
      let scoped = q.eq('organization_id', orgId);
      if (clientFilterId) scoped = scoped.eq('client_id', clientFilterId);
      return scoped;
    };

    const [
      clientsRes,
      buildingsRes,
      doorsRes,
      inspectionsRes,
      deficienciesRes,
      remediationsRes,
      reportsRes,
      auditRes,
      membersRes,
    ] = await Promise.all([
      isClient
        ? supabase.from('clients').select('id, name, archived').eq('organization_id', orgId).eq('id', clientFilterId)
        : supabase.from('clients').select('id, name, archived').eq('organization_id', orgId).eq('archived', false),
      scopeQuery(supabase.from('buildings').select('id, name, client_id, city, state, archived').eq('archived', false)),
      scopeQuery(supabase.from('fire_doors').select('id, door_code, building_id, status, next_inspection_due, last_inspection_date, archived').eq('archived', false)),
      scopeQuery(supabase.from('inspections').select('id, inspection_code, title, building_id, status, scheduled_date, completed_at, inspector_id, inspector_name, created_at')).order('created_at', { ascending: false }),
      scopeQuery(supabase.from('deficiencies').select('id, deficiency_code, title, category, severity, priority, status, due_date, assigned_technician_id, assigned_technician_name, building_id, fire_door_id, created_at')).order('created_at', { ascending: false }),
      scopeQuery(supabase.from('remediation_tasks').select('id, deficiency_id, status, due_date, assigned_technician_id, assigned_technician_name, verified_at, created_at')).order('created_at', { ascending: false }),
      isClient
        ? supabase.from('reports').select('id, title, report_type, created_at, shared_with_client').eq('organization_id', orgId).eq('client_id', clientFilterId).eq('shared_with_client', true)
        : supabase.from('reports').select('id, title, report_type, created_at, shared_with_client').eq('organization_id', orgId),
      isClient
        ? Promise.resolve({ data: [] })
        : supabase
            .from('audit_logs')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(20),
      isClient
        ? Promise.resolve({ data: [] })
        : supabase.from('organization_members').select('id, user_id, full_name, email, role, status').eq('organization_id', orgId).eq('status', 'active'),
    ]);

    const clients = clientsRes.data || [];
    const buildings = buildingsRes.data || [];
    const doors = doorsRes.data || [];
    const allInspections = inspectionsRes.data || [];
    const allDeficiencies = deficienciesRes.data || [];
    const allRemediations = remediationsRes.data || [];
    const reports = reportsRes.data || [];
    const auditLogs = auditRes.data || [];
    const members = membersRes.data || [];

    const inRange = (ts) => !cutoffIso || !ts || ts >= cutoffIso;
    const inspections = allInspections.filter((i) => inRange(i.completed_at || i.created_at));
    const deficiencies = allDeficiencies.filter((d) => inRange(d.created_at));
    const remediations = allRemediations.filter((r) => inRange(r.created_at));

    const todayStr = now.toISOString().slice(0, 10);
    const next30Str = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

    const openDeficiencies = allDeficiencies.filter((d) => !['Verified', 'Closed'].includes(d.status));
    const pendingRepairs = allRemediations.filter((r) => r.status !== 'Verified');
    const verifiedRepairs = remediations.filter((r) => r.status === 'Verified');
    const totalVerifiedAll = allRemediations.filter((r) => r.status === 'Verified').length;

    const overdueDeficiencies = openDeficiencies.filter((d) => d.due_date && d.due_date < todayStr);
    const overdueInspections = allInspections.filter(
      (i) => !['Submitted', 'Completed'].includes(i.status) && i.scheduled_date && i.scheduled_date < todayStr
    );
    const upcomingRecurringDoors = doors.filter(
      (d) => d.next_inspection_due && d.next_inspection_due >= todayStr && d.next_inspection_due <= next30Str
    );

    const inspectedDoors = doors.filter((d) => d.status !== 'Needs Inspection');
    const passRate = inspectedDoors.length
      ? Math.round((doors.filter((d) => d.status === 'Pass').length / inspectedDoors.length) * 100)
      : 0;
    const remediationCompletionRate = allRemediations.length
      ? Math.round((totalVerifiedAll / allRemediations.length) * 100)
      : 0;

    const kpis = {
      clientsCount: clients.length,
      buildingsCount: buildings.length,
      doorsCount: doors.length,
      completedInspections: inspections.filter((i) => ['Submitted', 'Completed'].includes(i.status)).length,
      failedDoors: doors.filter((d) => ['Deficient', 'In Remediation'].includes(d.status)).length,
      passedDoors: doors.filter((d) => d.status === 'Pass').length,
      openDeficiencies: openDeficiencies.length,
      pendingRepairs: pendingRepairs.length,
      verifiedRepairs: verifiedRepairs.length,
      overdueTasks: overdueDeficiencies.length + overdueInspections.length,
      reportsCount: reports.length,
      passRate,
      remediationCompletionRate,
      recurringDueSoon: upcomingRecurringDoors.length,
    };

    // Chart 1: Deficiencies by Category
    const categoryMap = {};
    deficiencies.forEach((d) => {
      const cat = d.category || 'Other';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    const deficienciesByCategory = Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Chart 2: Door Status Distribution
    const doorStatusCounts = ['Pass', 'Deficient', 'In Remediation', 'Needs Inspection'].map((status) => ({
      name: status,
      value: doors.filter((d) => d.status === status).length,
    }));

    // Chart 3: Severity Breakdown
    const severityCounts = ['Critical', 'High', 'Medium', 'Low'].map((severity) => ({
      severity,
      open: openDeficiencies.filter((d) => d.severity === severity).length,
      resolved: allDeficiencies.filter((d) => ['Verified', 'Closed'].includes(d.status) && d.severity === severity).length,
    }));

    // Chart 4: Monthly Activity Trend
    const monthCount = range === '30d' ? 2 : range === '90d' ? 4 : 6;
    const months = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const label = dt.toLocaleString('en-US', { month: 'short' });
      months.push({ key, label, inspections: 0, deficiencies: 0, verified: 0 });
    }
    allInspections.forEach((ins) => {
      const m = months.find((x) => (ins.completed_at || ins.created_at || '').startsWith(x.key));
      if (m) m.inspections += 1;
    });
    allDeficiencies.forEach((def) => {
      const m = months.find((x) => (def.created_at || '').startsWith(x.key));
      if (m) m.deficiencies += 1;
    });
    allRemediations.forEach((rem) => {
      if (rem.status === 'Verified') {
        const m = months.find((x) => (rem.verified_at || rem.created_at || '').startsWith(x.key));
        if (m) m.verified += 1;
      }
    });

    const buildingLookup = Object.fromEntries(buildings.map((b) => [b.id, b.name]));

    // Priority Tasks & Upcoming Inspections
    const upcomingTasks = [
      ...allInspections
        .filter((i) => !['Submitted', 'Completed'].includes(i.status))
        .map((i) => ({
          id: i.id,
          type: 'Inspection',
          code: i.inspection_code,
          title: i.title,
          building: buildingLookup[i.building_id] || 'Unknown Building',
          assignee: i.inspector_name || 'Unassigned',
          dueDate: i.scheduled_date || '',
          status: i.status,
          priority: 'P2',
          overdue: Boolean(i.scheduled_date && i.scheduled_date < todayStr),
          link: '/inspections',
        })),
      ...openDeficiencies.slice(0, 14).map((d) => ({
        id: d.id,
        type: 'Deficiency',
        code: d.deficiency_code,
        title: d.title,
        building: buildingLookup[d.building_id] || 'Unknown Building',
        assignee: d.assigned_technician_name || 'Unassigned',
        dueDate: d.due_date || '',
        status: d.status,
        severity: d.severity,
        priority: d.priority || 'P2',
        overdue: Boolean(d.due_date && d.due_date < todayStr),
        link: '/deficiencies',
      })),
    ]
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
      })
      .slice(0, 12);

    // Workload summary for inspectors & technicians
    const workload = members
      .filter((m) => ['owner', 'admin', 'inspector', 'technician'].includes(m.role))
      .map((m) => {
        const uid = m.user_id || m.id;
        return {
          id: m.id,
          name: m.full_name || m.email,
          role: m.role,
          activeInspections: allInspections.filter(
            (i) => (i.inspector_id === uid || i.inspector_name === m.full_name) && !['Submitted', 'Completed'].includes(i.status)
          ).length,
          completedInspections: allInspections.filter(
            (i) => (i.inspector_id === uid || i.inspector_name === m.full_name) && ['Submitted', 'Completed'].includes(i.status)
          ).length,
          activeRepairs: allRemediations.filter(
            (r) => (r.assigned_technician_id === uid || r.assigned_technician_name === m.full_name) && r.status !== 'Verified'
          ).length,
          verifiedRepairs: allRemediations.filter(
            (r) => (r.assigned_technician_id === uid || r.assigned_technician_name === m.full_name) && r.status === 'Verified'
          ).length,
        };
      });

    return res.status(200).json({
      range,
      kpis,
      charts: {
        deficienciesByCategory,
        doorStatusCounts,
        severityCounts,
        monthlyTrend: months,
      },
      upcomingTasks,
      recurringReminders: upcomingRecurringDoors.slice(0, 6).map((d) => ({
        id: d.id,
        door_code: d.door_code,
        building: buildingLookup[d.building_id] || 'Unknown Building',
        next_inspection_due: d.next_inspection_due,
        status: d.status,
      })),
      workload,
      recentActivity: auditLogs,
    });
  } catch (err) {
    console.error('[api/dashboard] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
