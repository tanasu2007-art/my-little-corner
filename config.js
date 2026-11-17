/*
  ✿ my little corner — settings ✿

  Paste the two values from your Supabase project here:
    • Project URL     → Supabase: Project Settings → Data API (or the "Connect" button)
    • Publishable key → Supabase: Project Settings → API Keys (starts with sb_publishable_)

  Until you do, the site runs in "demo mode": everything works,
  but it's only saved in the browser you're using.

  The publishable key is meant to be public — your data is protected
  by the privacy rules in setup.sql.
  NEVER paste the SECRET key (sb_secret_…) or a "service_role" key here.
*/
window.CORNER_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_URL",          // looks like https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: "YOUR_PUBLISHABLE_KEY",  // looks like sb_publishable_...
  YOUR_NAME: ""                               // optional, e.g. "tana" → "hi tana" on the home page
};
