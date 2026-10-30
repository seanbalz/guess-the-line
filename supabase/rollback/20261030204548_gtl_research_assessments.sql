-- Disable the new routes first (GTL_FEATURE_OFF=research-assessments).
-- Keep every submitted link and snapshot. Restore service execution by regranting.
revoke execute on function public.gtl_submit_research_link(uuid,uuid,text),public.gtl_read_research_submissions(uuid),
  public.gtl_publish_research_snapshot(uuid,jsonb),public.gtl_read_research_snapshot(integer,integer) from service_role;
revoke execute on function public.gtl_begin_research_quotes(uuid,integer,integer,text,text[]),public.gtl_finish_research_quotes(uuid,uuid,jsonb,text,jsonb) from service_role;
revoke execute on function public.gtl_read_research_quotes(integer,integer,jsonb) from service_role;
