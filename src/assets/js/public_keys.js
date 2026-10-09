/**
 * Public configuration only. Never put Ticket Tailor secret keys here.
 * Local: http://localhost:8000 (pnpm start).
 * Production: your Railway HTTPS URL, no trailing slash required.
 *
 * tortillanetSupabaseAnonKey is TortillaNet's public anon key, already in
 * their browser bundle. It is not a Ticket Tailor secret.
 */
export const publicKeys = {
  ticketTailorProxyUrl: "http://localhost:8000",
  // Public Supabase client tortillanet.app already ships in the browser.
  // Leave the URL or key blank to hide the TortillaNet list on /events.
  tortillanetSupabaseUrl: "https://xqktvvwfyxiewplfvzvw.supabase.co",
  tortillanetSupabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhxa3R2dndmeXhpZXdwbGZ2enZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDk0MjMsImV4cCI6MjA5NjQyNTQyM30.TK597l1gDIiIlh1UvMyNdORnKn1PltFxL-P7qiccP7k",
  tortillanetCommunitySlug: "eugene-cuddle-club",
};
