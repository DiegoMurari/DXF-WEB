import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://txdvsqdftdxotvzctwyf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4ZHZzcWRmdGR4b3R2emN0d3lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0NTIyOTIsImV4cCI6MjA2MjAyODI5Mn0.xDMO6Cz7Xyw_YgIojW_rx2getoQORbCbw2viXkM3n4o'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
