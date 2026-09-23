-- Correct the original cell 07 typo in stored board copies, including the
-- board version used by an active session. Keep cell IDs and all other data.
WITH locations AS (
  SELECT b.id, (c.ordinality - 1)::text AS cell_index,
    c.cell->>'label' AS label,
    c.cell #>> '{onLand,0,message}' AS message
  FROM board_versions b
  CROSS JOIN LATERAL jsonb_array_elements(b.board_definition->'cells')
    WITH ORDINALITY AS c(cell, ordinality)
  WHERE c.cell->>'id' = 'cell-07'
    AND (c.cell->>'label' = '죽빵' OR c.cell #>> '{onLand,0,message}' = '죽빵')
), corrected AS (
  SELECT b.id,
    CASE WHEN l.message = '죽빵'
      THEN jsonb_set(
        CASE WHEN l.label = '죽빵'
          THEN jsonb_set(b.board_definition, ARRAY['cells', l.cell_index, 'label'], to_jsonb('즉방'::text))
          ELSE b.board_definition END,
        ARRAY['cells', l.cell_index, 'onLand', '0', 'message'], to_jsonb('즉방'::text))
      WHEN l.label = '죽빵'
        THEN jsonb_set(b.board_definition, ARRAY['cells', l.cell_index, 'label'], to_jsonb('즉방'::text))
      ELSE b.board_definition END AS document
  FROM board_versions b JOIN locations l ON l.id = b.id
)
UPDATE board_versions b SET board_definition = c.document
FROM corrected c WHERE c.id = b.id;

WITH locations AS (
  SELECT v.id, (c.ordinality - 1)::text AS cell_index,
    c.cell->>'label' AS label,
    c.cell #>> '{onLand,0,message}' AS message
  FROM channel_config_versions v
  CROSS JOIN LATERAL jsonb_array_elements(v.document->'cells')
    WITH ORDINALITY AS c(cell, ordinality)
  WHERE v.kind = 'board' AND c.cell->>'id' = 'cell-07'
    AND (c.cell->>'label' = '죽빵' OR c.cell #>> '{onLand,0,message}' = '죽빵')
), corrected AS (
  SELECT v.id,
    CASE WHEN l.message = '죽빵'
      THEN jsonb_set(
        CASE WHEN l.label = '죽빵'
          THEN jsonb_set(v.document, ARRAY['cells', l.cell_index, 'label'], to_jsonb('즉방'::text))
          ELSE v.document END,
        ARRAY['cells', l.cell_index, 'onLand', '0', 'message'], to_jsonb('즉방'::text))
      WHEN l.label = '죽빵'
        THEN jsonb_set(v.document, ARRAY['cells', l.cell_index, 'label'], to_jsonb('즉방'::text))
      ELSE v.document END AS document
  FROM channel_config_versions v JOIN locations l ON l.id = v.id
)
UPDATE channel_config_versions v SET document = c.document
FROM corrected c WHERE c.id = v.id;
