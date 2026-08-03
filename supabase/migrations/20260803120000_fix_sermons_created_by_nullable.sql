-- sermons.created_by_user_id was NOT NULL but its FK action is ON DELETE SET NULL,
-- a self-contradicting constraint: deleting a user who has created any sermon
-- fails the NOT NULL check and aborts the whole auth.users delete transaction.
-- account_id (ON DELETE CASCADE from accounts) is what actually anchors a
-- presentation to its org; created_by_user_id is just attribution, so it's
-- safe to let it go null when the creating user's account is deleted.
alter table public.sermons alter column created_by_user_id drop not null;
