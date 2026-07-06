


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."accept_customer_consent"("p_consent_type" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_source_page" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid;
  v_id uuid;
  v_version text := '1.0';
  v_consent_text text;
begin
  v_customer_id := auth.uid();

  if v_customer_id is null then
    raise exception 'User must be logged in to accept consent.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_customer_id::text || ':' || p_consent_type || ':' || v_version)
  );

  v_consent_text :=
    case p_consent_type
      when 'terms_and_conditions' then
        'Customer agreed to the MotoFix Terms and Conditions.'
      when 'data_privacy' then
        'Customer agreed that MotoFix may process account, booking, order, motorcycle, payment, and service records for system operations.'
      when 'booking_policy' then
        'Customer agreed to MotoFix booking rules, confirmation process, cancellation policy, down payment policy, and no-show rules.'
      when 'checkout_policy' then
        'Customer agreed to MotoFix checkout, stock verification, order confirmation, payment validation, and pickup/release rules.'
      when 'ai_photo_processing' then
        'Customer agreed that MotoFix may process motorcycle photos and selected customization details for AI preview generation.'
      when 'notifications' then
        'Customer agreed to receive MotoFix system notifications.'
      else
        'Customer accepted MotoFix consent.'
    end;

  insert into public.customer_consents (
    customer_id,
    consent_type,
    consent_text,
    version,
    is_accepted,
    accepted_at,
    revoked_at,
    updated_at,
    metadata,
    source_page
  )
  values (
    v_customer_id,
    p_consent_type,
    v_consent_text,
    v_version,
    true,
    now(),
    null,
    now(),
    coalesce(p_metadata, '{}'::jsonb),
    p_source_page
  )
  on conflict (customer_id, consent_type, version)
  do update set
    consent_text = excluded.consent_text,
    is_accepted = true,
    accepted_at = now(),
    revoked_at = null,
    updated_at = now(),
    metadata = excluded.metadata,
    source_page = excluded.source_page
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."accept_customer_consent"("p_consent_type" "text", "p_metadata" "jsonb", "p_source_page" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text" DEFAULT '1.0'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_version text;
  v_consent_text text;
begin
  v_version := coalesce(p_version, '1.0');

  perform pg_advisory_xact_lock(
    hashtext(p_customer_id::text || ':' || p_consent_type || ':' || v_version)
  );

  v_consent_text :=
    case p_consent_type
      when 'terms_and_conditions' then
        'Customer agreed to the MotoFix Terms and Conditions.'
      when 'data_privacy' then
        'Customer agreed that MotoFix may process account, booking, order, motorcycle, payment, and service records for system operations.'
      when 'booking_policy' then
        'Customer agreed to MotoFix booking rules, confirmation process, cancellation policy, down payment policy, and no-show rules.'
      when 'checkout_policy' then
        'Customer agreed to MotoFix checkout, stock verification, order confirmation, payment validation, and pickup/release rules.'
      when 'ai_photo_processing' then
        'Customer agreed that MotoFix may process motorcycle photos and selected customization details for AI preview generation.'
      when 'notifications' then
        'Customer agreed to receive MotoFix system notifications.'
      else
        'Customer accepted MotoFix consent.'
    end;

  insert into public.customer_consents (
    customer_id,
    consent_type,
    consent_text,
    version,
    is_accepted,
    accepted_at,
    revoked_at,
    updated_at
  )
  values (
    p_customer_id,
    p_consent_type,
    v_consent_text,
    v_version,
    true,
    now(),
    null,
    now()
  )
  on conflict (customer_id, consent_type, version)
  do update set
    consent_text = excluded.consent_text,
    is_accepted = true,
    accepted_at = now(),
    revoked_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."accept_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."service_progress_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "mechanic_id" "uuid",
    "status" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "progress_percent" integer DEFAULT 0 NOT NULL,
    "event_type" "text" DEFAULT 'status_update'::"text" NOT NULL,
    "photo_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_progress_event_type_check" CHECK (("event_type" = ANY (ARRAY['status_update'::"text", 'mechanic_update'::"text", 'admin_update'::"text", 'system_update'::"text", 'customer_note'::"text"]))),
    CONSTRAINT "service_progress_percent_check" CHECK ((("progress_percent" >= 0) AND ("progress_percent" <= 100))),
    CONSTRAINT "service_progress_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'in_progress'::"text", 'inspection'::"text", 'repairing'::"text", 'quality_check'::"text", 'ready_for_pickup'::"text", 'completed'::"text", 'cancelled'::"text", 'rejected'::"text", 'no_show'::"text", 'note'::"text"])))
);


ALTER TABLE "public"."service_progress_events" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_service_progress_event"("p_booking_id" "uuid", "p_status" "text", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_progress_percent" integer DEFAULT NULL::integer, "p_event_type" "text" DEFAULT 'mechanic_update'::"text", "p_photo_url" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."service_progress_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_booking public.bookings%rowtype;
  v_event public.service_progress_events%rowtype;
  v_status text := coalesce(nullif(trim(p_status), ''), 'note');
  v_title text;
  v_description text;
  v_progress integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found.';
  end if;

  if coalesce(v_role, '') not in ('admin', 'staff')
     and v_booking.mechanic_id is distinct from v_user_id then
    raise exception 'Only admin, staff, or the assigned mechanic can add service progress.';
  end if;

  v_title := coalesce(nullif(trim(p_title), ''), public.get_service_progress_title(v_status));
  v_description := coalesce(nullif(trim(p_description), ''), public.get_service_progress_description(v_status));
  v_progress := coalesce(p_progress_percent, public.get_service_progress_percent(v_status));

  if v_progress < 0 or v_progress > 100 then
    raise exception 'Progress percent must be between 0 and 100.';
  end if;

  insert into public.service_progress_events (
    booking_id,
    customer_id,
    mechanic_id,
    status,
    title,
    description,
    progress_percent,
    event_type,
    photo_url,
    metadata,
    created_by
  )
  values (
    v_booking.id,
    v_booking.customer_id,
    v_booking.mechanic_id,
    v_status,
    v_title,
    v_description,
    v_progress,
    coalesce(p_event_type, 'mechanic_update'),
    p_photo_url,
    coalesce(p_metadata, '{}'::jsonb),
    v_user_id
  )
  returning * into v_event;

  return v_event;
end;
$$;


ALTER FUNCTION "public"."add_service_progress_event"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_to_cart"("p_user_id" "uuid", "p_part_id" "uuid", "p_quantity" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_stock integer;
  v_current_qty integer;
  v_add_qty integer;
begin
  v_add_qty := greatest(coalesce(p_quantity, 1), 1);

  if auth.uid() is null then
    raise exception 'Please login before adding items to your cart.';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'Unauthorized cart action.';
  end if;

  select stock_quantity
  into v_stock
  from public.parts
  where id = p_part_id
    and coalesce(is_active, true) = true;

  if v_stock is null then
    raise exception 'Product not found or inactive.';
  end if;

  if v_stock <= 0 then
    raise exception 'This product is out of stock.';
  end if;

  select quantity
  into v_current_qty
  from public.cart_items
  where user_id = p_user_id
    and part_id = p_part_id;

  if coalesce(v_current_qty, 0) + v_add_qty > v_stock then
    raise exception 'Stock limit reached. Only % item(s) available.', v_stock;
  end if;

  insert into public.cart_items (
    user_id,
    part_id,
    quantity,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_part_id,
    v_add_qty,
    now(),
    now()
  )
  on conflict (user_id, part_id)
  do update set
    quantity = public.cart_items.quantity + excluded.quantity,
    updated_at = now();
end;
$$;


