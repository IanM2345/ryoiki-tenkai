-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;




ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE SEQUENCE public.dev_config_id_seq AS integer;

CREATE FUNCTION public.decrypt_val (
  val text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  if val is null then return null; end if;
  return pgp_sym_decrypt(val::bytea, 'xK9#mP2$qL7nR4@wT');
end;
$function$;

GRANT ALL ON FUNCTION public.decrypt_val(text) TO anon;

GRANT ALL ON FUNCTION public.decrypt_val(text) TO authenticated;

GRANT ALL ON FUNCTION public.decrypt_val(text) TO service_role;

CREATE FUNCTION public.enc (
  val text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  if val is null then return null; end if;
  return pgp_sym_encrypt(val, 'your-strong-passphrase-here');
end;
$function$;

GRANT ALL ON FUNCTION public.enc(text) TO anon;

GRANT ALL ON FUNCTION public.enc(text) TO authenticated;

GRANT ALL ON FUNCTION public.enc(text) TO service_role;

CREATE FUNCTION public.encrypt_val (
  val text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
begin
  if val is null then return null; end if;
  return pgp_sym_encrypt(val, 'xK9#mP2$qL7nR4@wT');
end;
$function$;

GRANT ALL ON FUNCTION public.encrypt_val(text) TO anon;

GRANT ALL ON FUNCTION public.encrypt_val(text) TO authenticated;

GRANT ALL ON FUNCTION public.encrypt_val(text) TO service_role;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  perform public.seed_mood_defs(new.id);

  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;

GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;

GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

CREATE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;

GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;

CREATE FUNCTION public.seed_mood_defs (
  p_user_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.mood_defs (user_id, name, color, sort_order) values
    (p_user_id, 'happy',      '#f59e0b', 0),
    (p_user_id, 'calm',       '#3b82f6', 1),
    (p_user_id, 'energised',  '#ef4444', 2),
    (p_user_id, 'loved',      '#ec4899', 3),
    (p_user_id, 'anxious',    '#8b5cf6', 4),
    (p_user_id, 'sad',        '#6b7280', 5),
    (p_user_id, 'tired',      '#78716c', 6),
    (p_user_id, 'frustrated', '#f97316', 7)
  on conflict do nothing;
end;
$function$;

GRANT ALL ON FUNCTION public.seed_mood_defs(uuid) TO anon;

GRANT ALL ON FUNCTION public.seed_mood_defs(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.seed_mood_defs(uuid) TO service_role;

CREATE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;

GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;

GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

CREATE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;

GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;

GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;

CREATE TABLE public.dev_config (
  id    integer DEFAULT nextval('public.dev_config_id_seq'::regclass) NOT NULL,
  key   text    NOT NULL,
  value text    NOT NULL
);

ALTER SEQUENCE public.dev_config_id_seq OWNED BY public.dev_config.id;

GRANT ALL ON SEQUENCE public.dev_config_id_seq TO anon;

GRANT ALL ON SEQUENCE public.dev_config_id_seq TO authenticated;

GRANT ALL ON SEQUENCE public.dev_config_id_seq TO service_role;

ALTER TABLE public.dev_config
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dev_config
  ADD CONSTRAINT dev_config_key_key UNIQUE (key);

ALTER TABLE public.dev_config
  ADD CONSTRAINT dev_config_pkey PRIMARY KEY (id);

GRANT ALL ON public.dev_config TO anon;

GRANT ALL ON public.dev_config TO authenticated;

GRANT ALL ON public.dev_config TO service_role;

CREATE TABLE public.gallery_images (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  image_url  text                     NOT NULL,
  caption    text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.gallery_images
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gallery_images
  ADD CONSTRAINT gallery_images_pkey PRIMARY KEY (id);

GRANT ALL ON public.gallery_images TO anon;

GRANT ALL ON public.gallery_images TO authenticated;

GRANT ALL ON public.gallery_images TO service_role;

CREATE POLICY "user owns gallery_images" ON public.gallery_images
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.game_sessions (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  game_type  text                     NOT NULL,
  difficulty text                     NOT NULL,
  state      jsonb,
  status     text                     DEFAULT 'in_progress'::text NOT NULL,
  result     text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.game_sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_difficulty_check CHECK (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text]));

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_type_check CHECK (game_type = ANY (ARRAY['tic'::text, 'sudoku'::text, 'chess'::text, 'battleship'::text, 'kadi'::text, 'matatu'::text]));

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_result_check CHECK (result = ANY (ARRAY['win'::text, 'loss'::text, 'draw'::text]));

ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_status_check CHECK (status = ANY (ARRAY['in_progress'::text, 'finished'::text]));

GRANT ALL ON public.game_sessions TO anon;

GRANT ALL ON public.game_sessions TO authenticated;

GRANT ALL ON public.game_sessions TO service_role;

CREATE INDEX game_sessions_game_type_idx ON public.game_sessions (user_id, game_type);

CREATE INDEX game_sessions_user_id_idx ON public.game_sessions (user_id);

CREATE TRIGGER game_sessions_updated_at
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "user owns game_sessions" ON public.game_sessions
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.ideas (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  title      text                     NOT NULL,
  body       text                     DEFAULT ''::text NOT NULL,
  status     text                     DEFAULT 'thinking'::text NOT NULL,
  priority   text                     DEFAULT 'medium'::text NOT NULL,
  tags       text[]                   DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ideas
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_pkey PRIMARY KEY (id);

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_priority_check CHECK (priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]));

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_status_check CHECK (status = ANY (ARRAY['thinking'::text, 'planning'::text, 'doing'::text, 'done'::text]));

ALTER TABLE public.ideas
  ADD CONSTRAINT ideas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.ideas TO anon;

GRANT ALL ON public.ideas TO authenticated;

GRANT ALL ON public.ideas TO service_role;

CREATE INDEX ideas_user_status_idx ON public.ideas (user_id, status);

CREATE TRIGGER ideas_updated_at
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "ideas: owner only" ON public.ideas
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.journal_entries (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  title      text                     DEFAULT ''::text NOT NULL,
  body       text                     DEFAULT ''::text NOT NULL,
  mood       text,
  pinned     boolean                  DEFAULT false NOT NULL,
  tags       text[]                   DEFAULT '{}'::text[] NOT NULL,
  entry_date date                     DEFAULT CURRENT_DATE NOT NULL,
  entry_time text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.journal_entries
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.journal_entries TO anon;

GRANT ALL ON public.journal_entries TO authenticated;

GRANT ALL ON public.journal_entries TO service_role;

CREATE INDEX journal_entries_pinned_idx ON public.journal_entries (user_id, pinned)
  WHERE pinned = true;

CREATE INDEX journal_entries_user_date_idx ON public.journal_entries (user_id, entry_date DESC);

CREATE TRIGGER journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "journal_entries: owner only" ON public.journal_entries
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.journal_entry_souls (
  journal_entry_id uuid NOT NULL,
  soul_id          uuid NOT NULL
);

ALTER TABLE public.journal_entry_souls
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.journal_entry_souls
  ADD CONSTRAINT journal_entry_souls_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;

ALTER TABLE public.journal_entry_souls
  ADD CONSTRAINT journal_entry_souls_pkey PRIMARY KEY (journal_entry_id, soul_id);

GRANT ALL ON public.journal_entry_souls TO anon;

GRANT ALL ON public.journal_entry_souls TO authenticated;

GRANT ALL ON public.journal_entry_souls TO service_role;

CREATE POLICY "journal_entry_souls: owner only" ON public.journal_entry_souls
  USING ((EXISTS ( SELECT 1
   FROM public.journal_entries
  WHERE ((journal_entries.id = journal_entry_souls.journal_entry_id) AND (journal_entries.user_id = auth.uid())))));

CREATE TABLE public.library (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  type       text                     NOT NULL,
  title      text                     NOT NULL,
  meta       text,
  url        text,
  rating     smallint                 DEFAULT 0,
  notes      text,
  tags       text[]                   DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  image_url  text
);

ALTER TABLE public.library
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.library
  ADD CONSTRAINT library_pkey PRIMARY KEY (id);

ALTER TABLE public.library
  ADD CONSTRAINT library_rating_check CHECK (rating >= 0 AND rating <= 5);

ALTER TABLE public.library
  ADD CONSTRAINT library_type_check CHECK (type = ANY (ARRAY['link'::text, 'media'::text, 'place'::text, 'note'::text, 'idea'::text]));

ALTER TABLE public.library
  ADD CONSTRAINT library_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.library TO anon;

GRANT ALL ON public.library TO authenticated;

GRANT ALL ON public.library TO service_role;

CREATE INDEX library_user_created_idx ON public.library (user_id, created_at DESC);

CREATE INDEX library_user_type_idx ON public.library (user_id, TYPE);

CREATE TRIGGER library_updated_at
  BEFORE UPDATE ON public.library
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "library: owner only" ON public.library
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.mood_defs (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  name       text                     NOT NULL,
  color      text                     DEFAULT '#ff8c00'::text NOT NULL,
  sort_order smallint                 DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.mood_defs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mood_defs
  ADD CONSTRAINT mood_defs_pkey PRIMARY KEY (id);

ALTER TABLE public.mood_defs
  ADD CONSTRAINT mood_defs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.mood_defs TO anon;

GRANT ALL ON public.mood_defs TO authenticated;

GRANT ALL ON public.mood_defs TO service_role;

CREATE INDEX mood_defs_user_idx ON public.mood_defs (user_id, sort_order);

CREATE POLICY "mood_defs: owner only" ON public.mood_defs
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.mood_logs (
  id            uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id       uuid                     DEFAULT auth.uid() NOT NULL,
  mood_def_id   uuid,
  feeling_name  text                     NOT NULL,
  feeling_color text                     NOT NULL,
  intensity     smallint                 DEFAULT 3 NOT NULL,
  note          text,
  log_date      date                     DEFAULT CURRENT_DATE NOT NULL,
  log_time      text,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.mood_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mood_logs
  ADD CONSTRAINT mood_logs_intensity_check CHECK (intensity >= 1 AND intensity <= 5);

ALTER TABLE public.mood_logs
  ADD CONSTRAINT mood_logs_mood_def_id_fkey FOREIGN KEY (mood_def_id) REFERENCES public.mood_defs(id) ON DELETE SET NULL;

ALTER TABLE public.mood_logs
  ADD CONSTRAINT mood_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.mood_logs
  ADD CONSTRAINT mood_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.mood_logs TO anon;

GRANT ALL ON public.mood_logs TO authenticated;

GRANT ALL ON public.mood_logs TO service_role;

CREATE INDEX mood_logs_user_date_idx ON public.mood_logs (user_id, log_date DESC);

CREATE POLICY "mood_logs: owner only" ON public.mood_logs
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.places (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  name       text                     NOT NULL,
  address    text,
  lat        numeric(9,6),
  lng        numeric(9,6),
  visit_date date,
  visits     smallint                 DEFAULT 1 NOT NULL,
  rating     smallint                 DEFAULT 0,
  notes      text,
  tags       text[]                   DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  image_url  text
);

ALTER TABLE public.places
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.places
  ADD CONSTRAINT places_pkey PRIMARY KEY (id);

ALTER TABLE public.places
  ADD CONSTRAINT places_rating_check CHECK (rating >= 0 AND rating <= 5);

ALTER TABLE public.places
  ADD CONSTRAINT places_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.places
  ADD CONSTRAINT places_visits_check CHECK (visits >= 0);

GRANT ALL ON public.places TO anon;

GRANT ALL ON public.places TO authenticated;

GRANT ALL ON public.places TO service_role;

CREATE INDEX places_user_idx ON public.places (user_id);

CREATE TRIGGER places_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "places: owner only" ON public.places
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.queue (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  tab        text                     NOT NULL,
  title      text                     NOT NULL,
  meta       text,
  status     text                     DEFAULT 'todo'::text NOT NULL,
  pct        smallint                 DEFAULT 0 NOT NULL,
  color      text                     DEFAULT '#4a6d8a'::text NOT NULL,
  added_date date                     DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  due_date   date,
  notes      text
);

ALTER TABLE public.queue
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.queue
  ADD CONSTRAINT queue_pct_check CHECK (pct >= 0 AND pct <= 100);

ALTER TABLE public.queue
  ADD CONSTRAINT queue_pkey PRIMARY KEY (id);

ALTER TABLE public.queue
  ADD CONSTRAINT queue_status_check CHECK (status = ANY (ARRAY['todo'::text, 'progress'::text, 'done'::text]));

ALTER TABLE public.queue
  ADD CONSTRAINT queue_tab_check CHECK (tab = ANY (ARRAY['watch'::text, 'listen'::text, 'read'::text, 'explore'::text]));

ALTER TABLE public.queue
  ADD CONSTRAINT queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.queue TO anon;

GRANT ALL ON public.queue TO authenticated;

GRANT ALL ON public.queue TO service_role;

CREATE INDEX queue_user_tab_idx ON public.queue (user_id, tab);

CREATE TRIGGER queue_updated_at
  BEFORE UPDATE ON public.queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "queue: owner only" ON public.queue
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.ratings (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  title      text                     NOT NULL,
  category   text                     NOT NULL,
  rating     smallint                 NOT NULL,
  notes      text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.ratings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);

ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_rating_check CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE public.ratings
  ADD CONSTRAINT ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.ratings TO anon;

GRANT ALL ON public.ratings TO authenticated;

GRANT ALL ON public.ratings TO service_role;

CREATE INDEX ratings_user_rating_idx ON public.ratings (user_id, rating DESC);

CREATE INDEX ratings_user_category_idx ON public.ratings (user_id, category);

CREATE TRIGGER ratings_updated_at
  BEFORE UPDATE ON public.ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "ratings: owner only" ON public.ratings
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.soul_links (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  soul_id    uuid                     NOT NULL,
  table_name text                     NOT NULL,
  item_id    uuid                     NOT NULL,
  item_title text                     NOT NULL,
  item_meta  text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.soul_links
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.soul_links
  ADD CONSTRAINT soul_links_pkey PRIMARY KEY (id);

GRANT ALL ON public.soul_links TO anon;

GRANT ALL ON public.soul_links TO authenticated;

GRANT ALL ON public.soul_links TO service_role;

CREATE INDEX soul_links_item_idx ON public.soul_links (table_name, item_id);

CREATE INDEX soul_links_soul_id_idx ON public.soul_links (soul_id);

CREATE POLICY "user owns soul_links" ON public.soul_links
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.soul_media (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  soul_id    uuid                     NOT NULL,
  kind       text                     NOT NULL,
  title      text                     NOT NULL,
  meta       text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.soul_media
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.soul_media
  ADD CONSTRAINT soul_media_kind_check CHECK (kind = ANY (ARRAY['show'::text, 'music'::text, 'book'::text, 'film'::text, 'other'::text]));

ALTER TABLE public.soul_media
  ADD CONSTRAINT soul_media_pkey PRIMARY KEY (id);

ALTER TABLE public.soul_media
  ADD CONSTRAINT soul_media_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.soul_media TO anon;

GRANT ALL ON public.soul_media TO authenticated;

GRANT ALL ON public.soul_media TO service_role;

CREATE INDEX soul_media_soul_idx ON public.soul_media (soul_id);

CREATE POLICY "soul_media: owner only" ON public.soul_media
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "soul_media: user owns" ON public.soul_media
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE TABLE public.souls (
  id          uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id     uuid                     DEFAULT auth.uid() NOT NULL,
  name        text                     NOT NULL,
  emoji       text                     DEFAULT '✨'::text NOT NULL,
  color       text                     DEFAULT '#ff8c00'::text NOT NULL,
  role        text,
  since       text,
  description text,
  notes       text,
  tags        text[]                   DEFAULT '{}'::text[] NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL,
  image_url   text
);

ALTER TABLE public.souls
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.souls
  ADD CONSTRAINT souls_pkey PRIMARY KEY (id);

ALTER TABLE public.journal_entry_souls
  ADD CONSTRAINT journal_entry_souls_soul_id_fkey FOREIGN KEY (soul_id) REFERENCES public.souls(id) ON DELETE CASCADE;

ALTER TABLE public.soul_links
  ADD CONSTRAINT soul_links_soul_id_fkey FOREIGN KEY (soul_id) REFERENCES public.souls(id) ON DELETE CASCADE;

ALTER TABLE public.soul_media
  ADD CONSTRAINT soul_media_soul_id_fkey FOREIGN KEY (soul_id) REFERENCES public.souls(id) ON DELETE CASCADE;

ALTER TABLE public.souls
  ADD CONSTRAINT souls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.souls TO anon;

GRANT ALL ON public.souls TO authenticated;

GRANT ALL ON public.souls TO service_role;

CREATE INDEX souls_user_idx ON public.souls (user_id);

CREATE TRIGGER souls_updated_at
  BEFORE UPDATE ON public.souls
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "souls: owner only" ON public.souls
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "souls: user owns" ON public.souls
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE TABLE public.tasks (
  id           uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id      uuid                     DEFAULT auth.uid() NOT NULL,
  text         text                     NOT NULL,
  done         boolean                  DEFAULT false NOT NULL,
  done_at      date,
  priority     text                     DEFAULT 'medium'::text NOT NULL,
  due_date     date,
  created_date date                     DEFAULT CURRENT_DATE NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.tasks
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check CHECK (priority = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]));

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.tasks TO anon;

GRANT ALL ON public.tasks TO authenticated;

GRANT ALL ON public.tasks TO service_role;

CREATE INDEX tasks_user_done_idx ON public.tasks (user_id, done);

CREATE INDEX tasks_overdue_idx ON public.tasks (user_id, due_date)
  WHERE done = false AND due_date IS NOT NULL;

CREATE INDEX tasks_user_due_idx ON public.tasks (user_id, due_date);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "tasks: owner only" ON public.tasks
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE TABLE public.user_settings (
  user_id             uuid                     NOT NULL,
  first_login         boolean                  DEFAULT true NOT NULL,
  theme_bg            text                     DEFAULT '#0d0a0f'::text NOT NULL,
  theme_accent        text                     DEFAULT '#ff8c00'::text NOT NULL,
  theme_secondary     text                     DEFAULT '#7c3aed'::text NOT NULL,
  theme_text          text                     DEFAULT '#f5e6d0'::text NOT NULL,
  theme_font          text                     DEFAULT '''Comic Sans MS'', cursive'::text NOT NULL,
  theme_font_size     integer                  DEFAULT 13 NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL,
  password_reset_done boolean                  DEFAULT false,
  first_login_done    boolean                  DEFAULT false
);

ALTER TABLE public.user_settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_theme_font_size_check CHECK (theme_font_size >= 9 AND theme_font_size <= 24);

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.user_settings TO anon;

GRANT ALL ON public.user_settings TO authenticated;

GRANT ALL ON public.user_settings TO service_role;

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "user_settings: owner only" ON public.user_settings
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE VIEW public.overdue_tasks WITH (security_invoker=true) AS SELECT id,
    user_id,
    text,
    done,
    done_at,
    priority,
    due_date,
    created_date,
    created_at,
    updated_at
   FROM public.tasks
  WHERE ((done = false) AND (due_date IS NOT NULL) AND (due_date < CURRENT_DATE));

GRANT ALL ON public.overdue_tasks TO anon;

GRANT ALL ON public.overdue_tasks TO authenticated;

GRANT ALL ON public.overdue_tasks TO service_role;

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
