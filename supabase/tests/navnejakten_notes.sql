-- Test av notater på matcher (Navnejakten v2). Rulles alltid tilbake; rapport i feilmeldingen «RAPPORT …».
do $$
declare
  a uuid; b uuid; p uuid; n1 uuid; n2 uuid; rep text := ''; c int;
begin
  select id, inviter_id, invitee_id into p, a, b from public.partnerships where status = 'accepted' limit 1;
  insert into public.names(name, gender, letters, latest_year, latest_count) values ('Notat1','girl',6,2025,100) returning id into n1;
  insert into public.names(name, gender, letters, latest_year, latest_count) values ('Notat2','boy',6,2025,90) returning id into n2;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.name_votes(user_id, name_id, vote) values (a, n1, 'yes'), (a, n2, 'yes');
  begin
    insert into public.name_match_notes(partnership_id, name_id, user_id, note) values (p, n1, a, 'før match');
    rep := rep || E'Notat på navn uten match: TILLATT (FEIL)\n';
  exception when others then rep := rep || E'Notat på navn uten match: avvist (OK)\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into public.name_votes(user_id, name_id, vote) values (b, n1, 'yes');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  insert into public.name_match_notes(partnership_id, name_id, user_id, note) values (p, n1, a, 'Etter bestemor');
  select count(*) into c from public.name_match_notes; rep := rep || 'A skriver notat på match, A ser (forventer 1): ' || c || E'\n';
  begin
    insert into public.name_match_notes(partnership_id, name_id, user_id, note) values (p, n1, a, '');
    rep := rep || E'Tomt notat: TILLATT (FEIL)\n';
  exception when others then rep := rep || E'Tomt notat: avvist (OK)\n'; end;
  begin
    insert into public.name_match_notes(partnership_id, name_id, user_id, note) values (p, n1, b, 'skrevet av A som B');
    rep := rep || E'A skriver som B: TILLATT (FEIL)\n';
  exception when others then rep := rep || E'A skriver som B: avvist (OK)\n'; end;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into c from public.name_match_notes; rep := rep || 'B ser As notat (forventer 1): ' || c || E'\n';
  update public.name_match_notes set note = 'overskrevet' where user_id = a; get diagnostics c = row_count; rep := rep || 'B endrer As notat (forventer 0): ' || c || E'\n';
  delete from public.name_match_notes where user_id = a; get diagnostics c = row_count; rep := rep || 'B sletter As notat (forventer 0): ' || c || E'\n';
  insert into public.name_match_notes(partnership_id, name_id, user_id, note) values (p, n1, b, 'Fint navn');
  select count(*) into c from public.name_match_notes; rep := rep || 'B skriver eget notat, ser begge (forventer 2): ' || c || E'\n';

  -- Matchen forsvinner når A trekker «ja» → notatene skjules
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  update public.name_votes set vote = 'maybe' where user_id = a and name_id = n1;
  select count(*) into c from public.name_match_notes; rep := rep || 'Match borte, A ser notater (forventer 0): ' || c || E'\n';

  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  select count(*) into c from public.name_match_notes; rep := rep || 'Utenforstående ser notater (forventer 0): ' || c || E'\n';

  reset role;
  raise exception 'RAPPORT%', E'\n' || rep;
end $$;
