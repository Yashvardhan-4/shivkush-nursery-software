-- 004_update_process_bookings.sql
-- Sprint 3B: Update process_bookings_batch to insert ADVANCE payment into booking_payments automatically.

CREATE OR REPLACE FUNCTION public.process_bookings_batch(p_bookings jsonb, p_customer jsonb, p_audit jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_customer_id UUID;
    v_booking JSONB;
BEGIN
    IF p_customer IS NOT NULL AND p_customer->>'mobile' IS NOT NULL AND p_customer->>'mobile' != '' THEN
        INSERT INTO customers (id, name, mobile, city, created_at) 
        VALUES (COALESCE((p_customer->>'id')::uuid, gen_random_uuid()), p_customer->>'name', p_customer->>'mobile', p_customer->>'city', now()) 
        ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city 
        RETURNING id INTO v_customer_id;
    END IF;

    FOR v_booking IN SELECT * FROM jsonb_array_elements(p_bookings) LOOP
        INSERT INTO bookings (id, booking_number, customer_name, customer_phone, city, plant_id, lot_id, quantity, advance_paid, advance_payment_mode, advance_cash_amount, advance_upi_amount, total_amount, booking_date, delivery_date, status, remarks, payment_mode, cash_amount, upi_amount, worker_id, assigned_to, created_at)
        VALUES ((v_booking->>'id')::uuid, v_booking->>'booking_number', v_booking->>'customer_name', v_booking->>'customer_phone', v_booking->>'city', (v_booking->>'plant_id')::uuid, NULLIF(v_booking->>'lot_id', '')::uuid, (v_booking->>'quantity')::int, (v_booking->>'advance_paid')::numeric, v_booking->>'advance_payment_mode', (v_booking->>'advance_cash_amount')::numeric, (v_booking->>'advance_upi_amount')::numeric, (v_booking->>'total_amount')::numeric, (v_booking->>'booking_date')::date, (v_booking->>'delivery_date')::date, v_booking->>'status', v_booking->>'remarks', v_booking->>'payment_mode', (v_booking->>'cash_amount')::numeric, (v_booking->>'upi_amount')::numeric, (v_booking->>'worker_id')::uuid, (v_booking->>'assigned_to')::uuid, now());

        -- Legacy Insert into transactions if advance is paid
        IF (v_booking->>'advance_paid')::numeric > 0 THEN
            INSERT INTO transactions (reference_type, reference_id, booking_number, customer_name, plant_names, amount, payment_mode, cash_amount, upi_amount, worker_id, created_at)
            VALUES (
                'BOOKING_ADVANCE', 
                (v_booking->>'id')::uuid, 
                v_booking->>'booking_number', 
                v_booking->>'customer_name', 
                (SELECT plant_name FROM plants WHERE id = (v_booking->>'plant_id')::uuid), 
                (v_booking->>'advance_paid')::numeric, 
                v_booking->>'advance_payment_mode', 
                (v_booking->>'advance_cash_amount')::numeric, 
                (v_booking->>'advance_upi_amount')::numeric, 
                (v_booking->>'worker_id')::uuid, 
                now()
            );
            
            -- NEW Sprint 3B immutable booking_payments event
            INSERT INTO booking_payments (
                booking_id,
                payment_type,
                cash_amount,
                upi_amount,
                payment_date,
                created_by
            ) VALUES (
                (v_booking->>'id')::uuid,
                'ADVANCE',
                (v_booking->>'advance_cash_amount')::numeric,
                (v_booking->>'advance_upi_amount')::numeric,
                now(),
                (v_booking->>'worker_id')::uuid
            );
        END IF;

        INSERT INTO audit_logs (id, user_id, user_name, action, table_name, record_id, details, created_at)
        VALUES (gen_random_uuid(), (p_audit->>'user_id')::uuid, p_audit->>'user_name', p_audit->>'action', 'bookings', v_booking->>'id', p_audit->'details', now());
    END LOOP;
END;
$function$;
