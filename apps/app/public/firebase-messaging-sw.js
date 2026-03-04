importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDHJI3pa11uJwmP_Mw744M-HdZAhP5qrDU",
  authDomain: "aliados-web-22.firebaseapp.com",
  projectId: "aliados-web-22",
  storageBucket: "aliados-web-22.appspot.com",
  messagingSenderId: "578160153411",
  appId: "1:578160153411:web:d5ee717fbdfc7b245b55f6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const { actionUrl } = payload.data || {};

  self.registration.showNotification(title || 'Aliados', {
    body: body || '',
    icon: 'https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/AliadosApp_192_fo5fxs.png',
    badge: 'https://res.cloudinary.com/unlimitd/image/upload/v1771089836/aliados-web/favicon_fmygev.png',
    data: { actionUrl }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const actionUrl = event.notification.data?.actionUrl || '/';
  event.waitUntil(
    clients.openWindow(actionUrl)
  );
});