ALTER FUNCTION "public"."add_to_cart"("p_user_id" "uuid", "p_part_id" "uuid", "p_quantity" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_part_stock"("p_part_id" "uuid", "p_movement_type" "text", "p_quantity" integer, "p_reason" "text" DEFAULT NULL::"text", "p_related_order_id" "uuid" DEFAULT NULL::"uuid", "p_related_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current_stock integer;
  v_new_stock integer;
  v_signed_quantity integer;
  v_user_id uuid;
  v_user_role text;
  v_movement_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be logged in to adjust stock.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id;

  if v_user_role not in ('admin', 'super_admin', 'staff', 'mechanic') then
    raise exception 'You are not allowed to adjust stock.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select stock_quantity
  into v_current_stock
  from public.parts
  where id = p_part_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  if p_movement_type in ('stock_in', 'released', 'refund_return') then
    v_signed_quantity := p_quantity;
  elsif p_movement_type in ('stock_out', 'reserved', 'used_service', 'sold_order', 'manual_adjustment') then
    v_signed_quantity := -p_quantity;
  else
    raise exception 'Invalid stock movement type: %', p_movement_type;
  end if;

  v_new_stock := v_current_stock + v_signed_quantity;

  if v_new_stock < 0 then
    raise exception 'Insufficient stock. Current stock: %, requested quantity: %',
      v_current_stock,
      p_quantity;
  end if;

  update public.parts
  set stock_quantity = v_new_stock
  where id = p_part_id;

  insert into public.inventory_movements (
    part_id,
    movement_type,
    quantity,
    previous_stock,
    new_stock,
    reason,
    related_order_id,
    related_booking_id,
    performed_by
  )
  values (
    p_part_id,
    p_movement_type,
    p_quantity,
    v_current_stock,
    v_new_stock,
    p_reason,
    p_related_order_id,
    p_related_booking_id,
    v_user_id
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'part_id', p_part_id,
    'movement_type', p_movement_type,
    'quantity', p_quantity,
    'previous_stock', v_current_stock,
    'new_stock', v_new_stock
  );
end;
$$;


ALTER FUNCTION "public"."adjust_part_stock"("p_part_id" "uuid", "p_movement_type" "text", "p_quantity" integer, "p_reason" "text", "p_related_order_id" "uuid", "p_related_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_services_recalculate_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_booking_service_total(OLD.booking_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_booking_service_total(NEW.booking_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."booking_services_recalculate_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_time_to_minutes"("p_booking_time" time without time zone) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select (extract(hour from p_booking_time)::integer * 60)
       + extract(minute from p_booking_time)::integer;
$$;


ALTER FUNCTION "public"."booking_time_to_minutes"("p_booking_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_admin_portal"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
    and role in ('mechanic', 'staff', 'admin', 'super_admin')
  );
$$;


ALTER FUNCTION "public"."can_access_admin_portal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_user_role"("target_user_id" "uuid", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  actor_role text;
  target_old_role text;
begin
  select role
  into actor_role
  from public.profiles
  where id = auth.uid();

  if actor_role is distinct from 'super_admin' then
    raise exception 'Only super admins can change user roles.';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own role.';
  end if;

  if new_role not in (
    'customer',
    'mechanic',
    'staff',
    'admin',
    'super_admin'
  ) then
    raise exception 'Invalid role.';
  end if;

  select role
  into target_old_role
  from public.profiles
  where id = target_user_id;

  if target_old_role is null then
    raise exception 'Target user not found.';
  end if;

  if target_old_role = 'super_admin' and new_role <> 'super_admin' then
    raise exception 'Super admins cannot be demoted through this action.';
  end if;

  update public.profiles
  set role = new_role
  where id = target_user_id;

  insert into public.role_audit_logs (
    actor_id,
    target_user_id,
    old_role,
    new_role,
    action,
    notes
  )
  values (
    auth.uid(),
    target_user_id,
    target_old_role,
    new_role,
    'role_change',
    'Role changed through secure RPC function.'
  );
end;
$$;


ALTER FUNCTION "public"."change_user_role"("target_user_id" "uuid", "new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_booking_slot_available"("p_booking_date" "date", "p_booking_time" time without time zone, "p_duration_minutes" integer, "p_mechanic_id" "uuid" DEFAULT NULL::"uuid", "p_exclude_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("available" boolean, "reason" "text", "conflict_count" integer, "conflicts" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start timestamp;
  v_end timestamp;
  v_duration integer;
  v_conflict_count integer;
  v_conflicts jsonb;
begin
  v_duration := greatest(coalesce(p_duration_minutes, 60), 30);

  -- date + time returns timestamp in PostgreSQL.
  v_start := p_booking_date + p_booking_time;
  v_end := v_start + make_interval(mins => v_duration);

  with existing_bookings as (
    select
      b.id,
      b.booking_date::date as booking_date,
      b.booking_time::time as booking_time,
      b.status,
      b.mechanic_id,
      b.customer_id,
      b.services_summary,
      coalesce(
        nullif(b.estimated_duration_minutes, 0),
        nullif(
          sum(
            coalesce(
              bs.estimated_duration_minutes,
              service_from_booking_services.estimated_duration_minutes,
              60
            ) * greatest(coalesce(bs.quantity, 1), 1)
          ),
          0
        ),
        max(main_service.estimated_duration_minutes),
        60
      )::integer as duration_minutes,
      coalesce(
        b.services_summary,
        string_agg(coalesce(bs.service_name, service_from_booking_services.name), ', '),
        max(main_service.name),
        'Service'
      ) as service_name
    from public.bookings b
    left join public.booking_services bs
      on bs.booking_id = b.id
    left join public.services service_from_booking_services
      on service_from_booking_services.id = bs.service_id
    left join public.services main_service
      on main_service.id = b.service_id
    where b.booking_date::date = p_booking_date
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and coalesce(b.is_walkin, false) = false
      and lower(coalesce(b.status, 'pending')) in (
        'pending',
        'confirmed',
        'in_progress',
        'inspection',
        'repairing',
        'quality_check',
        'ready_for_pickup'
      )
      and (
        p_mechanic_id is null
        or b.mechanic_id = p_mechanic_id
        or b.mechanic_id is null
      )
      and b.booking_time is not null
    group by b.id
  ),
  overlap_rows as (
    select
      eb.*,
      (eb.booking_date + eb.booking_time) as existing_start,
      (
        eb.booking_date
        + eb.booking_time
        + make_interval(mins => greatest(coalesce(eb.duration_minutes, 60), 30))
      ) as existing_end
    from existing_bookings eb
    where
      v_start <
      (
        eb.booking_date
        + eb.booking_time
        + make_interval(mins => greatest(coalesce(eb.duration_minutes, 60), 30))
      )
      and
      v_end > (eb.booking_date + eb.booking_time)
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', overlap_rows.id,
          'booking_date', overlap_rows.booking_date,
          'booking_time', overlap_rows.booking_time,
          'status', overlap_rows.status,
          'mechanic_id', overlap_rows.mechanic_id,
          'service_name', overlap_rows.service_name,
          'duration_minutes', overlap_rows.duration_minutes,
          'existing_start', overlap_rows.existing_start,
          'existing_end', overlap_rows.existing_end
        )
        order by overlap_rows.existing_start
      ),
      '[]'::jsonb
    )
  into v_conflict_count, v_conflicts
  from overlap_rows;

  if v_conflict_count > 0 then
    return query select
      false,
      'Selected time overlaps with an existing booking. Please choose another time.'::text,
      v_conflict_count,
      v_conflicts;
    return;
  end if;

  return query select
    true,
    'Available'::text,
    0,
    '[]'::jsonb;
end;
$$;


ALTER FUNCTION "public"."check_booking_slot_available"("p_booking_date" "date", "p_booking_time" time without time zone, "p_duration_minutes" integer, "p_mechanic_id" "uuid", "p_exclude_booking_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "mechanic_id" "uuid",
    "service_id" "uuid",
    "booking_date" "date" NOT NULL,
    "booking_time" time without time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "down_payment" numeric(10,2) DEFAULT 0,
    "total_amount" numeric(10,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text",
    "payment_received" boolean DEFAULT false,
    "payment_received_at" timestamp with time zone,
    "payment_received_by" "uuid",
    "is_walkin" boolean DEFAULT false,
    "created_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancel_reason" "text",
    "reschedule_count" integer DEFAULT 0,
    "last_rescheduled_at" timestamp with time zone,
    "no_show_at" timestamp with time zone,
    "no_show_marked_by" "uuid",
    "penalty_amount" numeric DEFAULT 0,
    "refund_status" "text" DEFAULT 'none'::"text",
    "payment_status" "text" DEFAULT 'unpaid'::"text",
    "payment_reference" "text",
    "reservation_fee" numeric(10,2) DEFAULT 0,
    "paymongo_checkout_session_id" "text",
    "paid_at" timestamp with time zone,
    "walkin_customer_name" "text",
    "walkin_customer_phone" "text",
    "parts_stock_deducted_at" timestamp with time zone,
    "inventory_restored_at" timestamp with time zone,
    "inventory_restored_by" "uuid",
    "parts_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "product_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "parts_used" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "products" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "service_total" numeric(12,2) DEFAULT 0,
    "services_summary" "text",
    "estimated_duration_minutes" integer,
    CONSTRAINT "bookings_payment_method_check" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['paymongo_qrph'::"text", 'qrph'::"text", 'paymongo'::"text", 'gcash_manual'::"text", 'manual_gcash'::"text", 'personal_gcash'::"text", 'cash_at_shop'::"text", 'cash'::"text", 'gcash'::"text", 'bank_transfer'::"text", 'counter'::"text"])))),
    CONSTRAINT "bookings_payment_status_check" CHECK ((("payment_status" IS NULL) OR ("payment_status" = ANY (ARRAY['unpaid'::"text", 'checkout_created'::"text", 'pending_payment'::"text", 'pending_verification'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text", 'refunded'::"text"])))),
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'in_progress'::"text", 'inspection'::"text", 'repairing'::"text", 'quality_check'::"text", 'ready_for_pickup'::"text", 'completed'::"text", 'cancelled'::"text", 'rejected'::"text", 'no_show'::"text"]))),
    CONSTRAINT "bookings_walkin_customer_phone_check" CHECK ((("walkin_customer_phone" IS NULL) OR ("walkin_customer_phone" = ''::"text") OR ("walkin_customer_phone" ~ '^09[0-9]{9}$'::"text")))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_with_conflict_check"("p_service_id" "uuid", "p_mechanic_id" "uuid" DEFAULT NULL::"uuid", "p_booking_date" "date" DEFAULT NULL::"date", "p_booking_time" time without time zone DEFAULT NULL::time without time zone, "p_notes" "text" DEFAULT ''::"text", "p_down_payment" numeric DEFAULT 0) RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if p_service_id is null then
    raise exception 'Service is required.';
  end if;

  if p_booking_date is null then
    raise exception 'Booking date is required.';
  end if;

  if p_booking_time is null then
    raise exception 'Booking time is required.';
  end if;

  if p_booking_date < current_date then
    raise exception 'Booking date cannot be in the past.';
  end if;

  if p_booking_time < time '08:00' or p_booking_time >= time '17:00' then
    raise exception 'Booking time must be within shop hours, 8:00 AM to 5:00 PM.';
  end if;

  if (
    public.booking_time_to_minutes(p_booking_time)
    + public.get_booking_duration_minutes(p_service_id)
  ) > (17 * 60) then
    raise exception 'The selected service must finish before 5:00 PM.';
  end if;

  if public.has_booking_conflict(
    null,
    p_mechanic_id,
    p_service_id,
    p_booking_date,
    p_booking_time
  ) then
    raise exception
      'Booking conflict: this mechanic already has an active booking that overlaps with the selected date and time.'
      using errcode = '23505';
  end if;

  insert into public.bookings (
    customer_id,
    service_id,
    mechanic_id,
    booking_date,
    booking_time,
    notes,
    status,
    down_payment
  )
  values (
    v_user_id,
    p_service_id,
    p_mechanic_id,
    p_booking_date,
    p_booking_time,
    coalesce(p_notes, ''),
    'pending',
    coalesce(p_down_payment, 0)
  )
  returning * into v_booking;

  return v_booking;
end;
$$;


ALTER FUNCTION "public"."create_booking_with_conflict_check"("p_service_id" "uuid", "p_mechanic_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_notes" "text", "p_down_payment" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text" DEFAULT 'general'::"text", "p_related_table" "text" DEFAULT NULL::"text", "p_related_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (
    user_id,
    title,
    message,
    type,
    related_table,
    related_id,
    is_read
  )
  values (
    p_user_id,
    p_title,
    p_message,
    coalesce(p_type, 'general'),
    p_related_table,
    p_related_id,
    false
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_walkin_queue_number"("p_queue_date" "date" DEFAULT CURRENT_DATE) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(queue_number, '^WQ-[0-9]{8}-', ''),
        ''
      )::integer
    ),
    0
  ) + 1
  INTO next_num
  FROM public.walkin_queue
  WHERE queue_date = p_queue_date
    AND queue_number ~ ('^WQ-' || to_char(p_queue_date, 'YYYYMMDD') || '-[0-9]+$');

  RETURN 'WQ-' || to_char(p_queue_date, 'YYYYMMDD') || '-' || lpad(next_num::text, 3, '0');
END;
$_$;


ALTER FUNCTION "public"."create_walkin_queue_number"("p_queue_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decrement_stock"("part_id" "uuid", "qty" integer) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update parts set stock_quantity = stock_quantity - qty where id = part_id;
$$;


ALTER FUNCTION "public"."decrement_stock"("part_id" "uuid", "qty" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  next_number bigint;
begin
  next_number := nextval('public.invoice_number_seq');

  return 'INV-' ||
    to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD') ||
    '-' ||
    lpad(next_number::text, 6, '0');
end;
$$;


ALTER FUNCTION "public"."generate_invoice_number"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" DEFAULT "public"."generate_invoice_number"() NOT NULL,
    "order_id" "uuid",
    "booking_id" "uuid",
    "customer_id" "uuid",
    "total_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "amount_paid" numeric(10,2) DEFAULT 0 NOT NULL,
    "balance_due" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "due_date" "date",
    "issued_at" timestamp with time zone DEFAULT "now"(),
    "issued_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_or_sync_invoice"("p_order_id" "uuid" DEFAULT NULL::"uuid", "p_booking_id" "uuid" DEFAULT NULL::"uuid", "p_due_date" "date" DEFAULT NULL::"date", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."invoices"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_customer_id uuid;
  v_total numeric(10,2) := 0;
  v_paid numeric(10,2) := 0;
  v_balance numeric(10,2) := 0;
  v_status text := 'unpaid';
  v_invoice public.invoices%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if p_order_id is null and p_booking_id is null then
    raise exception 'Order ID or booking ID is required.';
  end if;

  if p_order_id is not null and p_booking_id is not null then
    raise exception 'Use either order ID or booking ID, not both.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id;

  if p_order_id is not null then
    select customer_id, coalesce(total_amount, 0)
    into v_customer_id, v_total
    from public.orders
    where id = p_order_id;

    if v_customer_id is null then
      raise exception 'Order not found.';
    end if;

    if v_customer_id <> v_user_id and coalesce(v_user_role, '') not in ('admin', 'staff') then
      raise exception 'Forbidden.';
    end if;

    select coalesce(
      sum(
        case
          when payment_type = 'refund' then -coalesce(amount, 0)
          else coalesce(amount, 0)
        end
      ),
      0
    )
    into v_paid
    from public.payments
    where order_id = p_order_id;
  end if;

  if p_booking_id is not null then
    select
      b.customer_id,
      coalesce(
        nullif(b.total_amount, 0),
        coalesce(s.base_price, 0) + coalesce(s.labor_cost, 0),
        0
      )
    into v_customer_id, v_total
    from public.bookings b
    left join public.services s on s.id = b.service_id
    where b.id = p_booking_id;

    if v_customer_id is null then
      raise exception 'Booking not found.';
    end if;

    if v_customer_id <> v_user_id and coalesce(v_user_role, '') not in ('admin', 'staff') then
      raise exception 'Forbidden.';
    end if;

    select coalesce(
      sum(
        case
          when payment_type = 'refund' then -coalesce(amount, 0)
          else coalesce(amount, 0)
        end
      ),
      0
    )
    into v_paid
    from public.payments
    where booking_id = p_booking_id;
  end if;

  v_total := round(coalesce(v_total, 0), 2);
  v_paid := round(coalesce(v_paid, 0), 2);
  v_balance := greatest(round(v_total - v_paid, 2), 0);

  if v_total <= 0 then
    v_status := 'paid';
  elsif v_paid <= 0 then
    v_status := 'unpaid';
  elsif v_paid < v_total then
    v_status := 'partial';
  else
    v_status := 'paid';
  end if;

  if exists (
    select 1 from public.payments
    where (p_order_id is not null and order_id = p_order_id)
       or (p_booking_id is not null and booking_id = p_booking_id)
  ) and v_paid <= 0 then
    v_status := 'refunded';
  end if;

  select *
  into v_invoice
  from public.invoices
  where (p_order_id is not null and order_id = p_order_id)
     or (p_booking_id is not null and booking_id = p_booking_id)
  order by created_at desc
  limit 1;

  if found then
    update public.invoices
    set
      customer_id = v_customer_id,
      total_amount = v_total,
      amount_paid = v_paid,
      balance_due = v_balance,
      status = v_status,
      due_date = coalesce(p_due_date, due_date),
      issued_by = case
        when coalesce(v_user_role, '') in ('admin', 'staff') then v_user_id
        else issued_by
      end,
      notes = coalesce(p_notes, notes)
    where id = v_invoice.id
    returning * into v_invoice;

    return v_invoice;
  end if;

  insert into public.invoices (
    order_id,
    booking_id,
    customer_id,
    total_amount,
    amount_paid,
    balance_due,
    status,
    due_date,
    issued_by,
    notes
  )
  values (
    p_order_id,
    p_booking_id,
    v_customer_id,
    v_total,
    v_paid,
    v_balance,
    v_status,
    p_due_date,
    case
      when coalesce(v_user_role, '') in ('admin', 'staff') then v_user_id
      else null
    end,
    p_notes
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$;


ALTER FUNCTION "public"."generate_or_sync_invoice"("p_order_id" "uuid", "p_booking_id" "uuid", "p_due_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_receipt_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_next bigint;
BEGIN
  SELECT nextval('public.receipt_number_seq') INTO v_next;

  RETURN 'MF-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_next::text, 6, '0');
END;
$$;


ALTER FUNCTION "public"."generate_receipt_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_booking_duration_minutes"("p_service_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select greatest(
    coalesce(
      (
        select estimated_duration_minutes
        from public.services
        where id = p_service_id
      ),
      30
    ),
    30
  )::integer;
$$;


ALTER FUNCTION "public"."get_booking_duration_minutes"("p_service_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_orders_with_payment_summary"() RETURNS TABLE("id" "uuid", "customer_id" "uuid", "status" "text", "total_amount" numeric, "payment_provider" "text", "payment_method" "text", "payment_status" "text", "payment_reference" "text", "paymongo_checkout_session_id" "text", "checkout_url" "text", "down_payment_amount" numeric, "remaining_balance" numeric, "paid_at" timestamp with time zone, "created_at" timestamp with time zone, "item_count" bigint, "paid_amount" numeric, "computed_balance" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with manual_payments as (
    select
      order_id,
      coalesce(sum(amount), 0)::numeric as amount
    from public.payments
    where order_id is not null
    group by order_id
  ),
  online_payments as (
    select
      order_id,
      coalesce(sum(amount), 0)::numeric as amount
    from public.order_payments
    where status = 'paid'
    group by order_id
  ),
  item_counts as (
    select
      order_id,
      count(*)::bigint as item_count
    from public.order_items
    group by order_id
  )
  select
    o.id,
    o.customer_id,
    o.status,
    coalesce(o.total_amount, 0)::numeric as total_amount,
    o.payment_provider,
    o.payment_method,
    o.payment_status,
    o.payment_reference,
    o.paymongo_checkout_session_id,
    o.checkout_url,
    coalesce(o.down_payment_amount, 0)::numeric as down_payment_amount,
    coalesce(o.remaining_balance, coalesce(o.total_amount, 0))::numeric as remaining_balance,
    o.paid_at,
    o.created_at,
    coalesce(ic.item_count, 0)::bigint as item_count,
    case
      when o.payment_status = 'paid' then coalesce(o.total_amount, 0)::numeric
      else coalesce(mp.amount, 0)::numeric + coalesce(op.amount, 0)::numeric
    end as paid_amount,
    case
      when o.payment_status = 'paid' then 0::numeric
      when o.remaining_balance is not null then greatest(coalesce(o.remaining_balance, 0), 0)::numeric
      else greatest(coalesce(o.total_amount, 0) - coalesce(mp.amount, 0) - coalesce(op.amount, 0), 0)::numeric
    end as computed_balance
  from public.orders o
  left join manual_payments mp on mp.order_id = o.id
  left join online_payments op on op.order_id = o.id
  left join item_counts ic on ic.order_id = o.id
  where o.customer_id = auth.uid()
  order by o.created_at desc;
$$;


ALTER FUNCTION "public"."get_my_orders_with_payment_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT auth.jwt() -> 'user_metadata' ->> 'role';
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_progress_description"("p_status" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_status
    when 'pending' then 'Your booking request has been submitted and is waiting for shop confirmation.'
    when 'confirmed' then 'Your booking has been confirmed by MotoFix.'
    when 'in_progress' then 'The assigned mechanic has started working on your motorcycle.'
    when 'inspection' then 'The mechanic is inspecting your motorcycle and checking the reported issue.'
    when 'repairing' then 'Repair or maintenance work is currently being performed.'
    when 'quality_check' then 'The service is being checked before completion.'
    when 'ready_for_pickup' then 'Your motorcycle is ready for pickup.'
    when 'completed' then 'The service has been completed.'
    when 'cancelled' then 'This booking has been cancelled.'
    when 'rejected' then 'This booking request has been rejected.'
    when 'no_show' then 'The customer did not arrive for the scheduled booking.'
    else 'The service progress has been updated.'
  end;
$$;


ALTER FUNCTION "public"."get_service_progress_description"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_progress_percent"("p_status" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_status
    when 'pending' then 10
    when 'confirmed' then 25
    when 'in_progress' then 40
    when 'inspection' then 50
    when 'repairing' then 70
    when 'quality_check' then 85
    when 'ready_for_pickup' then 95
    when 'completed' then 100
    when 'cancelled' then 0
    when 'rejected' then 0
    when 'no_show' then 0
    else 0
  end;
$$;


ALTER FUNCTION "public"."get_service_progress_percent"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_progress_title"("p_status" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case p_status
    when 'pending' then 'Booking Submitted'
    when 'confirmed' then 'Booking Confirmed'
    when 'in_progress' then 'Service Started'
    when 'inspection' then 'Motorcycle Inspection'
    when 'repairing' then 'Repair in Progress'
    when 'quality_check' then 'Quality Check'
    when 'ready_for_pickup' then 'Ready for Pickup'
    when 'completed' then 'Service Completed'
    when 'cancelled' then 'Booking Cancelled'
    when 'rejected' then 'Booking Rejected'
    when 'no_show' then 'No Show Recorded'
    else 'Service Progress Updated'
  end;
$$;


ALTER FUNCTION "public"."get_service_progress_title"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    phone,
    role
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    phone = coalesce(public.profiles.phone, excluded.phone),
    role = coalesce(public.profiles.role, excluded.role);

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_booking_conflict"("p_booking_id" "uuid", "p_mechanic_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_start integer;
  v_end integer;
  v_duration integer;
begin
  if p_mechanic_id is null then
    return false;
  end if;

  if p_service_id is null or p_booking_date is null or p_booking_time is null then
    return false;
  end if;

  v_duration := public.get_booking_duration_minutes(p_service_id);
  v_start := public.booking_time_to_minutes(p_booking_time);
  v_end := v_start + v_duration;

  return exists (
    select 1
    from public.bookings existing
    where existing.mechanic_id = p_mechanic_id
      and existing.booking_date = p_booking_date
      and existing.status in ('pending', 'confirmed', 'in_progress')
      and (p_booking_id is null or existing.id <> p_booking_id)
      and (
        v_start <
          public.booking_time_to_minutes(existing.booking_time::time)
          + public.get_booking_duration_minutes(existing.service_id)
        and
        v_end > public.booking_time_to_minutes(existing.booking_time::time)
      )
  );
end;
$$;


ALTER FUNCTION "public"."has_booking_conflict"("p_booking_id" "uuid", "p_mechanic_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.customer_consents
    where customer_id = p_customer_id
      and consent_type = p_consent_type
      and is_accepted = true
      and revoked_at is null
    order by accepted_at desc
    limit 1
  );
$$;


ALTER FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text" DEFAULT '1.0'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return exists (
    select 1
    from public.customer_consents
    where customer_id = p_customer_id
      and consent_type = p_consent_type
      and version = p_version
      and is_accepted = true
      and revoked_at is null
  );
end;
$$;


ALTER FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_system_service_progress_event"("p_booking_id" "uuid", "p_customer_id" "uuid", "p_mechanic_id" "uuid", "p_status" "text", "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_booking_id is null or p_customer_id is null or p_status is null then
    return;
  end if;

  insert into public.service_progress_events (
    booking_id,
    customer_id,
    mechanic_id,
    status,
    title,
    description,
    progress_percent,
    event_type,
    metadata,
    created_by
  )
  values (
    p_booking_id,
    p_customer_id,
    p_mechanic_id,
    p_status,
    public.get_service_progress_title(p_status),
    public.get_service_progress_description(p_status),
    public.get_service_progress_percent(p_status),
    'system_update',
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by
  );
end;
$$;


ALTER FUNCTION "public"."insert_system_service_progress_event"("p_booking_id" "uuid", "p_customer_id" "uuid", "p_mechanic_id" "uuid", "p_status" "text", "p_created_by" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'staff'
  );
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'super_admin'
      and coalesce(profiles.is_active, true) = true
  );
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_booking_status_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.insert_system_service_progress_event(
      new.id,
      new.customer_id,
      new.mechanic_id,
      coalesce(new.status, 'pending'),
      null,
      jsonb_build_object(
        'trigger', 'booking_insert',
        'booking_date', new.booking_date,
        'booking_time', new.booking_time
      )
    );

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.insert_system_service_progress_event(
        new.id,
        new.customer_id,
        new.mechanic_id,
        coalesce(new.status, 'pending'),
        null,
        jsonb_build_object(
          'trigger', 'booking_status_update',
          'old_status', old.status,
          'new_status', new.status,
          'booking_date', new.booking_date,
          'booking_time', new.booking_time
        )
      );
    end if;

    if new.mechanic_id is distinct from old.mechanic_id and new.mechanic_id is not null then
      perform public.insert_system_service_progress_event(
        new.id,
        new.customer_id,
        new.mechanic_id,
        coalesce(new.status, 'confirmed'),
        null,
        jsonb_build_object(
          'trigger', 'mechanic_assignment_update',
          'old_mechanic_id', old.mechanic_id,
          'new_mechanic_id', new.mechanic_id
        )
      );
    end if;

    return new;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."log_booking_status_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_messages_read"("conv_id" "uuid", "reader_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update chat_messages
  set is_read = true
  where conversation_id = conv_id
    and sender_id != reader_id
    and is_read = false;
$$;


ALTER FUNCTION "public"."mark_messages_read"("conv_id" "uuid", "reader_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_role"("p_role" "text", "p_title" "text", "p_message" "text", "p_type" "text" DEFAULT 'general'::"text", "p_related_table" "text" DEFAULT NULL::"text", "p_related_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  insert into public.notifications (
    user_id,
    title,
    message,
    type,
    related_table,
    related_id,
    is_read
  )
  select
    p.id,
    p_title,
    p_message,
    coalesce(p_type, 'general'),
    p_related_table,
    p_related_id,
    false
  from public.profiles p
  where lower(p.role) = lower(p_role);

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."notify_role"("p_role" "text", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_booking_conflicts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- No conflict check if there is no assigned/selected mechanic yet.
  if new.mechanic_id is null then
    return new;
  end if;

  -- Historical/non-active bookings should not block the schedule.
  if coalesce(new.status, 'pending') not in ('pending', 'confirmed', 'in_progress') then
    return new;
  end if;

  if public.has_booking_conflict(
    new.id,
    new.mechanic_id,
    new.service_id,
    new.booking_date,
    new.booking_time::time
  ) then
    raise exception
      'Booking conflict: this mechanic already has an active booking that overlaps with the selected date and time.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_booking_conflicts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_unsettled_or_spam_bookings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_unsettled_booking_id uuid;
  v_same_day_count integer;
  v_active_count integer;
  v_duplicate_booking_id uuid;
BEGIN
  -- Only apply to customer appointment bookings.
  -- Walk-ins should use walkin_queue, not this scheduled booking blocker.
  IF NEW.customer_id IS NULL OR COALESCE(NEW.is_walkin, false) = true THEN
    RETURN NEW;
  END IF;

  -- Do not block inserts that are already terminal.
  IF COALESCE(NEW.status, 'pending') IN ('completed', 'cancelled', 'rejected', 'no_show') THEN
    RETURN NEW;
  END IF;

  -- 1) Block if customer has an existing active booking with unsettled reservation payment.
  SELECT b.id
  INTO v_unsettled_booking_id
  FROM public.bookings b
  WHERE b.customer_id = NEW.customer_id
    AND COALESCE(b.is_walkin, false) = false
    AND COALESCE(b.status, 'pending') NOT IN ('completed', 'cancelled', 'rejected', 'no_show')
    AND COALESCE(b.payment_status, 'unpaid') IN (
      'unpaid',
      'checkout_created',
      'pending_payment',
      'pending_verification'
    )
  ORDER BY b.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_unsettled_booking_id IS NOT NULL THEN
    RAISE EXCEPTION
      'You still have an unsettled booking payment. Please pay, verify, or cancel your existing booking first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2) Prevent exact duplicate active booking for same customer/date/time.
  SELECT b.id
  INTO v_duplicate_booking_id
  FROM public.bookings b
  WHERE b.customer_id = NEW.customer_id
    AND COALESCE(b.is_walkin, false) = false
    AND COALESCE(b.status, 'pending') NOT IN ('completed', 'cancelled', 'rejected', 'no_show')
    AND b.booking_date = NEW.booking_date
    AND b.booking_time = NEW.booking_time
  LIMIT 1;

  IF v_duplicate_booking_id IS NOT NULL THEN
    RAISE EXCEPTION
      'You already have an active booking on the same date and time.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3) Limit customer to 1 active booking per date.
  -- This prevents spam and encourages adding multiple services inside one booking later.
  SELECT COUNT(*)
  INTO v_same_day_count
  FROM public.bookings b
  WHERE b.customer_id = NEW.customer_id
    AND COALESCE(b.is_walkin, false) = false
    AND COALESCE(b.status, 'pending') NOT IN ('completed', 'cancelled', 'rejected', 'no_show')
    AND b.booking_date = NEW.booking_date;

  IF v_same_day_count >= 1 THEN
    RAISE EXCEPTION
      'You already have an active booking for this date. Please reschedule or cancel the existing booking first.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4) Limit customer to max 3 active scheduled bookings total.
  SELECT COUNT(*)
  INTO v_active_count
  FROM public.bookings b
  WHERE b.customer_id = NEW.customer_id
    AND COALESCE(b.is_walkin, false) = false
    AND COALESCE(b.status, 'pending') NOT IN ('completed', 'cancelled', 'rejected', 'no_show');

  IF v_active_count >= 3 THEN
    RAISE EXCEPTION
      'Booking limit reached. You can only have up to 3 active bookings.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_unsettled_or_spam_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_booking_service_total"("p_booking_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_service_total numeric(12,2);
  v_duration integer;
  v_summary text;
  v_parts_total numeric(12,2);
BEGIN
  SELECT
    COALESCE(SUM((COALESCE(base_price, 0) + COALESCE(labor_cost, 0)) * COALESCE(quantity, 1)), 0),
    COALESCE(SUM(COALESCE(estimated_duration_minutes, 0) * COALESCE(quantity, 1)), 0),
    STRING_AGG(service_name, ', ' ORDER BY service_name)
  INTO v_service_total, v_duration, v_summary
  FROM public.booking_services
  WHERE booking_id = p_booking_id;

  SELECT COALESCE(parts_total, product_total, 0)
  INTO v_parts_total
  FROM public.bookings
  WHERE id = p_booking_id;

  UPDATE public.bookings
  SET
    service_total = v_service_total,
    services_summary = COALESCE(v_summary, services_summary),
    total_amount = v_service_total + COALESCE(v_parts_total, 0)
  WHERE id = p_booking_id;
END;
$$;


ALTER FUNCTION "public"."recalculate_booking_service_total"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recommend_mechanics"("p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) RETURNS TABLE("mechanic_id" "uuid", "first_name" "text", "last_name" "text", "skill_level" integer, "daily_bookings" bigint, "active_bookings" bigint, "score" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with target_service as (
    select
      id,
      coalesce(estimated_duration_minutes, 30) as duration_minutes
    from services
    where id = p_service_id
  ),
  available_mechanics as (
    select
      p.id as mechanic_id,
      p.first_name::text,
      p.last_name::text,
      coalesce(ms.skill_level, 3) as skill_level
    from profiles p
    left join mechanic_skills ms
      on ms.mechanic_id = p.id
      and ms.service_id = p_service_id
    where p.role = 'mechanic'
  ),
  mechanic_load as (
    select
      am.mechanic_id,
      count(b.id) filter (
        where b.booking_date = p_booking_date
        and b.status in ('pending', 'confirmed', 'in_progress')
      ) as daily_bookings,
      count(b.id) filter (
        where b.status in ('pending', 'confirmed', 'in_progress')
      ) as active_bookings
    from available_mechanics am
    left join bookings b
      on b.mechanic_id = am.mechanic_id
    group by am.mechanic_id
  ),
  conflicting_mechanics as (
    select distinct b.mechanic_id
    from bookings b
    join services s on s.id = b.service_id
    cross join target_service ts
    where b.mechanic_id is not null
      and b.booking_date = p_booking_date
      and b.status in ('pending', 'confirmed', 'in_progress')
      and (
        (b.booking_date + b.booking_time)
        <
        (p_booking_date + p_booking_time + make_interval(mins => ts.duration_minutes))
      )
      and (
        (b.booking_date + b.booking_time + make_interval(mins => coalesce(s.estimated_duration_minutes, 30)))
        >
        (p_booking_date + p_booking_time)
      )
  )
  select
    am.mechanic_id,
    am.first_name,
    am.last_name,
    am.skill_level,
    coalesce(ml.daily_bookings, 0) as daily_bookings,
    coalesce(ml.active_bookings, 0) as active_bookings,
    (
      am.skill_level * 20
      - coalesce(ml.daily_bookings, 0) * 5
      - coalesce(ml.active_bookings, 0) * 2
    )::numeric as score
  from available_mechanics am
  left join mechanic_load ml on ml.mechanic_id = am.mechanic_id
  where am.mechanic_id not in (
    select mechanic_id
    from conflicting_mechanics
    where mechanic_id is not null
  )
  order by score desc, daily_bookings asc, active_bookings asc, first_name asc;
$$;


ALTER FUNCTION "public"."recommend_mechanics"("p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_order_stock"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  item record;
  current_stock integer;
begin
  for item in
    select
      oi.part_id,
      oi.quantity,
      p.name,
      p.stock_quantity
    from public.order_items oi
    join public.parts p on p.id = oi.part_id
    where oi.order_id = p_order_id
  loop
    current_stock := coalesce(item.stock_quantity, 0);

    if current_stock < item.quantity then
      raise exception 'Not enough stock for %. Available: %, Requested: %',
        item.name,
        current_stock,
        item.quantity;
    end if;

    update public.parts
    set
      stock_quantity = current_stock - item.quantity,
      updated_at = now()
    where id = item.part_id;

    insert into public.inventory_movements (
      part_id,
      movement_type,
      quantity,
      reason,
      related_order_id,
      created_at
    )
    values (
      item.part_id,
      'sold_order',
      -item.quantity,
      'Stock reserved from customer checkout',
      p_order_id,
      now()
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."reserve_order_stock"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_customer_consent"("p_consent_type" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  update public.customer_consents
  set
    is_accepted = false,
    revoked_at = now()
  where customer_id = auth.uid()
    and consent_type = p_consent_type
    and is_accepted = true
    and revoked_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."revoke_customer_consent"("p_consent_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text" DEFAULT '1.0'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
begin
  update public.customer_consents
  set
    is_accepted = false,
    revoked_at = now(),
    updated_at = now()
  where customer_id = p_customer_id
    and consent_type = p_consent_type
    and version = p_version
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."revoke_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_service_progress_parts"("p_query" "text" DEFAULT ''::"text") RETURNS TABLE("id" "uuid", "name" "text", "category" "text", "description" "text", "image_url" "text", "price" numeric, "stock_quantity" integer, "is_active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_query text;
BEGIN
  v_query := trim(coalesce(p_query, ''));

  RETURN QUERY
  SELECT
    p.id::uuid,
    p.name::text,
    COALESCE(p.category, 'General')::text,
    NULL::text AS description,
    p.image_url::text,
    COALESCE(p.price, 0)::numeric,
    COALESCE(p.stock_quantity, 0)::integer,
    COALESCE(p.is_active, true)::boolean
  FROM public.parts p
  WHERE COALESCE(p.is_active, true) = true
    AND (
      v_query = ''
      OR p.name ILIKE '%' || v_query || '%'
      OR p.category ILIKE '%' || v_query || '%'
    )
  ORDER BY
    CASE WHEN COALESCE(p.stock_quantity, 0) > 0 THEN 0 ELSE 1 END,
    p.name ASC
  LIMIT 50;
END;
$$;


ALTER FUNCTION "public"."search_service_progress_parts"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_chatbot_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_chatbot_templates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_consent_definitions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_consent_definitions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_customer_consents_timestamps"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();

  if new.is_accepted = true and new.accepted_at is null then
    new.accepted_at = now();
  end if;

  if new.is_accepted = false and new.revoked_at is null then
    new.revoked_at = now();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_customer_consents_timestamps"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_invoice_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.invoice_number is null or trim(new.invoice_number) = '' then
    new.invoice_number := public.generate_invoice_number();
  end if;

  if new.issued_at is null then
    new.issued_at := now();
  end if;

  if new.status is null or trim(new.status) = '' then
    new.status := 'unpaid';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_invoice_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_payment_receipt_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.receipt_number IS NULL OR btrim(NEW.receipt_number) = '' THEN
    NEW.receipt_number := public.generate_receipt_number();
  END IF;

  IF NEW.receipt_issued_at IS NULL THEN
    NEW.receipt_issued_at := now();
  END IF;

  IF NEW.receipt_issued_by IS NULL THEN
    NEW.receipt_issued_by := NEW.processed_by;
  END IF;

  IF NEW.receipt_status IS NULL OR btrim(NEW.receipt_status) = '' THEN
    NEW.receipt_status := 'issued';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_payment_receipt_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_walkin_queue_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_walkin_queue_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_booking_service_progress"("p_booking_id" "uuid", "p_status" "text", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_progress_percent" integer DEFAULT NULL::integer, "p_event_type" "text" DEFAULT 'mechanic_update'::"text", "p_photo_url" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."service_progress_events"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_booking public.bookings%rowtype;
  v_old_status text;
  v_event public.service_progress_events%rowtype;
  v_status text := coalesce(nullif(trim(p_status), ''), 'in_progress');
  v_title text;
  v_description text;
  v_progress integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found.';
  end if;

  if coalesce(v_role, '') not in ('admin', 'staff')
     and v_booking.mechanic_id is distinct from v_user_id then
    raise exception 'Only admin, staff, or the assigned mechanic can update service progress.';
  end if;

  if v_status not in (
    'pending',
    'confirmed',
    'in_progress',
    'inspection',
    'repairing',
    'quality_check',
    'ready_for_pickup',
    'completed',
    'cancelled',
    'rejected',
    'no_show',
    'note'
  ) then
    raise exception 'Invalid progress status: %', v_status;
  end if;

  v_title := coalesce(nullif(trim(p_title), ''), public.get_service_progress_title(v_status));
  v_description := coalesce(nullif(trim(p_description), ''), public.get_service_progress_description(v_status));
  v_progress := coalesce(p_progress_percent, public.get_service_progress_percent(v_status));

  if v_progress < 0 or v_progress > 100 then
    raise exception 'Progress percent must be between 0 and 100.';
  end if;

  v_old_status := v_booking.status;

  -- If this is only a note, do not change the main booking status.
  if v_status <> 'note' and v_status is distinct from v_booking.status then
    update public.bookings
    set status = v_status
    where id = p_booking_id
    returning * into v_booking;

    -- The trigger will create a default system timeline event.
    -- Update the latest matching event so the custom title/description/photo is shown.
    select *
    into v_event
    from public.service_progress_events
    where booking_id = p_booking_id
      and status = v_status
    order by created_at desc
    limit 1;

    if found then
      update public.service_progress_events
      set
        title = v_title,
        description = v_description,
        progress_percent = v_progress,
        event_type = coalesce(p_event_type, 'mechanic_update'),
        photo_url = p_photo_url,
        metadata = coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
          'updated_by_progress_rpc', true,
          'old_status', v_old_status,
          'new_status', v_status
        ),
        created_by = v_user_id
      where id = v_event.id
      returning * into v_event;

      return v_event;
    end if;
  end if;

  -- If status did not change, or status is note, create a new timeline event.
  insert into public.service_progress_events (
    booking_id,
    customer_id,
    mechanic_id,
    status,
    title,
    description,
    progress_percent,
    event_type,
    photo_url,
    metadata,
    created_by
  )
  values (
    v_booking.id,
    v_booking.customer_id,
    v_booking.mechanic_id,
    v_status,
    v_title,
    v_description,
    v_progress,
    coalesce(p_event_type, 'mechanic_update'),
    p_photo_url,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'created_by_progress_rpc', true,
      'old_status', v_old_status,
      'new_status', v_status
    ),
    v_user_id
  )
  returning * into v_event;

  return v_event;
end;
$$;


ALTER FUNCTION "public"."update_booking_service_progress"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_mechanic_rating"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update public.profiles
  set
    rating_avg = (select round(avg(rating)::numeric, 2) from public.mechanic_ratings where mechanic_id = new.mechanic_id),
    rating_count = (select count(*) from public.mechanic_ratings where mechanic_id = new.mechanic_id)
  where id = new.mechanic_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."update_mechanic_rating"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "uuid",
    "performed_by" "uuid",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "booking_id" "uuid",
    "provider" "text" DEFAULT 'paymongo'::"text" NOT NULL,
    "status" "text" DEFAULT 'checkout_created'::"text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'PHP'::"text" NOT NULL,
    "reference_number" "text",
    "checkout_url" "text",
    "provider_checkout_session_id" "text",
    "provider_payment_intent_id" "text",
    "provider_payment_id" "text",
    "payment_method" "text" DEFAULT 'qrph'::"text",
    "fee_amount" numeric(10,2) DEFAULT 0,
    "net_amount" numeric(10,2) DEFAULT 0,
    "paid_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "booking_payments_status_check" CHECK (("status" = ANY (ARRAY['unpaid'::"text", 'checkout_created'::"text", 'pending_payment'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."booking_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "service_name" "text",
    "base_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "labor_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "estimated_duration_minutes" integer DEFAULT 0,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "booking_services_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."booking_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cart_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."cart_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "staff_id" "uuid",
    "status" "text" DEFAULT 'open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "conversation_type" "text" DEFAULT 'human'::"text",
    CONSTRAINT "chat_conversations_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"]))),
    CONSTRAINT "chat_conversations_type_check" CHECK (("conversation_type" = ANY (ARRAY['human'::"text", 'ai'::"text"])))
);


ALTER TABLE "public"."chat_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "message" "text" NOT NULL,
    "is_bot" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_read" boolean DEFAULT false
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chatbot_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intent" "text" NOT NULL,
    "title" "text" NOT NULL,
    "keywords" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "response" "text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT 'general'::"text",
    "question" "text",
    "answer" "text",
    CONSTRAINT "chatbot_templates_intent_not_blank" CHECK (("length"(TRIM(BOTH FROM "intent")) > 0)),
    CONSTRAINT "chatbot_templates_response_not_blank" CHECK (("length"(TRIM(BOTH FROM "response")) > 0)),
    CONSTRAINT "chatbot_templates_title_not_blank" CHECK (("length"(TRIM(BOTH FROM "title")) > 0))
);


ALTER TABLE "public"."chatbot_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consent_definitions" (
    "consent_type" "text" NOT NULL,
    "consent_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "consent_text" "text" NOT NULL,
    "is_required" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consent_definitions_text_not_blank" CHECK (("length"(TRIM(BOTH FROM "consent_text")) > 0)),
    CONSTRAINT "consent_definitions_type_check" CHECK (("consent_type" = ANY (ARRAY['account_registration'::"text", 'booking_processing'::"text", 'order_payment_processing'::"text", 'ai_photo_processing'::"text", 'chat_support'::"text", 'notifications'::"text", 'invoice_receipt'::"text"])))
);


ALTER TABLE "public"."consent_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "consent_type" "text" NOT NULL,
    "consent_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "consent_text" "text" DEFAULT 'Customer accepted MotoFix consent.'::"text" NOT NULL,
    "is_accepted" boolean DEFAULT true NOT NULL,
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "source_page" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "version" "text" DEFAULT '1.0'::"text" NOT NULL,
    CONSTRAINT "customer_consents_text_not_blank" CHECK (("length"(TRIM(BOTH FROM "consent_text")) > 0)),
    CONSTRAINT "customer_consents_version_not_blank" CHECK (("length"(TRIM(BOTH FROM "consent_version")) > 0))
);


ALTER TABLE "public"."customer_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "part_ids" "uuid"[],
    "original_photo_url" "text" NOT NULL,
    "preview_image_url" "text",
    "prompt_used" "text",
    "status" "text" DEFAULT 'generated'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "customizations_status_check" CHECK (("status" = ANY (ARRAY['generated'::"text", 'saved'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."customizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "previous_stock" integer NOT NULL,
    "new_stock" integer NOT NULL,
    "reason" "text",
    "related_order_id" "uuid",
    "related_booking_id" "uuid",
    "performed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['stock_in'::"text", 'stock_out'::"text", 'reserved'::"text", 'released'::"text", 'used_service'::"text", 'sold_order'::"text", 'refund_return'::"text", 'manual_adjustment'::"text"]))),
    CONSTRAINT "inventory_movements_new_stock_check" CHECK (("new_stock" >= 0)),
    CONSTRAINT "inventory_movements_previous_stock_check" CHECK (("previous_stock" >= 0)),
    CONSTRAINT "inventory_movements_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mechanic_certificates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mechanic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "file_url" "text" NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."mechanic_certificates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mechanic_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "mechanic_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mechanic_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."mechanic_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mechanic_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mechanic_id" "uuid",
    "service_id" "uuid",
    "skill_level" integer DEFAULT 3,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mechanic_skills_skill_level_check" CHECK ((("skill_level" >= 1) AND ("skill_level" <= 5)))
);


ALTER TABLE "public"."mechanic_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."motorcycle_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "make" "text" NOT NULL,
    "model" "text" NOT NULL,
    "year_range" "text",
    "reference_photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ai_reference_photo_url" "text"
);


ALTER TABLE "public"."motorcycle_models" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'general'::"text",
    "related_table" "text",
    "related_id" "uuid",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "part_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "subtotal" numeric(10,2) NOT NULL
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'paymongo'::"text" NOT NULL,
    "status" "text" DEFAULT 'checkout_created'::"text" NOT NULL,
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'PHP'::"text" NOT NULL,
    "reference_number" "text",
    "checkout_url" "text",
    "provider_checkout_session_id" "text",
    "provider_payment_intent_id" "text",
    "provider_payment_id" "text",
    "payment_method" "text",
    "paid_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "booking_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "total_amount" numeric(10,2) DEFAULT 0,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "payment_method" "text",
    "payment_received" boolean DEFAULT false,
    "payment_received_at" timestamp with time zone,
    "payment_received_by" "uuid",
    "is_walkin" boolean DEFAULT false,
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_status" "text" DEFAULT 'pending_payment'::"text",
    "payment_reference" "text",
    "fulfillment_method" "text" DEFAULT 'pickup'::"text",
    "delivery_address" "text",
    "down_payment" numeric(10,2) DEFAULT 0,
    "remaining_balance" numeric(10,2) DEFAULT 0,
    "verified_at" timestamp with time zone,
    "verified_by" "uuid",
    "down_payment_amount" numeric(10,2) DEFAULT 0,
    "fulfillment_status" "text" DEFAULT 'pending_pickup'::"text",
    "pickup_notes" "text",
    "customer_contact_phone" "text",
    "paid_at" timestamp with time zone,
    "cancelled_reason" "text",
    "payment_provider" "text",
    "paymongo_checkout_session_id" "text",
    "checkout_url" "text",
    "walkin_customer_name" "text",
    "walkin_customer_phone" "text",
    CONSTRAINT "orders_fulfillment_method_check" CHECK (("fulfillment_method" = ANY (ARRAY['pickup'::"text", 'delivery'::"text"]))),
    CONSTRAINT "orders_fulfillment_status_check" CHECK ((("fulfillment_status" IS NULL) OR ("fulfillment_status" = ANY (ARRAY['pending_pickup'::"text", 'pending_delivery'::"text", 'processing'::"text", 'ready_for_pickup'::"text", 'ready_for_delivery'::"text", 'out_for_delivery'::"text", 'picked_up'::"text", 'delivered'::"text", 'completed'::"text", 'cancelled'::"text"])))),
    CONSTRAINT "orders_payment_method_check" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['cash_on_pickup'::"text", 'cash_on_delivery'::"text", 'paymongo_qrph'::"text", 'gcash_manual'::"text", 'pay_at_counter'::"text", 'cash_at_shop'::"text", 'cod'::"text", 'cash'::"text", 'gcash'::"text", 'paymongo'::"text"])))),
    CONSTRAINT "orders_payment_status_check" CHECK ((("payment_status" IS NULL) OR ("payment_status" = ANY (ARRAY['unpaid'::"text", 'pending'::"text", 'pending_payment'::"text", 'checkout_created'::"text", 'pending_verification'::"text", 'paid'::"text", 'partially_paid'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text", 'refunded'::"text"])))),
    CONSTRAINT "orders_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'processing'::"text", 'preparing'::"text", 'ready'::"text", 'ready_for_pickup'::"text", 'completed'::"text", 'cancelled'::"text", 'returned'::"text"])))),
    CONSTRAINT "orders_walkin_customer_phone_check" CHECK ((("walkin_customer_phone" IS NULL) OR ("walkin_customer_phone" = ''::"text") OR ("walkin_customer_phone" ~ '^09[0-9]{9}$'::"text")))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "compatible_models" "text"[],
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "stock_quantity" integer DEFAULT 0 NOT NULL,
    "reorder_threshold" integer DEFAULT 5,
    "last_restock_date" "date",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true NOT NULL,
    "ai_reference_url" "text",
    "prompt_description" "text",
    "install_area" "text",
    "color" "text",
    "finish" "text",
    "material" "text",
    "is_previewable" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."parts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid",
    "order_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "payment_type" "text" DEFAULT 'balance'::"text" NOT NULL,
    "method" "text" DEFAULT 'cash'::"text",
    "processed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "receipt_number" "text",
    "receipt_status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "receipt_issued_at" timestamp with time zone DEFAULT "now"(),
    "receipt_issued_by" "uuid",
    "receipt_notes" "text",
    "customer_id" "uuid",
    "payment_for" "text" DEFAULT 'booking'::"text",
    "provider" "text" DEFAULT 'paymongo'::"text",
    "status" "text" DEFAULT 'checkout_created'::"text",
    "currency" "text" DEFAULT 'PHP'::"text",
    "reference_number" "text",
    "checkout_url" "text",
    "provider_checkout_session_id" "text",
    "provider_payment_intent_id" "text",
    "provider_payment_id" "text",
    "payment_method" "text",
    "fee_amount" numeric(10,2) DEFAULT 0,
    "net_amount" numeric(10,2) DEFAULT 0,
    "paid_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payment_target_check" CHECK (((("booking_id" IS NOT NULL) AND ("order_id" IS NULL)) OR (("booking_id" IS NULL) AND ("order_id" IS NOT NULL)))),
    CONSTRAINT "payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['down_payment'::"text", 'balance'::"text", 'full'::"text", 'refund'::"text"]))),
    CONSTRAINT "payments_receipt_status_check" CHECK (("receipt_status" = ANY (ARRAY['issued'::"text", 'void'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "role" "text" DEFAULT 'customer'::"text" NOT NULL,
    "moto_make" "text",
    "moto_model" "text",
    "moto_year" integer,
    "moto_photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "rating_avg" numeric(3,2) DEFAULT 0,
    "rating_count" integer DEFAULT 0,
    "mechanic_photo_url" "text",
    "specialization" "text",
    "profile_photo_url" "text",
    "is_active" boolean DEFAULT true,
    "deactivated_at" timestamp with time zone,
    "deactivated_by" "uuid",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['customer'::"text", 'mechanic'::"text", 'staff'::"text", 'admin'::"text", 'super_admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."payment_receipts" AS
 SELECT "p"."id" AS "payment_id",
    "p"."receipt_number",
    "p"."receipt_status",
    "p"."receipt_issued_at",
    "p"."amount",
    "p"."payment_type",
    "p"."method",
    "p"."booking_id",
    "p"."order_id",
    "p"."processed_by",
    "processed_by_profile"."first_name" AS "processed_by_first_name",
    "processed_by_profile"."last_name" AS "processed_by_last_name",
    COALESCE("b"."customer_id", "o"."customer_id") AS "customer_id",
    "customer"."first_name" AS "customer_first_name",
    "customer"."last_name" AS "customer_last_name",
    "customer"."email" AS "customer_email",
    "customer"."phone" AS "customer_phone"
   FROM (((("public"."payments" "p"
     LEFT JOIN "public"."bookings" "b" ON (("b"."id" = "p"."booking_id")))
     LEFT JOIN "public"."orders" "o" ON (("o"."id" = "p"."order_id")))
     LEFT JOIN "public"."profiles" "customer" ON (("customer"."id" = COALESCE("b"."customer_id", "o"."customer_id"))))
     LEFT JOIN "public"."profiles" "processed_by_profile" ON (("processed_by_profile"."id" = "p"."processed_by")));


ALTER VIEW "public"."payment_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pre_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "motorcycle_make" "text",
    "motorcycle_model" "text",
    "motorcycle_year" integer,
    "issue_description" "text",
    "service_id" "uuid",
    "estimated_parts_cost" numeric(10,2) DEFAULT 0,
    "estimated_labor_cost" numeric(10,2) DEFAULT 0,
    "estimated_total" numeric(10,2) DEFAULT 0,
    "down_payment_required" numeric(10,2) DEFAULT 0,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pre_assessments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'reviewed'::"text", 'converted'::"text"])))
);


ALTER TABLE "public"."pre_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text",
    "device_name" "text",
    "app_version" "text",
    "is_active" boolean DEFAULT true,
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."receipt_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."receipt_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "target_user_id" "uuid",
    "old_role" "text",
    "new_role" "text",
    "action" "text" DEFAULT 'role_change'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."role_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "estimated_duration_minutes" integer DEFAULT 60,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "labor_cost" numeric(10,2) DEFAULT 0
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."walkin_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "queue_number" "text" NOT NULL,
    "queue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "customer_mode" "text" DEFAULT 'guest'::"text" NOT NULL,
    "customer_id" "uuid",
    "guest_name" "text",
    "guest_phone" "text",
    "motorcycle_model" "text" DEFAULT 'Walk-in Motorcycle'::"text" NOT NULL,
    "mechanic_id" "uuid",
    "services" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "products" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "service_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "product_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "payment_method" "text",
    "payment_reference" "text",
    "paid_at" timestamp with time zone,
    "payment_received_by" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_restored_at" timestamp with time zone,
    "inventory_restored_by" "uuid",
    CONSTRAINT "walkin_queue_customer_check" CHECK (((("customer_mode" = 'guest'::"text") AND ("guest_name" IS NOT NULL) AND (TRIM(BOTH FROM "guest_name") <> ''::"text")) OR (("customer_mode" = 'registered'::"text") AND ("customer_id" IS NOT NULL)))),
    CONSTRAINT "walkin_queue_customer_mode_check" CHECK (("customer_mode" = ANY (ARRAY['guest'::"text", 'registered'::"text"]))),
    CONSTRAINT "walkin_queue_guest_phone_check" CHECK ((("guest_phone" IS NULL) OR ("guest_phone" = ''::"text") OR ("guest_phone" ~ '^09[0-9]{9}$'::"text"))),
    CONSTRAINT "walkin_queue_payment_method_check" CHECK ((("payment_method" IS NULL) OR ("payment_method" = ANY (ARRAY['cash'::"text", 'gcash'::"text"])))),
    CONSTRAINT "walkin_queue_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['unpaid'::"text", 'partially_paid'::"text", 'paid'::"text"]))),
    CONSTRAINT "walkin_queue_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'in_progress'::"text", 'inspection'::"text", 'repairing'::"text", 'quality_check'::"text", 'ready_for_payment'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."walkin_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."walkin_queue_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "walkin_queue_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_type" "text" DEFAULT 'full'::"text" NOT NULL,
    "method" "text" NOT NULL,
    "reference_number" "text",
    "receipt_number" "text" DEFAULT ('WQRC-'::"text" || "upper"("substr"(("gen_random_uuid"())::"text", 1, 8))) NOT NULL,
    "receipt_issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "walkin_queue_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "walkin_queue_payments_method_check" CHECK (("method" = ANY (ARRAY['cash'::"text", 'gcash'::"text"]))),
    CONSTRAINT "walkin_queue_payments_payment_type_check" CHECK (("payment_type" = ANY (ARRAY['down_payment'::"text", 'balance'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."walkin_queue_payments" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_payments"
    ADD CONSTRAINT "booking_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_services"
    ADD CONSTRAINT "booking_services_booking_id_service_id_key" UNIQUE ("booking_id", "service_id");



ALTER TABLE ONLY "public"."booking_services"
    ADD CONSTRAINT "booking_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_part_id_key" UNIQUE ("user_id", "part_id");



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chatbot_templates"
    ADD CONSTRAINT "chatbot_templates_intent_key" UNIQUE ("intent");



ALTER TABLE ONLY "public"."chatbot_templates"
    ADD CONSTRAINT "chatbot_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_definitions"
    ADD CONSTRAINT "consent_definitions_pkey" PRIMARY KEY ("consent_type");



ALTER TABLE ONLY "public"."customer_consents"
    ADD CONSTRAINT "customer_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customizations"
    ADD CONSTRAINT "customizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mechanic_certificates"
    ADD CONSTRAINT "mechanic_certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mechanic_ratings"
    ADD CONSTRAINT "mechanic_ratings_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."mechanic_ratings"
    ADD CONSTRAINT "mechanic_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mechanic_skills"
    ADD CONSTRAINT "mechanic_skills_mechanic_id_service_id_key" UNIQUE ("mechanic_id", "service_id");



ALTER TABLE ONLY "public"."mechanic_skills"
    ADD CONSTRAINT "mechanic_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."motorcycle_models"
    ADD CONSTRAINT "motorcycle_models_make_model_key" UNIQUE ("make", "model");



ALTER TABLE ONLY "public"."motorcycle_models"
    ADD CONSTRAINT "motorcycle_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_payments"
    ADD CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parts"
    ADD CONSTRAINT "parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."pre_assessments"
    ADD CONSTRAINT "pre_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_expo_push_token_key" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_expo_push_token_unique" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_audit_logs"
    ADD CONSTRAINT "role_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_progress_events"
    ADD CONSTRAINT "service_progress_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."walkin_queue_payments"
    ADD CONSTRAINT "walkin_queue_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."walkin_queue_payments"
    ADD CONSTRAINT "walkin_queue_payments_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."walkin_queue"
    ADD CONSTRAINT "walkin_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."walkin_queue"
    ADD CONSTRAINT "walkin_queue_queue_number_key" UNIQUE ("queue_number");



CREATE UNIQUE INDEX "booking_payments_checkout_session_uidx" ON "public"."booking_payments" USING "btree" ("provider_checkout_session_id") WHERE ("provider_checkout_session_id" IS NOT NULL);



CREATE UNIQUE INDEX "booking_payments_reference_number_uidx" ON "public"."booking_payments" USING "btree" ("reference_number") WHERE ("reference_number" IS NOT NULL);



CREATE INDEX "bookings_mechanic_date_status_idx" ON "public"."bookings" USING "btree" ("mechanic_id", "booking_date", "status");



CREATE UNIQUE INDEX "cart_items_user_part_uidx" ON "public"."cart_items" USING "btree" ("user_id", "part_id");



CREATE INDEX "chatbot_templates_active_priority_idx" ON "public"."chatbot_templates" USING "btree" ("is_active", "priority", "updated_at" DESC);



CREATE INDEX "customer_consents_customer_id_idx" ON "public"."customer_consents" USING "btree" ("customer_id");



CREATE INDEX "customer_consents_customer_type_idx" ON "public"."customer_consents" USING "btree" ("customer_id", "consent_type", "is_accepted", "accepted_at" DESC);



CREATE UNIQUE INDEX "customer_consents_customer_type_version_uidx" ON "public"."customer_consents" USING "btree" ("customer_id", "consent_type", "version");



CREATE INDEX "customer_consents_type_idx" ON "public"."customer_consents" USING "btree" ("consent_type", "is_accepted");



CREATE INDEX "idx_booking_services_booking_id" ON "public"."booking_services" USING "btree" ("booking_id");



CREATE INDEX "idx_bookings_customer_active_lookup" ON "public"."bookings" USING "btree" ("customer_id", "booking_date", "booking_time", "status", "payment_status") WHERE (COALESCE("is_walkin", false) = false);



CREATE INDEX "idx_inventory_movements_created_at" ON "public"."inventory_movements" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_inventory_movements_one_sold_order_per_part" ON "public"."inventory_movements" USING "btree" ("related_order_id", "part_id") WHERE (("related_order_id" IS NOT NULL) AND ("movement_type" = 'sold_order'::"text"));



CREATE INDEX "idx_inventory_movements_part_id" ON "public"."inventory_movements" USING "btree" ("part_id");



CREATE INDEX "idx_inventory_movements_related_booking_id" ON "public"."inventory_movements" USING "btree" ("related_booking_id");



CREATE INDEX "idx_inventory_movements_related_order_id" ON "public"."inventory_movements" USING "btree" ("related_order_id");



CREATE INDEX "idx_payments_receipt_issued_at" ON "public"."payments" USING "btree" ("receipt_issued_at" DESC);



CREATE INDEX "idx_payments_receipt_number" ON "public"."payments" USING "btree" ("receipt_number");



CREATE INDEX "idx_payments_receipt_status" ON "public"."payments" USING "btree" ("receipt_status");



CREATE UNIQUE INDEX "order_payments_checkout_session_uidx" ON "public"."order_payments" USING "btree" ("provider_checkout_session_id") WHERE ("provider_checkout_session_id" IS NOT NULL);



CREATE UNIQUE INDEX "order_payments_reference_uidx" ON "public"."order_payments" USING "btree" ("reference_number") WHERE ("reference_number" IS NOT NULL);



CREATE INDEX "orders_fulfillment_method_idx" ON "public"."orders" USING "btree" ("fulfillment_method");



CREATE INDEX "orders_payment_status_idx" ON "public"."orders" USING "btree" ("payment_status");



CREATE UNIQUE INDEX "payments_provider_checkout_session_uidx" ON "public"."payments" USING "btree" ("provider_checkout_session_id") WHERE ("provider_checkout_session_id" IS NOT NULL);



CREATE UNIQUE INDEX "payments_reference_number_uidx" ON "public"."payments" USING "btree" ("reference_number") WHERE ("reference_number" IS NOT NULL);



CREATE INDEX "service_progress_events_booking_id_idx" ON "public"."service_progress_events" USING "btree" ("booking_id", "created_at");



CREATE INDEX "service_progress_events_customer_id_idx" ON "public"."service_progress_events" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "service_progress_events_mechanic_id_idx" ON "public"."service_progress_events" USING "btree" ("mechanic_id", "created_at" DESC);



CREATE INDEX "walkin_queue_created_at_idx" ON "public"."walkin_queue" USING "btree" ("created_at" DESC);



CREATE INDEX "walkin_queue_payment_status_idx" ON "public"."walkin_queue" USING "btree" ("payment_status");



CREATE INDEX "walkin_queue_payments_queue_id_idx" ON "public"."walkin_queue_payments" USING "btree" ("walkin_queue_id");



CREATE INDEX "walkin_queue_queue_date_idx" ON "public"."walkin_queue" USING "btree" ("queue_date" DESC);



CREATE INDEX "walkin_queue_status_idx" ON "public"."walkin_queue" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "booking_services_recalculate_after_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."booking_services" FOR EACH ROW EXECUTE FUNCTION "public"."booking_services_recalculate_trigger"();



CREATE OR REPLACE TRIGGER "on_rating_change" AFTER INSERT OR UPDATE ON "public"."mechanic_ratings" FOR EACH ROW EXECUTE FUNCTION "public"."update_mechanic_rating"();



CREATE OR REPLACE TRIGGER "prevent_unsettled_or_spam_bookings_trigger" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_unsettled_or_spam_bookings"();



CREATE OR REPLACE TRIGGER "send_push_on_notification_insert" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://wcqqduuimpjipwvwzyzx.supabase.co/functions/v1/send-push-notification', 'POST', '{"Content-type":"application/json","x-push-secret":"motofix_push_secret_123"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "trg_log_booking_status_progress" AFTER INSERT OR UPDATE OF "status", "mechanic_id" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."log_booking_status_progress"();



CREATE OR REPLACE TRIGGER "trg_prevent_booking_conflicts" BEFORE INSERT OR UPDATE OF "mechanic_id", "service_id", "booking_date", "booking_time", "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_booking_conflicts"();



CREATE OR REPLACE TRIGGER "trg_set_chatbot_templates_updated_at" BEFORE UPDATE ON "public"."chatbot_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_chatbot_templates_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_consent_definitions_updated_at" BEFORE UPDATE ON "public"."consent_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."set_consent_definitions_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_customer_consents_timestamps" BEFORE INSERT OR UPDATE ON "public"."customer_consents" FOR EACH ROW EXECUTE FUNCTION "public"."set_customer_consents_timestamps"();



CREATE OR REPLACE TRIGGER "trg_set_invoice_number" BEFORE INSERT ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_invoice_number"();



CREATE OR REPLACE TRIGGER "trg_set_payment_receipt_fields" BEFORE INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_payment_receipt_fields"();



CREATE OR REPLACE TRIGGER "trg_set_walkin_queue_updated_at" BEFORE UPDATE ON "public"."walkin_queue" FOR EACH ROW EXECUTE FUNCTION "public"."set_walkin_queue_updated_at"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_payments"
    ADD CONSTRAINT "booking_payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_payments"
    ADD CONSTRAINT "booking_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_services"
    ADD CONSTRAINT "booking_services_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_services"
    ADD CONSTRAINT "booking_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_inventory_restored_by_fkey" FOREIGN KEY ("inventory_restored_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_no_show_marked_by_fkey" FOREIGN KEY ("no_show_marked_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_payment_received_by_fkey" FOREIGN KEY ("payment_received_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_conversations"
    ADD CONSTRAINT "chat_conversations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chatbot_templates"
    ADD CONSTRAINT "chatbot_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chatbot_templates"
    ADD CONSTRAINT "chatbot_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_consents"
    ADD CONSTRAINT "customer_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customizations"
    ADD CONSTRAINT "customizations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_related_booking_id_fkey" FOREIGN KEY ("related_booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mechanic_certificates"
    ADD CONSTRAINT "mechanic_certificates_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mechanic_certificates"
    ADD CONSTRAINT "mechanic_certificates_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mechanic_ratings"
    ADD CONSTRAINT "mechanic_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mechanic_ratings"
    ADD CONSTRAINT "mechanic_ratings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mechanic_ratings"
    ADD CONSTRAINT "mechanic_ratings_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mechanic_skills"
    ADD CONSTRAINT "mechanic_skills_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mechanic_skills"
    ADD CONSTRAINT "mechanic_skills_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_payments"
    ADD CONSTRAINT "order_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_payments"
    ADD CONSTRAINT "order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_payment_received_by_fkey" FOREIGN KEY ("payment_received_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_receipt_issued_by_fkey" FOREIGN KEY ("receipt_issued_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pre_assessments"
    ADD CONSTRAINT "pre_assessments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pre_assessments"
    ADD CONSTRAINT "pre_assessments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_deactivated_by_fkey" FOREIGN KEY ("deactivated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_audit_logs"
    ADD CONSTRAINT "role_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."role_audit_logs"
    ADD CONSTRAINT "role_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_progress_events"
    ADD CONSTRAINT "service_progress_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_progress_events"
    ADD CONSTRAINT "service_progress_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_progress_events"
    ADD CONSTRAINT "service_progress_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_progress_events"
    ADD CONSTRAINT "service_progress_events_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walkin_queue"
    ADD CONSTRAINT "walkin_queue_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walkin_queue"
    ADD CONSTRAINT "walkin_queue_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walkin_queue"
    ADD CONSTRAINT "walkin_queue_inventory_restored_by_fkey" FOREIGN KEY ("inventory_restored_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."walkin_queue"
    ADD CONSTRAINT "walkin_queue_mechanic_id_fkey" FOREIGN KEY ("mechanic_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walkin_queue"
    ADD CONSTRAINT "walkin_queue_payment_received_by_fkey" FOREIGN KEY ("payment_received_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walkin_queue_payments"
    ADD CONSTRAINT "walkin_queue_payments_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."walkin_queue_payments"
    ADD CONSTRAINT "walkin_queue_payments_walkin_queue_id_fkey" FOREIGN KEY ("walkin_queue_id") REFERENCES "public"."walkin_queue"("id") ON DELETE CASCADE;



CREATE POLICY "Admin and staff can insert inventory movements" ON "public"."inventory_movements" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));



CREATE POLICY "Admin and staff can view inventory movements" ON "public"."inventory_movements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));



CREATE POLICY "Admin can delete inventory movements" ON "public"."inventory_movements" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admin can update inventory movements" ON "public"."inventory_movements" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins and staff can manage invoices" ON "public"."invoices" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));



CREATE POLICY "Admins and staff can manage service progress" ON "public"."service_progress_events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));



CREATE POLICY "Admins and staff can view all invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));



CREATE POLICY "Admins and staff can view all service progress" ON "public"."service_progress_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));



CREATE POLICY "Admins and staff can view chatbot templates" ON "public"."chatbot_templates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text"]))))));



CREATE POLICY "Admins and staff can view payments" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'cashier'::"text"]))))));



CREATE POLICY "Admins can delete chatbot templates" ON "public"."chatbot_templates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete parts" ON "public"."parts" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can insert chatbot templates" ON "public"."chatbot_templates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can insert parts" ON "public"."parts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage all bookings" ON "public"."bookings" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage assessments" ON "public"."pre_assessments" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage certificates" ON "public"."mechanic_certificates" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage consent definitions" ON "public"."consent_definitions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage customer consents" ON "public"."customer_consents" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage mechanic certificates" ON "public"."mechanic_certificates" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage motorcycle models" ON "public"."motorcycle_models" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage order items" ON "public"."order_items" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage orders" ON "public"."orders" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage parts" ON "public"."parts" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage payments" ON "public"."payments" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage services" ON "public"."services" USING ("public"."is_admin"());



CREATE POLICY "Admins can manage settings" ON "public"."settings" USING ("public"."is_admin"());



CREATE POLICY "Admins can update all conversations" ON "public"."chat_conversations" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can update chatbot templates" ON "public"."chatbot_templates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update parts" ON "public"."parts" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can update profiles" ON "public"."profiles" FOR UPDATE USING ((( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())) = 'admin'::"text"));



CREATE POLICY "Admins can view all certificates" ON "public"."mechanic_certificates" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all conversations" ON "public"."chat_conversations" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all customer consents" ON "public"."customer_consents" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all messages" ON "public"."chat_messages" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins can view all push tokens" ON "public"."push_tokens" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view audit logs" ON "public"."audit_logs" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Admins staff cashier can view booking payments" ON "public"."booking_payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'cashier'::"text"]))))));



CREATE POLICY "Anyone can insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can read settings" ON "public"."settings" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active services" ON "public"."services" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view mechanic certificates" ON "public"."mechanic_certificates" FOR SELECT USING (true);



CREATE POLICY "Anyone can view motorcycle models" ON "public"."motorcycle_models" FOR SELECT USING (true);



CREATE POLICY "Anyone can view parts" ON "public"."parts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view ratings" ON "public"."mechanic_ratings" FOR SELECT USING (true);



CREATE POLICY "Assigned mechanics can add service progress" ON "public"."service_progress_events" FOR INSERT TO "authenticated" WITH CHECK ((("mechanic_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."bookings"
  WHERE (("bookings"."id" = "service_progress_events"."booking_id") AND ("bookings"."mechanic_id" = "auth"."uid"()))))));



