import { setNonce } from 'get-nonce';
import { hydrateRoot } from 'react-dom/client';
import { Document } from '../components/Document.js';
import { pagePropsSchema } from '../shared/contracts.js';
import '../styles/index.css';
const serialized = document.documentElement.dataset['pageProps'];
if (serialized) {
  const input: unknown = JSON.parse(serialized);
  const props = pagePropsSchema.parse(input);
  // Mantine’s scroll-lock dependency injects styles outside MantineProvider.
  setNonce(props.styleNonce);
  hydrateRoot(document, <Document props={props} />);
}

// Readers use an anonymous SSR shell, but signed-in reader tabs still wake the
// shared inbox poller. No inbox payload is persisted or put into page props.
if (
  serialized &&
  pagePropsSchema.parse(JSON.parse(serialized)).page === 'reader' &&
  'serviceWorker' in navigator
) {
  const poll = () => {
    void navigator.serviceWorker.ready.then((reg) =>
      reg.active?.postMessage({ action: 'notifications-poll' }),
    );
  };
  void navigator.serviceWorker
    .register('/reader-sw.js', { scope: '/' })
    .then(poll)
    .catch(() => {});
  window.setInterval(poll, 60000);
}
