import { createPushReminderAdapter, createPushReminderHandler } from '../../../cloud/push-reminders.mjs';

// D-28 deadline reminders: pg_cron dispatches this every 15 minutes inside the two
// hours before the open week's deadline. A short-lived per-run capability is
// verified by SQL. The VAPID secrets are read from Edge Function secrets at run
// time (Sean sets them in the dashboard); they are never logged or returned.
const service = createPushReminderAdapter({ url: Deno.env.get('SUPABASE_URL'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') });
Deno.serve(createPushReminderHandler({ service, vapid: {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY'), privateKey: Deno.env.get('VAPID_PRIVATE_KEY'), subject: Deno.env.get('VAPID_SUBJECT'),
} }));
