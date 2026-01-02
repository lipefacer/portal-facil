
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBFgChv2LW3kspfnae_WUl-0NRbIqp_8aM",
  authDomain: "portalfacil-a3adb.firebaseapp.com",
  projectId: "portalfacil-a3adb",
  storageBucket: "portalfacil-a3adb.firebasestorage.app",
  messagingSenderId: "722034138930",
  appId: "1:722034138930:web:1f1940735d76aeaed7c12b"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem em segundo plano recebida: ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico' // Ajuste para o ícone real do seu app
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
