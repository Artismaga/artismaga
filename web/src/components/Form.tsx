import { useFeedback } from './Feedback.js';
// localisation-mapped
import { useI18n } from '../localisation/index.js';
import { useState } from 'react';
import { TextInput, PasswordInput, Button, Stack } from '@mantine/core';
import type {
  ChangeEventHandler,
  FormEventHandler,
  HTMLInputTypeAttribute,
  ReactNode,
} from 'react';
import type { ApiResponse } from '../shared/contracts.js';
import { postJson, errorMessage } from '../client/api.js';
interface FieldProps {
  label: string;
  name: string;
  type?: HTMLInputTypeAttribute;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  defaultValue?: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  pattern?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}
export function Field({ label, name, type, ...input }: FieldProps) {
  const common = { id: name, name, label, required: true, ...input };
  return type === 'password' ? (
    <PasswordInput {...common} />
  ) : (
    <TextInput type={type ?? 'text'} {...common} />
  );
}
export function EmailField() {
  const { t } = useI18n();

  return (
    <Field
      name="email"
      label={t('ui.email_address_f2488fd4')}
      type="email"
      autoComplete="email"
      maxLength={254}
    />
  );
}
export function PasswordField({ fresh = false }: { fresh?: boolean }) {
  const { t } = useI18n();

  return (
    <Field
      name="password"
      label={fresh ? t('ui.password_15_128_characters_477edb59') : t('ui.password_e7cf3ef4')}
      type="password"
      autoComplete={fresh ? 'new-password' : 'current-password'}
      minLength={fresh ? 15 : 1}
      maxLength={128}
    />
  );
}
export function formText(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== 'string') throw new Error(`Missing ${key.replaceAll('_', ' ')}`);
  return value;
}
interface ApiFormProps {
  api: string;
  label: string;
  children?: ReactNode;
  redirect?: string;
  transform?: (data: FormData) => unknown;
  onSaved?: (response: ApiResponse, data: FormData) => void;
  danger?: boolean;
  disabled?: boolean;
  onChange?: FormEventHandler<HTMLFormElement>;
}
export function ApiForm({
  api,
  label,
  children,
  redirect,
  transform,
  onSaved,
  danger = false,
  disabled = false,
  onChange,
}: ApiFormProps) {
  const { tx } = useI18n();
  const [busy, setBusy] = useState(false);
  const [, success] = useFeedback('success');
  const [, failure] = useFeedback('error');
  return (
    <form
      data-api={api}
      onChange={onChange}
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);

        void (async () => {
          try {
            const body = transform ? transform(data) : Object.fromEntries(data);
            const result = await postJson(api, body);
            success(
              result.message ??
                (result.invitation ? `Invitation (valid 7 days): ${result.invitation}` : 'Saved.'),
              !!result.invitation,
            );
            onSaved?.(result, data);
            const target = result.redirect ?? redirect;
            if (target?.startsWith('/') && !target.startsWith('//')) window.location.assign(target);
          } catch (error: unknown) {
            failure(errorMessage(error));
          } finally {
            setBusy(false);
          }
        })();
      }}
    >
      <Stack gap="md">
        {children}
        <div>
          <Button
            type="submit"
            loading={busy}
            disabled={disabled}
            {...(danger ? { color: 'red' } : {})}
          >
            {tx(label)}
          </Button>
        </div>
      </Stack>
    </form>
  );
}
