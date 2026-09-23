CREATE INDEX collector_chat_feed ON collector_chat_inbox(channel_id, received_at DESC, id DESC);
