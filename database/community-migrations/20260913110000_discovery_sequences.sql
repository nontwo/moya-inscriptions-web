CREATE TABLE community.featured_content (
 content_type TEXT NOT NULL CHECK(content_type IN ('catalog','work')),
 content_id TEXT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 position BIGINT NOT NULL DEFAULT 0 CHECK(position>=0),
 PRIMARY KEY(content_type,content_id)
);
CREATE TABLE community.featured_settings (
 id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id),
 enabled_quantity BIGINT CHECK(enabled_quantity>=0)
);
INSERT INTO community.featured_settings(id,enabled_quantity) VALUES(TRUE,NULL);
CREATE TABLE community.discovery_sequences (
 id UUID PRIMARY KEY,
 viewer_id TEXT REFERENCES community.public_users(id),
 query JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community.discovery_sequence_items (
 sequence_id UUID NOT NULL REFERENCES community.discovery_sequences(id) ON DELETE CASCADE,
 ordinal BIGINT NOT NULL,
 content_type TEXT NOT NULL CHECK(content_type IN ('catalog','work')),
 content_id TEXT NOT NULL,
 PRIMARY KEY(sequence_id,ordinal),
 UNIQUE(sequence_id,content_type,content_id)
);
CREATE TABLE community.content_operator_events (
 id UUID PRIMARY KEY,
 operator_label TEXT NOT NULL,
 action TEXT NOT NULL,
 content_type TEXT,
 content_id TEXT,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 detail JSONB NOT NULL
);
CREATE TABLE community.content_operator_receipts (
 operator_label TEXT NOT NULL,
 request_id UUID NOT NULL,
 fingerprint TEXT NOT NULL,
 result JSONB NOT NULL,
 PRIMARY KEY(operator_label,request_id)
);