CREATE POLICY "Authenticated can read motorcycle models" ON "public"."motorcycle_models" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view active consent definitions" ON "public"."consent_definitions" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Authenticated users can view active products" ON "public"."parts" FOR SELECT TO "authenticated" USING ((COALESCE("is_active", true) = true));



CREATE POLICY "Customers can create assessments" ON "public"."pre_assessments" FOR INSERT WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can create bookings" ON "public"."bookings" FOR INSERT WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can create conversation" ON "public"."chat_conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can create customizations" ON "public"."customizations" FOR INSERT WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can create order items" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."customer_id" = "auth"."uid"())))));



CREATE POLICY "Customers can create orders" ON "public"."orders" FOR INSERT WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can delete own cart" ON "public"."cart_items" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Customers can insert own cart" ON "public"."cart_items" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Customers can insert own consents" ON "public"."customer_consents" FOR INSERT TO "authenticated" WITH CHECK (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers can insert ratings for own bookings" ON "public"."mechanic_ratings" FOR INSERT WITH CHECK ((("auth"."uid"() = "customer_id") AND (EXISTS ( SELECT 1
   FROM "public"."bookings"
  WHERE (("bookings"."id" = "mechanic_ratings"."booking_id") AND ("bookings"."customer_id" = "auth"."uid"()) AND ("bookings"."status" = 'completed'::"text"))))));



