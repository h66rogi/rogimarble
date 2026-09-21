'use client';

import { Input } from '@/shared/components/ui/input';
import type { ThemeOptionSchemaEntry } from '@/domains/channel/apis/overlay-theme';
import { SettingsRow } from '@/shared/components/common/settings-form';

interface TextFieldProps {
  field: ThemeOptionSchemaEntry;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Standard text input with optional `maxLength`.
 */
export function TextField({ field, value, onChange }: TextFieldProps) {
  const fieldId = `theme-option-${field.key}`;
  const stringValue = typeof value === 'string' ? value : '';

  return (
    <SettingsRow title={field.label} description={field.helpText}>
      <Input
        id={fieldId}
        type="text"
        value={stringValue}
        maxLength={field.maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-label={field.label}
      />
    </SettingsRow>
  );
}
