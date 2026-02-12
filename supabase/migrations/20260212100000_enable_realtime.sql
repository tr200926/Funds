-- Enable realtime for dashboard-critical tables
ALTER PUBLICATION supabase_realtime ADD TABLE ad_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;
