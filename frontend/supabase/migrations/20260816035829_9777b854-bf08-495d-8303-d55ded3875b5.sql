select cron.alter_job(13, schedule => '*/5 * * * *');
select cron.alter_job(17, schedule => '*/2 * * * *');
select cron.alter_job(22, schedule => '*/2 * * * *');
select cron.alter_job(45, schedule => '*/5 * * * *');
select cron.alter_job(232, schedule => '20 2 * * *');
select cron.alter_job(5, schedule => '45 3 * * *');
select cron.alter_job(35, schedule => '15 4 * * *');
select cron.alter_job(10, schedule => '40 1 * * 1');

select cron.schedule('cron-history-cleanup-daily', '25 5 * * *', $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$);

delete from cron.job_run_details where end_time < now() - interval '14 days';