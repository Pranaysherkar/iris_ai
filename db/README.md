# Database Setup Guide

This folder keeps SQL schema modular so each concern is easy to understand and maintain.

## File Order

Run files in this exact order in Supabase SQL Editor:

1. `01_extensions.sql`
2. `02_enums.sql`
3. `03_tables_conversations.sql`
4. `04_tables_messages.sql`
5. `05_tables_attachments.sql`
6. `06_tables_summaries_and_rag.sql`
7. `07_indexes.sql`
8. `08_functions_and_triggers.sql`
9. `09_rls_policies.sql`
10. `10_tables_profiles.sql`

## Notes

- All tables use UUID primary keys.
- Soft delete is handled through `deleted_at` and `deleted_by`.
- Message order under concurrency uses `seq_no` assigned by a trigger.
- RLS ensures users can access only their own rows.
