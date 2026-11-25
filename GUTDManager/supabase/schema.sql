create table public.band_spaces (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table public.band_members (
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null default 'member' check (role in ('owner', 'manager', 'member')),
    joined_at timestamptz not null default now(),
    primary key (band_id, user_id)
);

create table public.band_invites (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    created_by uuid not null references auth.users(id) on delete cascade,
    expires_at timestamptz not null default now() + interval '14 days',
    created_at timestamptz not null default now()
);

create or replace function public.is_band_member(target_band_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.band_members
        where band_id = target_band_id
          and user_id = auth.uid()
    );
$$;

create or replace function public.is_band_manager(target_band_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1
        from public.band_members
        where band_id = target_band_id
          and user_id = auth.uid()
          and role in ('owner', 'manager')
    );
$$;

create or replace function public.add_band_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    insert into public.band_members (band_id, user_id, role)
    values (new.id, new.created_by, 'owner');
    return new;
end;
$$;

create or replace function public.join_band_with_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    target_band_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Sign in before joining a band.';
    end if;

    select band_id into target_band_id
    from public.band_invites
    where band_invites.invite_code = upper(trim(p_invite_code))
      and expires_at > now();

    if target_band_id is null then
        raise exception 'This invite code is invalid or expired.';
    end if;

    insert into public.band_members (band_id, user_id, role)
    values (target_band_id, auth.uid(), 'member')
    on conflict (band_id, user_id) do nothing;

    return target_band_id;
end;
$$;

create trigger band_creator_membership
after insert on public.band_spaces
for each row execute function public.add_band_creator_as_owner();

create table public.band_messages (
    id bigint generated always as identity primary key,
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    sender_id uuid not null references auth.users(id) on delete cascade,
    sender_email text not null,
    body text not null check (char_length(body) between 1 and 4000),
    created_at timestamptz not null default now()
);

create table public.band_events (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    title text not null,
    starts_at timestamptz not null,
    location text not null default '',
    notes text not null default '',
    created_at timestamptz not null default now()
);

create table public.band_tasks (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    title text not null,
    details text not null default '',
    assigned_to uuid references auth.users(id) on delete set null,
    due_at timestamptz,
    status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
    created_at timestamptz not null default now()
);

create table public.band_contacts (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    name text not null,
    organization text not null default '',
    category text not null default 'venue',
    email text not null default '',
    phone text not null default '',
    notes text not null default '',
    created_at timestamptz not null default now()
);

create table public.band_songs (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    title text not null,
    notes text not null default '',
    created_at timestamptz not null default now()
);

create table public.band_setlists (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    title text not null,
    event_id uuid references public.band_events(id) on delete set null,
    created_at timestamptz not null default now()
);

create table public.band_setlist_songs (
    setlist_id uuid not null references public.band_setlists(id) on delete cascade,
    song_id uuid not null references public.band_songs(id) on delete cascade,
    position integer not null check (position > 0),
    primary key (setlist_id, song_id),
    unique (setlist_id, position)
);

create table public.merch_inventory (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    item_name text not null,
    quantity integer not null default 0 check (quantity >= 0),
    unit_price numeric(10, 2) not null default 0 check (unit_price >= 0),
    updated_at timestamptz not null default now()
);

create table public.fan_updates (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    title text not null,
    body text not null,
    publish_at timestamptz,
    created_at timestamptz not null default now()
);

create table public.content_posts (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    platform text not null,
    caption text not null default '',
    scheduled_at timestamptz,
    status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
    created_at timestamptz not null default now()
);

create table public.band_files (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    storage_path text not null,
    file_name text not null,
    uploaded_by uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

create table public.band_expenses (
    id uuid primary key default gen_random_uuid(),
    band_id uuid not null references public.band_spaces(id) on delete cascade,
    description text not null,
    amount numeric(10, 2) not null check (amount >= 0),
    currency char(3) not null default 'USD',
    occurred_on date not null default current_date,
    paid_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.band_spaces enable row level security;
alter table public.band_members enable row level security;
alter table public.band_invites enable row level security;
alter table public.band_messages enable row level security;
alter table public.band_events enable row level security;
alter table public.band_tasks enable row level security;
alter table public.band_contacts enable row level security;
alter table public.band_songs enable row level security;
alter table public.band_setlists enable row level security;
alter table public.band_setlist_songs enable row level security;
alter table public.merch_inventory enable row level security;
alter table public.fan_updates enable row level security;
alter table public.content_posts enable row level security;
alter table public.band_files enable row level security;
alter table public.band_expenses enable row level security;

create policy "Members can read their bands"
on public.band_spaces for select to authenticated
using (public.is_band_member(id));

create policy "Users can create a band"
on public.band_spaces for insert to authenticated
with check (created_by = auth.uid());

create policy "Band managers can update their bands"
on public.band_spaces for update to authenticated
using (public.is_band_manager(id))
with check (public.is_band_manager(id));

create policy "Members can read their membership"
on public.band_members for select to authenticated
using (public.is_band_member(band_id));

create policy "Managers can add members"
on public.band_members for insert to authenticated
with check (public.is_band_manager(band_id));

create policy "Managers can update members"
on public.band_members for update to authenticated
using (public.is_band_manager(band_id))
with check (public.is_band_manager(band_id));

create policy "Managers can remove members"
on public.band_members for delete to authenticated
using (public.is_band_manager(band_id));

create policy "Managers can read invites"
on public.band_invites for select to authenticated
using (public.is_band_manager(band_id));

create policy "Managers can create invites"
on public.band_invites for insert to authenticated
with check (
    public.is_band_manager(band_id)
    and created_by = auth.uid()
);

create policy "Members can read band messages"
on public.band_messages for select to authenticated
using (public.is_band_member(band_id));

create policy "Members can send messages as themselves"
on public.band_messages for insert to authenticated
with check (
    public.is_band_member(band_id)
    and sender_id = auth.uid()
);

create policy "Members can read band files"
on public.band_files for select to authenticated
using (public.is_band_member(band_id));

create policy "Members can add their own band files"
on public.band_files for insert to authenticated
with check (
    public.is_band_member(band_id)
    and uploaded_by = auth.uid()
);

create policy "Members can update band files"
on public.band_files for update to authenticated
using (public.is_band_member(band_id))
with check (public.is_band_member(band_id));

create policy "Managers can delete band files"
on public.band_files for delete to authenticated
using (public.is_band_manager(band_id));

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'band_events', 'band_tasks', 'band_contacts',
        'band_songs', 'band_setlists', 'merch_inventory', 'fan_updates',
        'content_posts', 'band_expenses'
    ]
    loop
        execute format(
            'create policy "Members can read %1$s" on public.%1$I for select to authenticated using (public.is_band_member(band_id))',
            table_name
        );
        execute format(
            'create policy "Members can add %1$s" on public.%1$I for insert to authenticated with check (public.is_band_member(band_id))',
            table_name
        );
        execute format(
            'create policy "Members can update %1$s" on public.%1$I for update to authenticated using (public.is_band_member(band_id)) with check (public.is_band_member(band_id))',
            table_name
        );
        execute format(
            'create policy "Managers can delete %1$s" on public.%1$I for delete to authenticated using (public.is_band_manager(band_id))',
            table_name
        );
    end loop;
end;
$$;

create policy "Members can read setlist songs"
on public.band_setlist_songs for select to authenticated
using (
    exists (
        select 1 from public.band_setlists s
        where s.id = setlist_id and public.is_band_member(s.band_id)
    )
);

create policy "Members can manage setlist songs"
on public.band_setlist_songs for all to authenticated
using (
    exists (
        select 1 from public.band_setlists s
        where s.id = setlist_id and public.is_band_member(s.band_id)
    )
)
with check (
    exists (
        select 1 from public.band_setlists s
        join public.band_songs songs on songs.id = song_id
        where s.id = setlist_id
          and s.band_id = songs.band_id
          and public.is_band_member(s.band_id)
    )
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
    public.band_spaces,
    public.band_members,
    public.band_invites,
    public.band_messages,
    public.band_events,
    public.band_tasks,
    public.band_contacts,
    public.band_songs,
    public.band_setlists,
    public.band_setlist_songs,
    public.merch_inventory,
    public.fan_updates,
    public.content_posts,
    public.band_files,
    public.band_expenses
to authenticated;
grant usage, select on sequence public.band_messages_id_seq to authenticated;
revoke all on function public.is_band_member(uuid) from public, anon;
revoke all on function public.is_band_manager(uuid) from public, anon;
revoke all on function public.add_band_creator_as_owner() from public, anon, authenticated;
grant execute on function public.is_band_member(uuid) to authenticated;
grant execute on function public.is_band_manager(uuid) to authenticated;
revoke all on function public.join_band_with_invite(text) from public, anon;
grant execute on function public.join_band_with_invite(text) to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'band_messages'
    ) then
        alter publication supabase_realtime add table public.band_messages;
    end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('band-files', 'band-files', false)
on conflict (id) do nothing;

create policy "Band members can access their stored files"
on storage.objects for select to authenticated
using (
    bucket_id = 'band-files'
    and public.is_band_member((storage.foldername(name))[1]::uuid)
);

create policy "Band members can upload their stored files"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'band-files'
    and public.is_band_member((storage.foldername(name))[1]::uuid)
);
