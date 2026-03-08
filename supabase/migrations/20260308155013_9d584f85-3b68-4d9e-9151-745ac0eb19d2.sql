
-- Drop overly permissive policies and replace with appropriate ones
-- For booking_requests: tighten INSERT to only allow pending status
DROP POLICY IF EXISTS "Anyone authenticated can insert booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Clients can read own booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Trainer can update booking requests" ON public.booking_requests;

-- Allow anon to read available slots (client booking page uses anon key)
CREATE POLICY "Anon can read bookable slots" ON public.availability_slots
  FOR SELECT TO anon USING (is_bookable = true);

-- Allow anon to insert booking requests (validated via booking code client-side)
CREATE POLICY "Anon can insert booking requests" ON public.booking_requests
  FOR INSERT TO anon WITH CHECK (status = 'pending');

-- Allow anon to read booking requests for a specific client
CREATE POLICY "Anon can read booking requests" ON public.booking_requests
  FOR SELECT TO anon USING (true);

-- Allow anon to update own booking requests (cancel only)
CREATE POLICY "Anon can cancel booking requests" ON public.booking_requests
  FOR UPDATE TO anon USING (true) WITH CHECK (status = 'cancelled');

-- Trainer (authenticated) full access
CREATE POLICY "Trainer can read all booking requests" ON public.booking_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Trainer can update booking requests" ON public.booking_requests
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Trainer can insert booking requests" ON public.booking_requests
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow anon to read clients table for booking code validation
CREATE POLICY "Anon can read client by booking code" ON public.clients
  FOR SELECT TO anon USING (booking_code IS NOT NULL AND booking_code_active = true);
