CREATE TABLE external_auth_bindings (
  issuer text NOT NULL,
  subject text NOT NULL,
  operator_id uuid NOT NULL REFERENCES operators(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer,subject),
  UNIQUE (issuer,operator_id)
);