CREATE POLICY "Customers can send messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."chat_conversations" "c"
  WHERE (("c"."id" = "chat_messages"."conversation_id") AND ("c"."customer_id" = "auth"."uid"())))));



CREATE POLICY "Customers can update own cart" ON "public"."cart_items" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Customers can update own customizations" ON "public"."customizations" FOR UPDATE USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can update own pending bookings" ON "public"."bookings" FOR UPDATE USING (("auth"."uid"() = "customer_id")) WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can update own ratings" ON "public"."mechanic_ratings" FOR UPDATE USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can view own assessments" ON "public"."pre_assessments" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can view own booking payments" ON "public"."booking_payments" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can view own bookings" ON "public"."bookings" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can view own cart" ON "public"."cart_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Customers can view own consents" ON "public"."customer_consents" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers can view own conversations" ON "public"."chat_conversations" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can view own invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers can view own messages" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_conversations" "c"
  WHERE (("c"."id" = "chat_messages"."conversation_id") AND ("c"."customer_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view own order items" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders"
  WHERE (("orders"."id" = "order_items"."order_id") AND ("orders"."customer_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view own order payments" ON "public"."order_payments" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers can view own orders" ON "public"."orders" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can view own payments" ON "public"."payments" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Customers can view own service progress" ON "public"."service_progress_events" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers can view payments on their own bookings" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "payments"."booking_id") AND ("b"."customer_id" = "auth"."uid"())))));



