import supabase from './db-client.js';
import { setCors, requireAuth, ROLES, getIntegrationCapabilities } from './_auth.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const orgId = ctx.organizationId;
  const action = req.query.action || req.body?.action || 'list';

  try {
    // AI Assistance endpoint — NEVER pretends to work if API credentials are missing
    if (req.method === 'POST' && action === 'ai_assist') {
      const caps = getIntegrationCapabilities();
      if (!caps.aiConfigured) {
        return res.status(503).json({
          configured: false,
          error:
            'AI Assistance is disabled because no AI provider API key (OPENAI_API_KEY or ANTHROPIC_API_KEY) is configured in this environment. DoorProof AI never fabricates AI summaries or compliance decisions.',
        });
      }
      return res.status(501).json({
        configured: true,
        error: 'Connect your preferred LLM model handler in api/notifications.js to execute live prompts with mandatory human review.',
      });
    }

    // Audit Logs list
    if (req.method === 'GET' && action === 'audit_logs') {
      if (ctx.member.role === ROLES.CLIENT) {
        return res.status(403).json({ error: 'Audit logs are restricted to contractor organization personnel.' });
      }
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // List notifications for current org / user
    if (req.method === 'GET') {
      let q = supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(40);

      if (ctx.member.role === ROLES.CLIENT) {
        q = q.eq('recipient_email', ctx.user.email);
      }

      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // Mark notification(s) as read
    if (req.method === 'PUT') {
      const { id, mark_all } = req.body;
      if (mark_all) {
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('organization_id', orgId)
          .eq('read', false);
        return res.status(200).json({ ok: true });
      }
      if (!id) return res.status(400).json({ error: 'Notification ID is required.' });
      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('[api/notifications] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
