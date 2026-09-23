-- Older reference boards had no artwork on cell 07. Fill only that empty
-- artwork slot; leave all other cells and customized artwork intact.
WITH corrected AS (
  SELECT b.id, (c.ordinality - 1)::text AS cell_index
  FROM board_versions b
  CROSS JOIN LATERAL jsonb_array_elements(b.board_definition->'cells')
    WITH ORDINALITY AS c(cell, ordinality)
  WHERE b.board_definition->>'id' LIKE 'streamer-reference-board%'
    AND c.cell->>'id' = 'cell-07'
    AND c.cell->>'label' = '즉방'
    AND COALESCE(c.cell #> '{appearance,artwork}', 'null'::jsonb) = 'null'::jsonb
)
UPDATE board_versions b
SET board_definition = jsonb_set(
  b.board_definition,
  ARRAY['cells', c.cell_index, 'appearance', 'artwork'],
  '{"type":"image","assetId":"party-instant-camera-v1"}'::jsonb
)
FROM corrected c WHERE c.id = b.id;

WITH corrected AS (
  SELECT v.id, (c.ordinality - 1)::text AS cell_index
  FROM channel_config_versions v
  CROSS JOIN LATERAL jsonb_array_elements(v.document->'cells')
    WITH ORDINALITY AS c(cell, ordinality)
  WHERE v.kind = 'board'
    AND v.document->>'id' LIKE 'streamer-reference-board%'
    AND c.cell->>'id' = 'cell-07'
    AND c.cell->>'label' = '즉방'
    AND COALESCE(c.cell #> '{appearance,artwork}', 'null'::jsonb) = 'null'::jsonb
)
UPDATE channel_config_versions v
SET document = jsonb_set(
  v.document,
  ARRAY['cells', c.cell_index, 'appearance', 'artwork'],
  '{"type":"image","assetId":"party-instant-camera-v1"}'::jsonb
)
FROM corrected c WHERE c.id = v.id;