CREATE POLICY "Customers can view payments on their own orders" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "payments"."order_id") AND ("o"."customer_id" = "auth"."uid"())))));



CREATE POLICY "Mechanics can delete own certificates" ON "public"."mechanic_certificates" FOR DELETE USING (("auth"."uid"() = "mechanic_id"));



CREATE POLICY "Mechanics can insert own certificates" ON "public"."mechanic_certificates" FOR INSERT WITH CHECK (("auth"."uid"() = "mechanic_id"));



CREATE POLICY "Mechanics can update assigned bookings" ON "public"."bookings" FOR UPDATE USING (("auth"."uid"() = "mechanic_id"));



CREATE POLICY "Mechanics can view assigned bookings" ON "public"."bookings" FOR SELECT USING (("auth"."uid"() = "mechanic_id"));



CREATE POLICY "Mechanics can view assigned service progress" ON "public"."service_progress_events" FOR SELECT TO "authenticated" USING (("mechanic_id" = "auth"."uid"()));



CREATE POLICY "Mechanics can view own booking count" ON "public"."bookings" FOR SELECT USING (("auth"."uid"() = "mechanic_id"));



CREATE POLICY "Mechanics can view own certificates" ON "public"."mechanic_certificates" FOR SELECT USING (("auth"."uid"() = "mechanic_id"));



