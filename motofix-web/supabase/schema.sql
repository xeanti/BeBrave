-- ============================================
-- MotoFix Database Schema (Supabase / PostgreSQL)
-- ============================================
-- Run this in: Supabase Dashboard > SQL Editor > New Query

-- ─────────────────────────────────────────
-- 1. PROFILES TABLE
-- Extends Supabase's built-in auth.users table
-- ─────────────────────────────────────────
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'mechanic', 'admin')),

  -- Motorcycle info (for customers)
  moto_make text,
  moto_model text,
  moto_year int,
  moto_photo_url text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table profiles enable row level security;

-- Policy: Users can view their own profile
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

-- Policy: Users can update their own profile
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- Policy: Users can insert their own profile (on signup)
create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Policy: Admins can view all profiles
-- Helper function to check admin role without recursive RLS lookups
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- Policy: Admins can view all profiles
create policy "Admins can view all profiles"
  on profiles for select
  using (public.is_admin());


-- ─────────────────────────────────────────
-- 2. AUTO-CREATE PROFILE ON SIGNUP (trigger)
-- Backup in case the frontend insert is skipped
-- ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email,
    new.raw_user_meta_data->>'phone',
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─────────────────────────────────────────
-- 3. MOTORCYCLE MODELS TABLE (catalog reference photos)
-- ─────────────────────────────────────────
create table if not exists motorcycle_models (
  id uuid default gen_random_uuid() primary key,
  make text not null,        -- e.g., 'Yamaha'
  model text not null,       -- e.g., 'Aerox 155'
  year_range text,           -- e.g., '2021-2024'
  reference_photo_url text not null,
  created_at timestamptz default now(),
  unique (make, model)
);

alter table motorcycle_models enable row level security;

create policy "Anyone can view motorcycle models"
  on motorcycle_models for select
  using (true);

create policy "Admins can manage motorcycle models"
  on motorcycle_models for all
  using (public.is_admin());
alter table services enable row level security;

create policy "Anyone can view active services"
  on services for select
  using (is_active = true);

create policy "Admins can manage services"
  on services for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );


-- ─────────────────────────────────────────
-- 4. BOOKINGS TABLE
-- ─────────────────────────────────────────
create table if not exists bookings (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid references profiles(id) on delete cascade not null,
  mechanic_id uuid references profiles(id) on delete set null,
  service_id uuid references services(id) on delete set null,

  booking_date date not null,
  booking_time time not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),

  notes text,
  down_payment numeric(10,2) default 0,
  total_amount numeric(10,2) default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bookings enable row level security;

-- Customers can view/create/update their own bookings
create policy "Customers can view own bookings"
  on bookings for select
  using (auth.uid() = customer_id);

create policy "Customers can create bookings"
  on bookings for insert
  with check (auth.uid() = customer_id);

create policy "Customers can update own pending bookings"
  on bookings for update
  using (auth.uid() = customer_id and status = 'pending');

-- Mechanics can view bookings assigned to them
create policy "Mechanics can view assigned bookings"
  on bookings for select
  using (auth.uid() = mechanic_id);

-- Mechanics can update status of their assigned bookings
create policy "Mechanics can update assigned bookings"
  on bookings for update
  using (auth.uid() = mechanic_id);

-- Admins can do everything
create policy "Admins can manage all bookings"
  on bookings for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );


-- ─────────────────────────────────────────
-- 5. PARTS / INVENTORY TABLE
-- ─────────────────────────────────────────
create table if not exists parts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  category text, -- e.g., 'exhaust', 'headlight', 'rims', 'mirrors'
  compatible_models text[], -- array of compatible motorcycle models
  price numeric(10,2) not null default 0,
  stock_quantity int not null default 0,
  reorder_threshold int default 5,
  last_restock_date date,
  image_url text,
  created_at timestamptz default now()
);

alter table parts enable row level security;

create policy "Anyone can view parts"
  on parts for select
  using (true);

create policy "Admins can manage parts"
  on parts for all
  using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );


-- ─────────────────────────────────────────
-- 6. CUSTOMIZATIONS TABLE (saved AI previews)
-- ─────────────────────────────────────────
create table if not exists customizations (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid references profiles(id) on delete cascade not null,
  part_ids uuid[], -- selected parts
  original_photo_url text not null,
  preview_image_url text, -- AI-generated result
  prompt_used text,
  status text default 'generated' check (status in ('generated', 'saved', 'failed')),
  created_at timestamptz default now()
);

alter table customizations enable row level security;

create policy "Customers can view own customizations"
  on customizations for select
  using (auth.uid() = customer_id);

create policy "Customers can create customizations"
  on customizations for insert
  with check (auth.uid() = customer_id);

create policy "Customers can update own customizations"
  on customizations for update
  using (auth.uid() = customer_id);


-- ─────────────────────────────────────────
-- 7. CHAT TABLES
-- ─────────────────────────────────────────
create table if not exists chat_conversations (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid references profiles(id) on delete cascade not null,
  staff_id uuid references profiles(id) on delete set null,
  status text default 'open' check (status in ('open', 'closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists chat_messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references chat_conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
  message text not null,
  is_bot boolean default false,
  created_at timestamptz default now()
);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

create policy "Participants can view conversation"
  on chat_conversations for select
  using (auth.uid() = customer_id or auth.uid() = staff_id);

create policy "Customers can create conversation"
  on chat_conversations for insert
  with check (auth.uid() = customer_id);

create policy "Participants can view messages"
  on chat_messages for select
  using (
    exists (
      select 1 from chat_conversations c
      where c.id = conversation_id
      and (c.customer_id = auth.uid() or c.staff_id = auth.uid())
    )
  );

create policy "Participants can send messages"
  on chat_messages for insert
  with check (
    exists (
      select 1 from chat_conversations c
      where c.id = conversation_id
      and (c.customer_id = auth.uid() or c.staff_id = auth.uid())
    )
  );


-- ─────────────────────────────────────────
-- 8. STORAGE BUCKETS (run separately if needed)
-- ─────────────────────────────────────────
-- Go to Supabase Dashboard > Storage > Create a new bucket:
--   - Name: "motorcycle-photos"  (public: true)
--   - Name: "ai-previews"        (public: true)
