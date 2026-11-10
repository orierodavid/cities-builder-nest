# Realistic API load test

This workflow uses a disposable PostgreSQL database, synthetic fixture data, and a local test authentication stub to exercise actual CB Nest read endpoints. It never calls production Supabase or payment services. It measures dashboard reads, resident visitor-pass history, security visitor lookup, and event attendance reads through the Express API and native PostgreSQL transaction layer. It is an isolated CI benchmark, not a production capacity certification.
