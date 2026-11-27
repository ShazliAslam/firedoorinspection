import supabase from './db-client.js';

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  INSPECTOR: 'inspector',
  TECHNICIAN: 'technician',
  CLIENT: 'client',
};

export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Organization-Id');
}

export function hasRole(member, allowedRoles) {
  if (!member || member.status !== 'active') return false;
  return allowedRoles.includes(member.role);
}

/**
 * Verifies the Bearer JWT via Supabase Auth, resolves the user's profile and active
 * organization membership, and returns tenant-scoped context for strict backend RBAC.
 */
export async function requireAuth(req, res, options = {}) {
  const { allowNoOrg = false } = options;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return null;
  }

  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return null;
  }

  const user = userData.user;

  // Ensure profile exists
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'User';
    const { data: createdProfile } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        full_name: fullName,
      })
      .select()
      .single();
    profile = createdProfile || { id: user.id, email: user.email, full_name: fullName };
  }

  // Link any pending invitations matching user email
  if (user.email) {
    await supabase
      .from('organization_members')
      .update({ user_id: user.id, status: 'active' })
      .eq('email', user.email.toLowerCase())
      .eq('status', 'invited');
  }

  // Fetch all active memberships for this user
  const { data: memberships = [] } = await supabase
    .from('organization_members')
    .select('*')
    .or(`user_id.eq.${user.id},email.eq.${(user.email || '').toLowerCase()}`)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  const requestedOrgId = req.headers['x-organization-id'] || profile?.active_organization_id;
  let activeMember =
    memberships.find((m) => m.organization_id === requestedOrgId) || memberships[0] || null;

  // Backfill user_id if matched by email
  if (activeMember && !activeMember.user_id) {
    await supabase
      .from('organization_members')
      .update({ user_id: user.id })
      .eq('id', activeMember.id);
    activeMember = { ...activeMember, user_id: user.id };
  }

  if (!activeMember) {
    if (allowNoOrg) {
      return { user, profile, member: null, organizationId: null, memberships: [] };
    }
    res.status(403).json({
      error: 'No active organization membership found. Complete workspace onboarding first.',
      code: 'NO_ORGANIZATION',
    });
    return null;
  }

  // Sync active_organization_id if needed
  if (profile.active_organization_id !== activeMember.organization_id) {
    await supabase
      .from('profiles')
      .update({ active_organization_id: activeMember.organization_id })
      .eq('id', user.id);
  }

  return {
    user,
    profile,
    member: activeMember,
    organizationId: activeMember.organization_id,
    memberships,
  };
}

export async function logAudit(ctx, { action, entityType, entityId = null, details = {} }) {
  if (!ctx?.organizationId) return;
  try {
    await supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_user_id: ctx.user?.id || null,
      actor_name: ctx.profile?.full_name || ctx.user?.email || 'System',
      actor_role: ctx.member?.role || 'system',
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      details,
    });
  } catch (err) {
    console.error('[audit_logs] insert error:', err.message);
  }
}

/**
 * Creates an in-app notification with duplicate prevention (dedupe_key) and dispatches
 * transactional email via Resend ONLY when RESEND_API_KEY is configured in environment.
 */
export async function dispatchNotification({
  organizationId,
  recipientUserId = null,
  recipientEmail = null,
  eventType,
  dedupeKey = null,
  title,
  message,
  linkPath = '/',
}) {
  if (!organizationId) return null;

  // Duplicate prevention check
  if (dedupeKey) {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();
    if (existing) return existing;
  }

  let emailStatus = 'skipped_no_resend_key';
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'DoorProof AI <notifications@doorproof.ai>';

  if (resendKey && recipientEmail) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipientEmail],
          subject: `[DoorProof AI] ${title}`,
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
            <h2 style="margin-bottom:8px;">${title}</h2>
            <p style="color:#334155;line-height:1.6;">${message}</p>
            <p style="font-size:12px;color:#64748b;margin-top:24px;">Sent by DoorProof AI Fire Door Compliance Platform.</p>
          </div>`,
        }),
      });
      emailStatus = emailRes.ok ? 'sent' : 'failed_delivery';
    } catch (err) {
      console.error('[resend] dispatch failed:', err.message);
      emailStatus = 'failed_delivery';
    }
  }

  const { data } = await supabase
    .from('notifications')
    .insert({
      organization_id: organizationId,
      recipient_user_id: recipientUserId,
      recipient_email: recipientEmail,
      event_type: eventType,
      dedupe_key: dedupeKey,
      title,
      message,
      link_path: linkPath,
      read: false,
      email_status: emailStatus,
    })
    .select()
    .single();

  return data;
}

export function getIntegrationCapabilities() {
  return {
    aiConfigured: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}
