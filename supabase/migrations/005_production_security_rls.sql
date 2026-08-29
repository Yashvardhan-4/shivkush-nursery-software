-- SPRINT 4B: PRODUCTION SECURITY & RLS LOCKDOWN
-- Migration: 005_production_security_rls.sql

-- 1. Enable RLS on all public tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_qrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- 3. Users Table Policies (Strict isolation: anonymous access completely blocked)
CREATE POLICY users_select_auth ON public.users 
    FOR SELECT TO authenticated 
    USING (true);

-- 4. Plants Table Policies
CREATE POLICY plants_select_all ON public.plants 
    FOR SELECT TO public 
    USING (deleted_at IS NULL);

CREATE POLICY plants_write_auth ON public.plants 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 5. Lots Table Policies
CREATE POLICY lots_select_all ON public.lots 
    FOR SELECT TO public 
    USING (deleted_at IS NULL);

CREATE POLICY lots_write_auth ON public.lots 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 6. Bookings Table Policies
CREATE POLICY bookings_select_all ON public.bookings 
    FOR SELECT TO public 
    USING (deleted_at IS NULL);

CREATE POLICY bookings_write_auth ON public.bookings 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 7. Allotments Table Policies
CREATE POLICY allotments_select_all ON public.allotments 
    FOR SELECT TO public 
    USING (deleted_at IS NULL);

CREATE POLICY allotments_write_auth ON public.allotments 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 8. Direct Sales Table Policies
CREATE POLICY direct_sales_select_all ON public.direct_sales 
    FOR SELECT TO public 
    USING (deleted_at IS NULL);

CREATE POLICY direct_sales_write_auth ON public.direct_sales 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 9. Booking Payments Table Policies (Finance: strictly authenticated)
CREATE POLICY booking_payments_select_auth ON public.booking_payments 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY booking_payments_write_auth ON public.booking_payments 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 10. Expenses Table Policies (Finance: strictly authenticated)
CREATE POLICY expenses_select_auth ON public.expenses 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY expenses_write_auth ON public.expenses 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 11. Audit Logs Table Policies
CREATE POLICY audit_logs_select_auth ON public.audit_logs 
    FOR SELECT TO authenticated 
    USING (true);

CREATE POLICY audit_logs_insert_auth ON public.audit_logs 
    FOR INSERT TO authenticated 
    WITH CHECK (true);

-- 12. Attendance Table Policies
CREATE POLICY attendance_select_all ON public.attendance 
    FOR SELECT TO public 
    USING (deleted_at IS NULL);

CREATE POLICY attendance_write_auth ON public.attendance 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 13. Payment QRs Table Policies
CREATE POLICY payment_qrs_select_all ON public.payment_qrs 
    FOR SELECT TO public 
    USING (deleted_at IS NULL AND active = true);

CREATE POLICY payment_qrs_write_auth ON public.payment_qrs 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- 14. Transactions Table Policies (Legacy compatibility)
CREATE POLICY transactions_select_all ON public.transactions 
    FOR SELECT TO public 
    USING (deleted_at IS NULL);

CREATE POLICY transactions_write_auth ON public.transactions 
    FOR ALL TO authenticated 
    USING (true) 
    WITH CHECK (true);
