import { useCallback, useId, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useI18n } from '../localisation/index.js';

/** Transient action feedback, shared by forms, menus, uploads and editor operations. */
export function useFeedback(kind: 'error' | 'success' | 'info' = 'error') {
  const { tx, t } = useI18n();
  const id = useId();
  const [message, setMessage] = useState('');
  const report = useCallback(
    (value: string, persistent = false) => {
      setMessage(value);
      if (!value) return;
      notifications.hide(id);
      notifications.show({
        id,
        message: tx(t(value)),
        color: kind === 'error' ? 'red' : 'brand',
        autoClose: kind === 'error' || persistent ? false : 6000,
        closeButtonProps: { 'aria-label': t('accessibility.close_notification') },
        role: kind === 'error' ? 'alert' : 'status',
      });
    },
    [id, kind, tx, t],
  );
  return [message, report] as const;
}
