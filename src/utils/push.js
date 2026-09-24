// Web Push subscribe/unsubscribe helpers for the "Enable notifications"
// button on Home. Only meaningful in a production build with the service
// worker registered — see src/index.js and src/service-worker.js.

// PushManager.subscribe needs the VAPID public key as a Uint8Array, not the
// base64url string it's stored/shared as.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.REACT_APP_VAPID_PUBLIC_KEY),
  });

  const res = await fetch('/api/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });
  if (!res.ok) {
    throw new Error('Failed to save push subscription');
  }
  return subscription;
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
  await fetch('/api/push-subscribe', { method: 'DELETE' });
}
