-- A session must select an exact membership when a user has more than one
-- workspace/role context. The composite FK prevents selecting another user's
-- membership even if an ID is guessed.

alter table public.workspace_memberships
  add constraint uq_workspace_memberships_id_user unique (id, user_id);

alter table public.app_sessions
  add column active_membership_id uuid;

alter table public.app_sessions
  add constraint fk_app_sessions_active_membership_user
  foreign key (active_membership_id, user_id)
  references public.workspace_memberships(id, user_id)
  on delete restrict;

create index idx_app_sessions_active_membership
  on public.app_sessions(active_membership_id)
  where active_membership_id is not null;

comment on column public.app_sessions.active_membership_id is
  'Exact server-authorized workspace/role context. Null is allowed only until the user selects among multiple active memberships.';
