-- Migration 010: Fix RLS Policies & Group Multi-Item Transactions into Single Clean Entries
-- Date: 2026-08-31

-- 1. CLEAN RLS POLICIES FOR OPERATIONAL AND MASTER TABLES
DROP POLICY IF EXISTS "Allow anon read plants" ON public.plants;
DROP POLICY IF EXISTS "Allow authenticated insert plants" ON public.plants;
DROP POLICY IF EXISTS "Allow authenticated update plants" ON public.plants;
DROP POLICY IF EXISTS "Allow anon insert plants" ON public.plants;
DROP POLICY IF EXISTS "Allow anon update plants" ON public.plants;
DROP POLICY IF EXISTS "Allow anon delete plants" ON public.plants;
DROP POLICY IF EXISTS "Allow public all plants" ON public.plants;

CREATE POLICY "Allow public all plants" ON public.plants FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read lots" ON public.lots;
DROP POLICY IF EXISTS "Allow authenticated insert lots" ON public.lots;
DROP POLICY IF EXISTS "Allow authenticated update lots" ON public.lots;
DROP POLICY IF EXISTS "Allow anon insert lots" ON public.lots;
DROP POLICY IF EXISTS "Allow anon update lots" ON public.lots;
DROP POLICY IF EXISTS "Allow public all lots" ON public.lots;

CREATE POLICY "Allow public all lots" ON public.lots FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read customers" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated insert customers" ON public.customers;
DROP POLICY IF EXISTS "Allow anon insert customers" ON public.customers;
DROP POLICY IF EXISTS "Allow anon update customers" ON public.customers;
DROP POLICY IF EXISTS "Allow public all customers" ON public.customers;

CREATE POLICY "Allow public all customers" ON public.customers FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow authenticated insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow anon insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow anon update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow public all expenses" ON public.expenses;

CREATE POLICY "Allow public all expenses" ON public.expenses FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read payment_qrs" ON public.payment_qrs;
DROP POLICY IF EXISTS "Allow authenticated insert payment_qrs" ON public.payment_qrs;
DROP POLICY IF EXISTS "Allow anon insert payment_qrs" ON public.payment_qrs;
DROP POLICY IF EXISTS "Allow anon update payment_qrs" ON public.payment_qrs;
DROP POLICY IF EXISTS "Allow public all payment_qrs" ON public.payment_qrs;

CREATE POLICY "Allow public all payment_qrs" ON public.payment_qrs FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow authenticated insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow anon insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow anon update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow anon delete attendance" ON public.attendance;
DROP POLICY IF EXISTS "Allow public all attendance" ON public.attendance;

CREATE POLICY "Allow public all attendance" ON public.attendance FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. DROP AND REBUILD GROUPED VW_DAILY_CASHBOOK
DROP VIEW IF EXISTS public.vw_profit_summary CASCADE;
DROP VIEW IF EXISTS public.vw_daily_cashbook CASCADE;

CREATE OR REPLACE VIEW public.vw_daily_cashbook AS
-- Booking Payments (Grouped by booking_number and payment event)
SELECT 
    MIN(bp.payment_date) AS datetime,
    'BOOKING_PAYMENT' AS transaction_type,
    SUM(bp.cash_amount) AS cash,
    SUM(bp.upi_amount) AS upi,
    SUM(bp.cash_amount + bp.upi_amount) AS total,
    'Booking ' || bp.payment_type || ' #' || b.booking_number || 
      COALESCE(' (' || NULLIF(MIN(b.customer_name), '') || ')', '') AS description,
    bp.created_by AS worker_id,
    MIN(u.name) AS worker_name,
    b.booking_number AS reference_number
FROM public.booking_payments bp
JOIN public.bookings b ON bp.booking_id = b.id
LEFT JOIN public.users u ON bp.created_by = u.id
WHERE b.deleted_at IS NULL
GROUP BY b.booking_number, bp.payment_type, bp.payment_date, bp.created_by

UNION ALL

-- Direct Sales (Grouped by sale_number so multi-variety sales are ONE single transaction)
SELECT 
    MIN(ds.created_at) AS datetime,
    'DIRECT_SALE' AS transaction_type,
    SUM(COALESCE(ds.cash_amount, CASE WHEN ds.payment_mode = 'Cash' THEN ds.amount ELSE 0 END)) AS cash,
    SUM(COALESCE(ds.upi_amount, CASE WHEN ds.payment_mode = 'UPI' THEN ds.amount ELSE 0 END)) AS upi,
    SUM(ds.amount) AS total,
    'Direct Sale #' || ds.sale_number || 
      COALESCE(' (' || NULLIF(MIN(ds.customer_name), '') || ')', '') || 
      CASE WHEN COUNT(*) > 1 THEN ' - ' || COUNT(*) || ' items' ELSE '' END AS description,
    ds.worker_id AS worker_id,
    MIN(u.name) AS worker_name,
    ds.sale_number AS reference_number
FROM public.direct_sales ds
LEFT JOIN public.users u ON ds.worker_id = u.id
WHERE ds.deleted_at IS NULL
GROUP BY ds.sale_number, ds.worker_id

UNION ALL

-- Expenses
SELECT 
    e.expense_date AS datetime,
    'EXPENSE' AS transaction_type,
    CASE WHEN e.payment_mode = 'Cash' THEN -e.amount ELSE 0 END AS cash,
    CASE WHEN e.payment_mode = 'UPI' THEN -e.amount ELSE 0 END AS upi,
    -e.amount AS total,
    'Expense: ' || e.category || COALESCE(' - ' || e.description, '') AS description,
    e.created_by AS worker_id,
    u.name AS worker_name,
    e.id::text AS reference_number
FROM public.expenses e
LEFT JOIN public.users u ON e.created_by = u.id;

-- 3. REBUILD VW_PROFIT_SUMMARY
CREATE OR REPLACE VIEW public.vw_profit_summary AS
SELECT 
    datetime::date AS date,
    SUM(CASE WHEN total > 0 THEN total ELSE 0 END) AS revenue,
    SUM(CASE WHEN total < 0 THEN ABS(total) ELSE 0 END) AS expenses,
    SUM(total) AS profit
FROM public.vw_daily_cashbook
GROUP BY datetime::date
ORDER BY datetime::date DESC;

-- 4. GRANTS
GRANT SELECT ON public.vw_daily_cashbook TO anon, authenticated, service_role;
GRANT SELECT ON public.vw_profit_summary TO anon, authenticated, service_role;
