-- Rollback for 20261103190000_gtl_ops_alerts.sql (supabase/rollback/README.md): M-38 replaces no function, so this is its
-- permission off switch. First stop the dispatch (the admin script's off lines: enabled=false on gtl_ops_alert_schedule and
-- unschedule gtl-ops-alerts). The dispatcher and the checks are cron's alone already. Every incident and run stays (D-23).
-- Restore by regranting.
revoke execute on function public.gtl_claim_ops_alerts(text,uuid),public.gtl_mark_ops_notification(uuid,uuid,bigint,text),
  public.gtl_record_ops_delivery(uuid,uuid,text,text),public.gtl_complete_ops_alerts(uuid,uuid,text,integer,integer),
  public.gtl_ops_test_alert() from service_role;
