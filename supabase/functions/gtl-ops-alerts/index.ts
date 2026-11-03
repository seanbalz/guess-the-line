import { createOpsAlertAdapter, createOpsAlertHandler } from '../../../cloud/ops-alerts.mjs';

// Item 22 ops alerts (M-38, docs/OPS_ALERTS.md): pg_cron's dispatcher calls this every 15 minutes, only when an alert or a
// recovery is owed to the commissioner's phone. A short-lived per-run capability is verified by SQL. The VAPID secrets are
// the gtl-push-reminders ones, read from Edge Function secrets at run time; they are never logged or returned.
const service = createOpsAlertAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createOpsAlertHandler({ service, vapid: {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY'), privateKey: Deno.env.get('VAPID_PRIVATE_KEY'), subject: Deno.env.get('VAPID_SUBJECT'),
} }));
