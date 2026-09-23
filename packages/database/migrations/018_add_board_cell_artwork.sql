-- Add the new illustrations to stored copies of the reference board, including
-- versions already attached to sessions. Preserve customized cells and effects.
WITH corrected AS (
  SELECT b.id,
    jsonb_agg(
      CASE
        WHEN c.cell->>'id' = 'cell-01'
          AND c.cell->>'label' = '출발 →'
          AND c.cell #> '{appearance,artwork}' = 'null'::jsonb
          THEN jsonb_set(c.cell, '{appearance,artwork}', '{"type":"image","assetId":"party-start-flag-v1"}'::jsonb)
        WHEN c.cell->>'id' = 'cell-07'
          AND c.cell->>'label' = '즉방'
          AND c.cell #>> '{appearance,artwork,assetId}' = 'party-punch-v1'
          THEN jsonb_set(c.cell, '{appearance,artwork}', '{"type":"image","assetId":"party-instant-camera-v1"}'::jsonb)
        WHEN c.cell->>'id' = 'cell-21'
          AND c.cell->>'label' = '꽝'
          AND c.cell #> '{appearance,artwork}' = 'null'::jsonb
          THEN jsonb_set(c.cell, '{appearance,artwork}', '{"type":"image","assetId":"party-empty-gift-v1"}'::jsonb)
        ELSE c.cell
      END ORDER BY c.ordinality
    ) AS cells
  FROM board_versions b
  CROSS JOIN LATERAL jsonb_array_elements(b.board_definition->'cells')
    WITH ORDINALITY AS c(cell, ordinality)
  WHERE b.board_definition->>'id' LIKE 'streamer-reference-board%'
  GROUP BY b.id
)
UPDATE board_versions b
SET board_definition = jsonb_set(b.board_definition, '{cells}', c.cells)
FROM corrected c
WHERE c.id = b.id AND b.board_definition->'cells' IS DISTINCT FROM c.cells;

WITH corrected AS (
  SELECT v.id,
    jsonb_agg(
      CASE
        WHEN c.cell->>'id' = 'cell-01'
          AND c.cell->>'label' = '출발 →'
          AND c.cell #> '{appearance,artwork}' = 'null'::jsonb
          THEN jsonb_set(c.cell, '{appearance,artwork}', '{"type":"image","assetId":"party-start-flag-v1"}'::jsonb)
        WHEN c.cell->>'id' = 'cell-07'
          AND c.cell->>'label' = '즉방'
          AND c.cell #>> '{appearance,artwork,assetId}' = 'party-punch-v1'
          THEN jsonb_set(c.cell, '{appearance,artwork}', '{"type":"image","assetId":"party-instant-camera-v1"}'::jsonb)
        WHEN c.cell->>'id' = 'cell-21'
          AND c.cell->>'label' = '꽝'
          AND c.cell #> '{appearance,artwork}' = 'null'::jsonb
          THEN jsonb_set(c.cell, '{appearance,artwork}', '{"type":"image","assetId":"party-empty-gift-v1"}'::jsonb)
        ELSE c.cell
      END ORDER BY c.ordinality
    ) AS cells
  FROM channel_config_versions v
  CROSS JOIN LATERAL jsonb_array_elements(v.document->'cells')
    WITH ORDINALITY AS c(cell, ordinality)
  WHERE v.kind = 'board' AND v.document->>'id' LIKE 'streamer-reference-board%'
  GROUP BY v.id
)
UPDATE channel_config_versions v
SET document = jsonb_set(v.document, '{cells}', c.cells)
FROM corrected c
WHERE c.id = v.id AND v.document->'cells' IS DISTINCT FROM c.cells;
