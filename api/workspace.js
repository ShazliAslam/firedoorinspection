import supabase from './db-client.js';
import {
  setCors,
  requireAuth,
  hasRole,
  ROLES,
  logAudit,
  getIntegrationCapabilities,
} from './_auth.js';

const DEFAULT_TEMPLATE_ITEMS = [
  { category: 'Door Leaf', label: 'Door leaf free of holes, delamination, or unapproved field modifications', guidance_note: 'Inspect both faces and edges for unauthorized penetrations or structural damage.', sort_order: 1 },
  { category: 'Frame', label: 'Frame securely anchored, plumb, and free of distortion or open fastener holes', guidance_note: 'Verify fire-rated frame integrity and jamb alignment.', sort_order: 2 },
  { category: 'Hinges', label: 'Steel fire-rated hinges intact with all mounting screws tight and zero excessive wear', guidance_note: 'Check hinge barrel play and missing screws.', sort_order: 3 },
  { category: 'Closers', label: 'Self-closing device operates smoothly and returns leaf fully to closed position', guidance_note: 'Test from 30 degrees and full open; ensure no fluid leaks or hold-open wedges.', sort_order: 4 },
  { category: 'Latching', label: 'Positive latching engages strike plate cleanly without binding or manual force', guidance_note: 'Confirm latch bolt throws fully into strike pocket.', sort_order: 5 },
  { category: 'Seals', label: 'Intumescent and smoke gasketing continuous, adhered, and undamaged', guidance_note: 'Inspect perimeter smoke seals and astragal/meeting edge seals if pair.', sort_order: 6 },
  { category: 'Glazing', label: 'Fire-rated vision lite glazing intact, firmly beaded, and free of cracks', guidance_note: 'Verify listed glazing markings where applicable.', sort_order: 7 },
  { category: 'Gaps', label: 'Perimeter clearances and undercut within qualified professional acceptance tolerances', guidance_note: 'Measure top, hinge, latch, and bottom clearances; record exact measurements.', sort_order: 8 },
  { category: 'Signage', label: 'Fire rating label legible and required door signage properly affixed', guidance_note: 'Confirm listing label is unpainted and readable.', sort_order: 9 },
  { category: 'Other Observations', label: 'Auxiliary hardware, coordinators, panic devices, and surrounding egress unobstructed', guidance_note: 'Record any auxiliary hardware issues or obstructions.', sort_order: 10 },
];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const action = req.query.action || req.body?.action || 'bootstrap';

    // Onboarding new organization for freshly signed-up users
    if (req.method === 'POST' && action === 'create_organization') {
      const ctx = await requireAuth(req, res, { allowNoOrg: true });
      if (!ctx) return;

      const { name, phone, email, address, license_number } = req.body || {};
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Organization name is required.' });
      }

      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') +
        '-' +
        Math.random().toString(36).slice(2, 6);

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({
          name: name.trim(),
          slug,
          phone: phone || null,
          email: email || ctx.user.email,
          address: address || null,
          license_number: license_number || null,
          primary_color: '#1d4ed8',
        })
        .select()
        .single();
      if (orgErr) throw orgErr;

      // Add creator as Owner
      const { data: member, error: memErr } = await supabase
        .from('organization_members')
        .insert({
          organization_id: org.id,
          user_id: ctx.user.id,
          email: ctx.user.email.toLowerCase(),
          full_name: ctx.profile?.full_name || ctx.user.email.split('@')[0],
          role: ROLES.OWNER,
          status: 'active',
          notification_preferences: {
            inspection_assigned: true,
            deficiency_created: true,
            repair_assigned: true,
            verification_requested: true,
            report_delivered: true,
          },
        })
        .select()
        .single();
      if (memErr) throw memErr;

      await supabase
        .from('profiles')
        .update({ active_organization_id: org.id })
        .eq('id', ctx.user.id);

      // Seed starter subscription
      await supabase.from('subscriptions').insert({
        organization_id: org.id,
        plan_tier: 'Starter',
        status: 'active',
        max_doors: 150,
        max_users: 5,
        max_storage_mb: 2000,
      });

      // Seed default configurable checklist template
      const { data: tpl } = await supabase
        .from('inspection_templates')
        .insert({
          organization_id: org.id,
          name: 'Standard Swinging Fire Door Assembly Checklist',
          description:
            'Configurable multi-point inspection checklist for swinging fire door assemblies. Criteria must be reviewed and verified by qualified inspection personnel.',
          is_default: true,
          active: true,
        })
        .select()
        .single();

      if (tpl) {
        await supabase.from('inspection_template_items').insert(
          DEFAULT_TEMPLATE_ITEMS.map((item) => ({
            organization_id: org.id,
            template_id: tpl.id,
            ...item,
            required: true,
          }))
        );
      }

      await logAudit(
        { ...ctx, organizationId: org.id, member },
        { action: 'organization.created', entityType: 'organization', entityId: org.id, details: { name: org.name } }
      );

      return res.status(201).json({ organization: org, member });
    }

    const ctx = await requireAuth(req, res, { allowNoOrg: req.method === 'GET' && action === 'bootstrap' });
    if (!ctx) return;

    // GET bootstrap: user, active org, role, members, templates, subscription, capabilities
    if (req.method === 'GET' && action === 'bootstrap') {
      if (!ctx.organizationId) {
        return res.status(200).json({
          needsOnboarding: true,
          profile: ctx.profile,
          memberships: [],
          capabilities: getIntegrationCapabilities(),
        });
      }

      const [orgRes, subRes, membersRes, templatesRes, templateItemsRes, doorsCountRes, evidenceRes] =
        await Promise.all([
          supabase.from('organizations').select('*').eq('id', ctx.organizationId).single(),
          supabase.from('subscriptions').select('*').eq('organization_id', ctx.organizationId).maybeSingle(),
          ctx.member.role === ROLES.CLIENT
            ? Promise.resolve({ data: [ctx.member] })
            : supabase
                .from('organization_members')
                .select('*')
                .eq('organization_id', ctx.organizationId)
                .order('created_at', { ascending: true }),
          supabase
            .from('inspection_templates')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .order('created_at', { ascending: true }),
          supabase
            .from('inspection_template_items')
            .select('*')
            .eq('organization_id', ctx.organizationId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('fire_doors')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', ctx.organizationId)
            .eq('archived', false),
          supabase
            .from('evidence_files')
            .select('file_size')
            .eq('organization_id', ctx.organizationId),
        ]);

      // Fetch user's accessible organizations for switcher
      const orgIds = [...new Set(ctx.memberships.map((m) => m.organization_id))];
      const { data: userOrgs = [] } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .in('id', orgIds);

      const storageBytes = (evidenceRes.data || []).reduce((acc, f) => acc + (f.file_size || 0), 0);

      // Attach items to each template
      const templates = (templatesRes.data || []).map((t) => ({
        ...t,
        items: (templateItemsRes.data || []).filter((i) => i.template_id === t.id),
      }));

      // If client user, fetch their assigned client record
      let assignedClient = null;
      if (ctx.member.role === ROLES.CLIENT && ctx.member.client_id) {
        const { data: c } = await supabase
          .from('clients')
          .select('*')
          .eq('id', ctx.member.client_id)
          .maybeSingle();
        assignedClient = c;
      }

      return res.status(200).json({
        needsOnboarding: false,
        profile: ctx.profile,
        member: ctx.member,
        assignedClient,
        organization: orgRes.data,
        organizations: userOrgs,
        subscription: subRes.data || {
          plan_tier: 'Starter',
          status: 'active',
          max_doors: 150,
          max_users: 5,
          max_storage_mb: 2000,
        },
        usage: {
          doors: doorsCountRes.count || 0,
          users: (membersRes.data || []).filter((m) => m.status !== 'inactive').length,
          storage_mb: Math.round((storageBytes / (1024 * 1024)) * 100) / 100,
        },
        members: membersRes.data || [],
        templates,
        capabilities: getIntegrationCapabilities(),
      });
    }

    // Update organization branding & settings (Owner/Admin)
    if (req.method === 'PUT' && action === 'update_organization') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can modify organization settings.' });
      }
      const { name, phone, email, address, website, primary_color, license_number } = req.body;
      const { data, error } = await supabase
        .from('organizations')
        .update({
          name,
          phone,
          email,
          address,
          website,
          primary_color,
          license_number,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ctx.organizationId)
        .select()
        .single();
      if (error) throw error;

      await logAudit(ctx, {
        action: 'organization.updated',
        entityType: 'organization',
        entityId: ctx.organizationId,
        details: { name },
      });
      return res.status(200).json(data);
    }

    // Update own notification preferences
    if (req.method === 'PUT' && action === 'update_preferences') {
      const { notification_preferences } = req.body;
      const { data, error } = await supabase
        .from('organization_members')
        .update({ notification_preferences })
        .eq('id', ctx.member.id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    // Invite team member (Owner/Admin)
    if (req.method === 'POST' && action === 'invite_member') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can invite team members.' });
      }
      const { email, full_name, role, client_id } = req.body;
      if (!email || !role) {
        return res.status(400).json({ error: 'Email and role are required.' });
      }
      if (!Object.values(ROLES).includes(role)) {
        return res.status(400).json({ error: 'Invalid role selected.' });
      }
      if (role === ROLES.OWNER && ctx.member.role !== ROLES.OWNER) {
        return res.status(403).json({ error: 'Only an Owner can assign the Owner role.' });
      }
      if (role === ROLES.CLIENT && !client_id) {
        return res.status(400).json({ error: 'Client portal users must be linked to a specific Client.' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const { data: existing } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: 'A member with this email already exists in the organization.' });
      }

      const { data, error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: ctx.organizationId,
          email: normalizedEmail,
          full_name: full_name || normalizedEmail.split('@')[0],
          role,
          client_id: role === ROLES.CLIENT ? client_id : null,
          status: 'invited',
          invited_by: ctx.user.id,
          notification_preferences: {
            inspection_assigned: true,
            deficiency_created: true,
            repair_assigned: true,
            verification_requested: true,
            report_delivered: true,
          },
        })
        .select()
        .single();
      if (error) throw error;

      await logAudit(ctx, {
        action: 'team.member_invited',
        entityType: 'organization_member',
        entityId: data.id,
        details: { email: normalizedEmail, role },
      });

      return res.status(201).json(data);
    }

    // Update member role or activation status (Owner/Admin)
    if (req.method === 'PUT' && action === 'update_member') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can manage team members.' });
      }
      const { id, role, status, client_id } = req.body;
      if (!id) return res.status(400).json({ error: 'Member ID is required.' });
      if (id === ctx.member.id && status === 'inactive') {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
      }

      const patch = {};
      if (role) patch.role = role;
      if (status) patch.status = status;
      if (client_id !== undefined) patch.client_id = role === ROLES.CLIENT ? client_id : null;

      const { data, error } = await supabase
        .from('organization_members')
        .update(patch)
        .eq('id', id)
        .eq('organization_id', ctx.organizationId)
        .select()
        .single();
      if (error) throw error;

      await logAudit(ctx, {
        action: 'team.member_updated',
        entityType: 'organization_member',
        entityId: id,
        details: patch,
      });

      return res.status(200).json(data);
    }

    // Create / Update inspection template (Owner/Admin)
    if (req.method === 'POST' && action === 'save_template') {
      if (!hasRole(ctx.member, [ROLES.OWNER, ROLES.ADMIN])) {
        return res.status(403).json({ error: 'Only Owners and Admins can manage inspection templates.' });
      }
      const { id, name, description, is_default, items = [] } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: 'Template name is required.' });

      let template;
      if (id) {
        const { data, error } = await supabase
          .from('inspection_templates')
          .update({ name: name.trim(), description: description || '', is_default: Boolean(is_default) })
          .eq('id', id)
          .eq('organization_id', ctx.organizationId)
          .select()
          .single();
        if (error) throw error;
        template = data;
        await supabase.from('inspection_template_items').delete().eq('template_id', id);
      } else {
        const { data, error } = await supabase
          .from('inspection_templates')
          .insert({
            organization_id: ctx.organizationId,
            name: name.trim(),
            description: description || '',
            is_default: Boolean(is_default),
            active: true,
          })
          .select()
          .single();
        if (error) throw error;
        template = data;
      }

      if (items.length > 0) {
        const rows = items.map((item, idx) => ({
          organization_id: ctx.organizationId,
          template_id: template.id,
          category: item.category || 'Other Observations',
          label: item.label,
          guidance_note: item.guidance_note || '',
          sort_order: idx + 1,
          required: item.required !== false,
        }));
        await supabase.from('inspection_template_items').insert(rows);
      }

      await logAudit(ctx, {
        action: id ? 'template.updated' : 'template.created',
        entityType: 'inspection_template',
        entityId: template.id,
        details: { name: template.name, item_count: items.length },
      });

      return res.status(200).json(template);
    }

    // Subscription plan checkout check — NEVER simulates successful payment when Stripe is unconfigured
    if (req.method === 'POST' && action === 'checkout_subscription') {
      if (!hasRole(ctx.member, [ROLES.OWNER])) {
        return res.status(403).json({ error: 'Only the Organization Owner can manage billing.' });
      }
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({
          error:
            'Stripe billing credentials (STRIPE_SECRET_KEY) are not configured in this environment. Live plan upgrades are disabled; no payment was processed.',
          stripeConfigured: false,
        });
      }
      return res.status(501).json({
        error: 'Configure Stripe Price IDs in environment variables to launch Stripe Checkout.',
      });
    }

    return res.status(405).json({ error: 'Unsupported action or method.' });
  } catch (err) {
    console.error('[api/workspace] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
