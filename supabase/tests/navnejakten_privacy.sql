-- Personvern- og match-test for Navnejakten. Kjøres mot databasen med rolle-simulering og rulles ALLTID tilbake
-- (RAISE EXCEPTION på slutten) — den etterlater ingen data. Krever ett akseptert partnerskap i public.partnerships.
-- Kjør f.eks. via Supabase SQL-editor eller MCP execute_sql. Rapporten kommer i feilmeldingen «RAPPORT …».
do $$
declare
  a uuid; b uuid; n1 uuid; n2 uuid; f uuid; p uuid; rep text := ''; c int;
begin
  select id, inviter_id, invitee_id into p, a, b from public.partnerships where status = 'accepted' limit 1;
  insert into public.names(name, gender, letters, latest_year, latest_count) values ('Testnavn1','girl',9,2025,100) returning id into n1;
  insert into public.names(name, gender, letters, latest_year, latest_count) values ('Testnavn2','boy',9,2025,90) returning id into n2;

  -- A stemmer ja: ingen match ennå
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.name_votes(user_id, name_id, vote) values (a, n1, 'yes');
  select count(*) into c from public.name_matches; rep := rep || 'A ja, matcher sett av A (forventer 0): ' || c || E'\n';

  -- B ser ikke A sine stemmer og kan ikke endre dem
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into c from public.name_votes; rep := rep || 'B ser i name_votes (forventer 0): ' || c || E'\n';
  select count(*) into c from public.name_matches; rep := rep || 'B ser matcher før B har stemt (forventer 0): ' || c || E'\n';
  update public.name_votes set vote = 'no' where user_id = a; get diagnostics c = row_count; rep := rep || 'B oppdaterer A (forventer 0): ' || c || E'\n';
  delete from public.name_votes where user_id = a; get diagnostics c = row_count; rep := rep || 'B sletter A (forventer 0): ' || c || E'\n';
  begin
    insert into public.name_votes(user_id, name_id, vote) values (a, n2, 'yes');
    rep := rep || E'B insert som A: TILLATT (FEIL)\n';
  exception when others then rep := rep || E'B insert som A: avvist (OK)\n'; end;

  -- B stemmer ja → match for begge
  insert into public.name_votes(user_id, name_id, vote) values (b, n1, 'yes');
  select count(*) into c from public.name_matches; rep := rep || 'B ja, matcher sett av B (forventer 1): ' || c || E'\n';
  begin
    insert into public.name_matches(partnership_id, name_id) values (p, n2);
    rep := rep || E'Direkte insert i name_matches: TILLATT (FEIL)\n';
  exception when others then rep := rep || E'Direkte insert i name_matches: avvist (OK)\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into c from public.name_matches; rep := rep || 'A ser match (forventer 1): ' || c || E'\n';
  update public.name_votes set vote = 'maybe' where user_id = a and name_id = n1;
  select count(*) into c from public.name_matches; rep := rep || 'A maybe → matcher (forventer 0): ' || c || E'\n';
  update public.name_votes set vote = 'yes' where user_id = a and name_id = n1;
  select count(*) into c from public.name_matches; rep := rep || 'A ja igjen → matcher (forventer 1): ' || c || E'\n';
  select rated into c from public.name_partner_stats(); rep := rep || 'Partner-aggregat vurdert (forventer 1): ' || c || E'\n';

  -- Finalen: felles liste utleveres først når BEGGE er ferdige
  insert into public.name_finals(partnership_id, created_by, name_ids) values (p, a, array[n1, n2]) returning id into f;
  insert into public.name_final_runs(final_id, user_id, state, status, result)
    values (f, a, '{}'::jsonb, 'done', '[{"id":"x","rank":1}]'::jsonb);
  select count(*) into c from public.name_final_results(f); rep := rep || 'Kun A ferdig, resultater sett av A (forventer 0): ' || c || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  rep := rep || 'B ser at A er ferdig (forventer true): ' || public.name_final_partner_done(f) || E'\n';
  select count(*) into c from public.name_final_results(f); rep := rep || 'Kun A ferdig, resultater sett av B (forventer 0): ' || c || E'\n';
  select count(*) into c from public.name_final_runs where user_id = a; rep := rep || 'B leser A sin kjøring direkte (forventer 0): ' || c || E'\n';
  insert into public.name_final_runs(final_id, user_id, state, status, result)
    values (f, b, '{}'::jsonb, 'done', '[{"id":"x","rank":2}]'::jsonb);
  select count(*) into c from public.name_final_results(f); rep := rep || 'Begge ferdig, resultater sett av B (forventer 2): ' || c || E'\n';

  -- Utenforstående kan ikke lese noe
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  select count(*) into c from public.name_final_results(f); rep := rep || 'Utenforstående, resultater (forventer 0): ' || c || E'\n';
  select count(*) into c from public.name_matches; rep := rep || 'Utenforstående, matcher (forventer 0): ' || c || E'\n';
  reset role;
  set local role anon;
  begin
    select count(*) into c from public.name_votes; rep := rep || 'anon leser name_votes: ' || c || E' (RLS)\n';
  exception when others then rep := rep || E'anon name_votes: avvist (OK)\n'; end;

  reset role;
  raise exception 'RAPPORT%', E'\n' || rep;
end $$;
