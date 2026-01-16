-- Create enum for account member roles
CREATE TYPE public.account_role AS ENUM ('owner', 'member');

-- Create enum for subscription status
CREATE TYPE public.subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing', 'inactive');

-- Create accounts table (organizations/workspaces)
CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'My Church',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status subscription_status NOT NULL DEFAULT 'inactive',
    subscription_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create account_members table (team members)
CREATE TABLE public.account_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role account_role NOT NULL DEFAULT 'member',
    invited_email TEXT,
    invited_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (account_id, user_id)
);

-- Create account_invites table for pending invitations
CREATE TABLE public.account_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (account_id, email)
);

-- Create sermons table (only for Unlimited users)
CREATE TABLE public.sermons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    scripture_reference TEXT,
    slides JSONB NOT NULL DEFAULT '[]'::jsonb,
    background_settings JSONB,
    font_settings JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sermons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is member of an account
CREATE OR REPLACE FUNCTION public.is_account_member(_user_id UUID, _account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.account_members
        WHERE user_id = _user_id AND account_id = _account_id
    )
$$;

-- Security definer function to check if user is owner of an account
CREATE OR REPLACE FUNCTION public.is_account_owner(_user_id UUID, _account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.account_members
        WHERE user_id = _user_id AND account_id = _account_id AND role = 'owner'
    )
$$;

-- Function to get user's account ID
CREATE OR REPLACE FUNCTION public.get_user_account_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT account_id FROM public.account_members WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for accounts
CREATE POLICY "Users can view their own account"
ON public.accounts FOR SELECT
TO authenticated
USING (public.is_account_member(auth.uid(), id));

CREATE POLICY "Owners can update their account"
ON public.accounts FOR UPDATE
TO authenticated
USING (public.is_account_owner(auth.uid(), id));

-- RLS Policies for account_members
CREATE POLICY "Members can view their account members"
ON public.account_members FOR SELECT
TO authenticated
USING (public.is_account_member(auth.uid(), account_id));

CREATE POLICY "Owners can insert account members"
ON public.account_members FOR INSERT
TO authenticated
WITH CHECK (public.is_account_owner(auth.uid(), account_id));

CREATE POLICY "Owners can delete account members"
ON public.account_members FOR DELETE
TO authenticated
USING (public.is_account_owner(auth.uid(), account_id) AND role != 'owner');

-- RLS Policies for account_invites
CREATE POLICY "Owners can manage invites"
ON public.account_invites FOR ALL
TO authenticated
USING (public.is_account_owner(auth.uid(), account_id));

CREATE POLICY "Anyone can view invites by token"
ON public.account_invites FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for sermons
CREATE POLICY "Members can view account sermons"
ON public.sermons FOR SELECT
TO authenticated
USING (public.is_account_member(auth.uid(), account_id));

CREATE POLICY "Members can create sermons"
ON public.sermons FOR INSERT
TO authenticated
WITH CHECK (public.is_account_member(auth.uid(), account_id));

CREATE POLICY "Members can update account sermons"
ON public.sermons FOR UPDATE
TO authenticated
USING (public.is_account_member(auth.uid(), account_id));

CREATE POLICY "Members can delete account sermons"
ON public.sermons FOR DELETE
TO authenticated
USING (public.is_account_member(auth.uid(), account_id));

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON public.accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sermons_updated_at
    BEFORE UPDATE ON public.sermons
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_account_members_user_id ON public.account_members(user_id);
CREATE INDEX idx_account_members_account_id ON public.account_members(account_id);
CREATE INDEX idx_sermons_account_id ON public.sermons(account_id);
CREATE INDEX idx_sermons_created_by ON public.sermons(created_by_user_id);
CREATE INDEX idx_account_invites_token ON public.account_invites(token);
CREATE INDEX idx_account_invites_email ON public.account_invites(email);