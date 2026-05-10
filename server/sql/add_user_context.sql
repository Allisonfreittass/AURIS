-- Add a free-text "context about me" column to profiles. Auris injects
-- this into the user message of every ask, so it adapts the tone and
-- focus to the user's profession / domain ("sou advogado tributarista",
-- "sou médico cardiologista", "sou vendedor B2B SaaS", etc.).
--
-- Storing as plain text on the profiles row keeps it user-private (RLS
-- already restricts access to `auth.uid() = id`) and easy to edit from
-- the desktop without a separate settings table.

alter table public.profiles
  add column if not exists user_context text;

-- Loosen RLS so users can update their own user_context. The existing
-- "users update own profile" policy already allows it because we set
-- USING(auth.uid() = id), but Supabase needs a WITH CHECK clause too
-- on UPDATE — re-create the policy idempotently.

drop policy if exists "users update own profile" on public.profiles;

create policy "users update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