CREATE POLICY "Products are readable by active users" ON "public"."parts" FOR SELECT TO "authenticated" USING (((COALESCE("is_active", true) = true) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'mechanic'::"text", 'admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "Staff admin can create walkin payments" ON "public"."walkin_queue_payments" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Staff admin can create walkin queue" ON "public"."walkin_queue" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Staff admin can view walkin payments" ON "public"."walkin_queue_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Staff admin mechanic can send messages" ON "public"."chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'mechanic'::"text"]))))));



CREATE POLICY "Staff admin mechanic can update conversations" ON "public"."chat_conversations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'mechanic'::"text"]))))));



CREATE POLICY "Staff admin mechanic can update walkin queue" ON "public"."walkin_queue" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text", 'mechanic'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text", 'mechanic'::"text"]))))));



CREATE POLICY "Staff admin mechanic can view all conversations" ON "public"."chat_conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'mechanic'::"text"]))))));



CREATE POLICY "Staff admin mechanic can view all messages" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'staff'::"text", 'mechanic'::"text"]))))));



CREATE POLICY "Staff admin mechanic can view walkin queue" ON "public"."walkin_queue" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text", 'mechanic'::"text"]))))));



CREATE POLICY "Staff can insert audit logs" ON "public"."audit_logs" FOR INSERT WITH CHECK (("public"."is_staff"() OR "public"."is_admin"() OR (("auth"."jwt"() ->> 'role'::"text") = 'staff'::"text") OR (("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")));



CREATE POLICY "Staff can insert profiles" ON "public"."profiles" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage booking services" ON "public"."booking_services" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Staff can manage bookings" ON "public"."bookings" USING ("public"."is_staff"());



CREATE POLICY "Staff can manage order_items" ON "public"."order_items" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage orders" ON "public"."orders" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can manage payments" ON "public"."payments" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can update parts" ON "public"."parts" FOR UPDATE USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "Staff can view order payments" ON "public"."order_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Super admins can delete motorcycle models" ON "public"."motorcycle_models" FOR DELETE TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can insert motorcycle models" ON "public"."motorcycle_models" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Super admins can read inventory movements" ON "public"."inventory_movements" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Super admins can update motorcycle models" ON "public"."motorcycle_models" FOR UPDATE TO "authenticated" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all audit logs for reports" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all booking payments for reports" ON "public"."booking_payments" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all booking services for reports" ON "public"."booking_services" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all bookings for reports" ON "public"."bookings" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all order items for reports" ON "public"."order_items" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all orders for reports" ON "public"."orders" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all payments for reports" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all products for reports" ON "public"."parts" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all services for reports" ON "public"."services" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all walkin payments for reports" ON "public"."walkin_queue_payments" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view all walkin queue for reports" ON "public"."walkin_queue" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admins can view role audit logs" ON "public"."role_audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'super_admin'::"text")))));



CREATE POLICY "Users can create customizations" ON "public"."customizations" FOR INSERT WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Users can delete own cart" ON "public"."cart_items" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own push tokens" ON "public"."push_tokens" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own cart" ON "public"."cart_items" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own consents" ON "public"."customer_consents" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Users can insert own push tokens" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own cart" ON "public"."cart_items" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own consents" ON "public"."customer_consents" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "customer_id")) WITH CHECK (("auth"."uid"() = "customer_id"));



CREATE POLICY "Users can update own customizations" ON "public"."customizations" FOR UPDATE USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own push tokens" ON "public"."push_tokens" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own booking services" ON "public"."booking_services" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_services"."booking_id") AND ("b"."customer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = ANY (ARRAY['staff'::"text", 'mechanic'::"text", 'admin'::"text", 'super_admin'::"text"])))))));



