import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Cliente publico: solo puede hacer lo que las politicas de RLS permitan.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
