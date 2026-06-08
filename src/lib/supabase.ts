import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pvwwfsdlifwiwjiznrku.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2d3dmc2RsaWZ3aXdqaXpucmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTE0MzAsImV4cCI6MjA5NjA2NzQzMH0.QuZaE6VDcfeXOdgqG5rD7oCu57wFySPohrmlCrNFuZg";

export const supabase = createClient(supabaseUrl, supabaseKey);