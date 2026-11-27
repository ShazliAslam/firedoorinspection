// DoorProof AI — Supabase Edge Function Reference for Human-in-the-Loop AI Assistance
// Deploy via: supabase functions deploy ai-assist
// Requires OPENAI_API_KEY or ANTHROPIC_API_KEY configured in Supabase Edge Function Secrets.
// NEVER independently certifies legal or fire-code compliance.

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  if (!openAiKey && !anthropicKey) {
    return new Response(
      JSON.stringify({
        configured: false,
        error:
          'AI provider credentials (OPENAI_API_KEY or ANTHROPIC_API_KEY) are not configured in Edge Function secrets. No synthetic AI output was generated.',
      }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid user token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { mode, inputText } = await req.json();
  const systemPrompt =
    'You are DoorProof AI Assistant for US fire-door contractors. Draft concise operational suggestions ONLY. Never certify legal or NFPA compliance. Always mark output as requiring qualified professional human review.';

  if (openAiKey) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Mode: ${mode}\n\n${inputText}` },
        ],
      }),
    });
    const json = await resp.json();
    return new Response(
      JSON.stringify({
        configured: true,
        requiresHumanReview: true,
        suggestion: json.choices?.[0]?.message?.content || '',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ configured: false, error: 'Unsupported provider configuration' }), {
    status: 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