CREATE POLICY "Users can view own cart" ON "public"."cart_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own consents" ON "public"."customer_consents" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Users can view own customizations" ON "public"."customizations" FOR SELECT USING (("auth"."uid"() = "customer_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own push tokens" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cart_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatbot_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consent_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mechanic_certificates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mechanic_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mechanic_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."motorcycle_models" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pre_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_progress_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."walkin_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."walkin_queue_payments" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_customer_consent"("p_consent_type" "text", "p_metadata" "jsonb", "p_source_page" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_customer_consent"("p_consent_type" "text", "p_metadata" "jsonb", "p_source_page" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_customer_consent"("p_consent_type" "text", "p_metadata" "jsonb", "p_source_page" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "service_role";



GRANT ALL ON TABLE "public"."service_progress_events" TO "anon";
GRANT ALL ON TABLE "public"."service_progress_events" TO "authenticated";
GRANT ALL ON TABLE "public"."service_progress_events" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_service_progress_event"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."add_service_progress_event"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_service_progress_event"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_to_cart"("p_user_id" "uuid", "p_part_id" "uuid", "p_quantity" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_to_cart"("p_user_id" "uuid", "p_part_id" "uuid", "p_quantity" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_to_cart"("p_user_id" "uuid", "p_part_id" "uuid", "p_quantity" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_part_stock"("p_part_id" "uuid", "p_movement_type" "text", "p_quantity" integer, "p_reason" "text", "p_related_order_id" "uuid", "p_related_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_part_stock"("p_part_id" "uuid", "p_movement_type" "text", "p_quantity" integer, "p_reason" "text", "p_related_order_id" "uuid", "p_related_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_part_stock"("p_part_id" "uuid", "p_movement_type" "text", "p_quantity" integer, "p_reason" "text", "p_related_order_id" "uuid", "p_related_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."booking_services_recalculate_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."booking_services_recalculate_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_services_recalculate_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."booking_time_to_minutes"("p_booking_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."booking_time_to_minutes"("p_booking_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."booking_time_to_minutes"("p_booking_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_admin_portal"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_admin_portal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_admin_portal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."change_user_role"("target_user_id" "uuid", "new_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."change_user_role"("target_user_id" "uuid", "new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_user_role"("target_user_id" "uuid", "new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_booking_slot_available"("p_booking_date" "date", "p_booking_time" time without time zone, "p_duration_minutes" integer, "p_mechanic_id" "uuid", "p_exclude_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_booking_slot_available"("p_booking_date" "date", "p_booking_time" time without time zone, "p_duration_minutes" integer, "p_mechanic_id" "uuid", "p_exclude_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_booking_slot_available"("p_booking_date" "date", "p_booking_time" time without time zone, "p_duration_minutes" integer, "p_mechanic_id" "uuid", "p_exclude_booking_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_booking_with_conflict_check"("p_service_id" "uuid", "p_mechanic_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_notes" "text", "p_down_payment" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."create_booking_with_conflict_check"("p_service_id" "uuid", "p_mechanic_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_notes" "text", "p_down_payment" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_booking_with_conflict_check"("p_service_id" "uuid", "p_mechanic_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone, "p_notes" "text", "p_down_payment" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_walkin_queue_number"("p_queue_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_walkin_queue_number"("p_queue_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_walkin_queue_number"("p_queue_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."decrement_stock"("part_id" "uuid", "qty" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."decrement_stock"("part_id" "uuid", "qty" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."decrement_stock"("part_id" "uuid", "qty" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_or_sync_invoice"("p_order_id" "uuid", "p_booking_id" "uuid", "p_due_date" "date", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_or_sync_invoice"("p_order_id" "uuid", "p_booking_id" "uuid", "p_due_date" "date", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_or_sync_invoice"("p_order_id" "uuid", "p_booking_id" "uuid", "p_due_date" "date", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_receipt_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_receipt_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_receipt_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_booking_duration_minutes"("p_service_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_booking_duration_minutes"("p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_booking_duration_minutes"("p_service_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_orders_with_payment_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_orders_with_payment_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_orders_with_payment_summary"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_progress_description"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_progress_description"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_progress_description"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_progress_percent"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_progress_percent"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_progress_percent"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_progress_title"("p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_progress_title"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_progress_title"("p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_booking_conflict"("p_booking_id" "uuid", "p_mechanic_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."has_booking_conflict"("p_booking_id" "uuid", "p_mechanic_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_booking_conflict"("p_booking_id" "uuid", "p_mechanic_id" "uuid", "p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_system_service_progress_event"("p_booking_id" "uuid", "p_customer_id" "uuid", "p_mechanic_id" "uuid", "p_status" "text", "p_created_by" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_system_service_progress_event"("p_booking_id" "uuid", "p_customer_id" "uuid", "p_mechanic_id" "uuid", "p_status" "text", "p_created_by" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_system_service_progress_event"("p_booking_id" "uuid", "p_customer_id" "uuid", "p_mechanic_id" "uuid", "p_status" "text", "p_created_by" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_booking_status_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_booking_status_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_booking_status_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_messages_read"("conv_id" "uuid", "reader_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_messages_read"("conv_id" "uuid", "reader_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_messages_read"("conv_id" "uuid", "reader_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_role"("p_role" "text", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_role"("p_role" "text", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_role"("p_role" "text", "p_title" "text", "p_message" "text", "p_type" "text", "p_related_table" "text", "p_related_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_booking_conflicts"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_booking_conflicts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_booking_conflicts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_unsettled_or_spam_bookings"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_unsettled_or_spam_bookings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_unsettled_or_spam_bookings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_booking_service_total"("p_booking_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_booking_service_total"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_booking_service_total"("p_booking_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recommend_mechanics"("p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."recommend_mechanics"("p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recommend_mechanics"("p_service_id" "uuid", "p_booking_date" "date", "p_booking_time" time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."reserve_order_stock"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_order_stock"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_order_stock"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_customer_consent"("p_consent_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_customer_consent"("p_consent_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_customer_consent"("p_consent_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."revoke_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_customer_consent"("p_customer_id" "uuid", "p_consent_type" "text", "p_version" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_service_progress_parts"("p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_service_progress_parts"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_service_progress_parts"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_service_progress_parts"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_chatbot_templates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_chatbot_templates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_chatbot_templates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_consent_definitions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_consent_definitions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_consent_definitions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_customer_consents_timestamps"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_customer_consents_timestamps"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_customer_consents_timestamps"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_invoice_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_payment_receipt_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_payment_receipt_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_payment_receipt_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_walkin_queue_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_walkin_queue_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_walkin_queue_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_booking_service_progress"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_booking_service_progress"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_booking_service_progress"("p_booking_id" "uuid", "p_status" "text", "p_title" "text", "p_description" "text", "p_progress_percent" integer, "p_event_type" "text", "p_photo_url" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_mechanic_rating"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_mechanic_rating"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_mechanic_rating"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."booking_payments" TO "anon";
GRANT ALL ON TABLE "public"."booking_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_payments" TO "service_role";



GRANT ALL ON TABLE "public"."booking_services" TO "anon";
GRANT ALL ON TABLE "public"."booking_services" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_services" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items" TO "anon";
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items" TO "service_role";



GRANT ALL ON TABLE "public"."chat_conversations" TO "anon";
GRANT ALL ON TABLE "public"."chat_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chatbot_templates" TO "anon";
GRANT ALL ON TABLE "public"."chatbot_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."chatbot_templates" TO "service_role";



GRANT ALL ON TABLE "public"."consent_definitions" TO "anon";
GRANT ALL ON TABLE "public"."consent_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."consent_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."customer_consents" TO "anon";
GRANT ALL ON TABLE "public"."customer_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_consents" TO "service_role";



GRANT ALL ON TABLE "public"."customizations" TO "anon";
GRANT ALL ON TABLE "public"."customizations" TO "authenticated";
GRANT ALL ON TABLE "public"."customizations" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."mechanic_certificates" TO "anon";
GRANT ALL ON TABLE "public"."mechanic_certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."mechanic_certificates" TO "service_role";



GRANT ALL ON TABLE "public"."mechanic_ratings" TO "anon";
GRANT ALL ON TABLE "public"."mechanic_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."mechanic_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."mechanic_skills" TO "anon";
GRANT ALL ON TABLE "public"."mechanic_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."mechanic_skills" TO "service_role";



GRANT ALL ON TABLE "public"."motorcycle_models" TO "anon";
GRANT ALL ON TABLE "public"."motorcycle_models" TO "authenticated";
GRANT ALL ON TABLE "public"."motorcycle_models" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_payments" TO "anon";
GRANT ALL ON TABLE "public"."order_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."order_payments" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."parts" TO "anon";
GRANT ALL ON TABLE "public"."parts" TO "authenticated";
GRANT ALL ON TABLE "public"."parts" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."payment_receipts" TO "anon";
GRANT ALL ON TABLE "public"."payment_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."pre_assessments" TO "anon";
GRANT ALL ON TABLE "public"."pre_assessments" TO "authenticated";
GRANT ALL ON TABLE "public"."pre_assessments" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."receipt_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."role_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."role_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."role_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."walkin_queue" TO "anon";
GRANT ALL ON TABLE "public"."walkin_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."walkin_queue" TO "service_role";



GRANT ALL ON TABLE "public"."walkin_queue_payments" TO "anon";
GRANT ALL ON TABLE "public"."walkin_queue_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."walkin_queue_payments" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







