-- Supabase Schema for Taruchhaya Wholesale Inventory

-- 1. Create the Products Table
CREATE TABLE IF NOT EXISTS public.products (
    sku TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    price NUMERIC(10, 2) DEFAULT 0.00,
    stock INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create the Stock Movement History Table
CREATE TABLE IF NOT EXISTS public.history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT now(),
    product_sku TEXT REFERENCES public.products(sku) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('inward', 'outward')),
    quantity INTEGER NOT NULL,
    old_balance INTEGER NOT NULL,
    new_balance INTEGER NOT NULL,
    note TEXT,
    finalized BOOLEAN DEFAULT FALSE
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;

-- Create Policies to allow all anonymous access (simplifies setup for internal tools)
CREATE POLICY "Allow anonymous read access" ON public.products FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.products FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.products FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.products FOR DELETE USING (true);

CREATE POLICY "Allow anonymous read access" ON public.history FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert access" ON public.history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous update access" ON public.history FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous delete access" ON public.history FOR DELETE USING (true);
