-- SPRINT 4B: ATOMIC BOOKING CANCELLATION RPC (BKG-004)
-- Migration: 006_atomic_booking_cancellation.sql

CREATE OR REPLACE FUNCTION public.rpc_cancel_booking(
    p_booking_number text,
    p_user_id uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking record;
    v_booking_count int;
    v_caller_uid uuid;
    v_caller_name text := 'Staff';
BEGIN
    -- Authorization & Identity Hardening:
    -- 1. If called via authenticated user JWT, always enforce auth.uid() to prevent user impersonation.
    -- 2. If called via service_role/internal context where auth.uid() is null, use verified p_user_id if valid.
    IF auth.uid() IS NOT NULL THEN
        v_caller_uid := auth.uid();
    ELSIF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
        v_caller_uid := p_user_id;
    ELSE
        -- Fallback to default owner UUID
        v_caller_uid := '00000000-0000-0000-0000-000000000000'::uuid;
    END IF;
    
    SELECT name INTO v_caller_name FROM public.users WHERE id = v_caller_uid;
    IF v_caller_name IS NULL THEN
        v_caller_name := 'Staff';
    END IF;

    -- 1. Check if booking exists and count rows
    SELECT COUNT(*) INTO v_booking_count 
    FROM public.bookings 
    WHERE booking_number = p_booking_number AND deleted_at IS NULL;

    IF v_booking_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Booking not found');
    END IF;

    -- 2. Verify booking is cancellable (cannot cancel already Delivered or Cancelled booking)
    IF EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE booking_number = p_booking_number AND status = 'Delivered' AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Cannot cancel a booking that has already been delivered');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE booking_number = p_booking_number AND status = 'Cancelled' AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Booking is already cancelled');
    END IF;

    -- 3. Release/deactivate all active allotments belonging to this booking
    UPDATE public.allotments a
    SET deleted_at = NOW()
    FROM public.bookings b
    WHERE a.booking_id = b.id
      AND b.booking_number = p_booking_number
      AND a.deleted_at IS NULL;

    -- 4. Mark booking rows as Cancelled (strictly retain advance, NO refund created per BKG-004)
    UPDATE public.bookings
    SET status = 'Cancelled',
        refund_amount = 0,
        refund_payment_mode = NULL,
        refund_status = 'Forfeited',
        updated_at = NOW()
    WHERE booking_number = p_booking_number AND deleted_at IS NULL;

    -- 5. Write audit log entry
    INSERT INTO public.audit_logs (
        id, user_id, user_name, action, table_name, record_id, details, created_at
    ) VALUES (
        uuid_generate_v4(),
        v_caller_uid,
        v_caller_name,
        'CANCEL_BOOKING',
        'bookings',
        p_booking_number,
        json_build_object(
            'note', 'Booking cancelled (advance retained by nursery per policy BKG-004)',
            'items_count', v_booking_count
        ),
        NOW()
    );

    RETURN json_build_object(
        'success', true, 
        'booking_number', p_booking_number, 
        'items_cancelled', v_booking_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Security: Restrict execution strictly to authenticated and service_role. Revoke anon.
REVOKE EXECUTE ON FUNCTION public.rpc_cancel_booking(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_booking(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_booking(text, uuid) TO service_role;
