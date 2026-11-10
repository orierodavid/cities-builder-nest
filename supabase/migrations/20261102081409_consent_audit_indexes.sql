-- Cover the legal-document foreign key for efficient acceptance-history joins.
create index if not exists user_consents_legal_document_idx
  on public.user_consents(legal_document_id);
