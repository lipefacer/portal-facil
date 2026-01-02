
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

export const notificationService = {
  requestPermission: async (): Promise<boolean> => {
    if (Capacitor.isNativePlatform()) {
      const perm = await PushNotifications.requestPermissions();
      return perm.receive === 'granted';
    } else {
      if (!('Notification' in window)) return false;
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
  },

  initPush: async () => {
    if (Capacitor.isNativePlatform()) {
      await PushNotifications.addListener('registration', (token) => {
        console.log('Push Token:', token.value);
        // Aqui você salvaria o token no Firestore do usuário para enviar pushes via Cloud Functions
      });

      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push recebido:', notification);
      });

      await PushNotifications.register();
    }
  },

  playSound: (type: 'new-ride' | 'status-change' | 'chat-message') => {
    const sounds = {
      'new-ride': 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', 
      'status-change': 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
      'chat-message': 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'
    };
    
    try {
      const audio = new Audio(sounds[type]);
      audio.volume = 0.6;
      audio.play().catch(e => console.warn('Audio blocked:', e.message));
    } catch (err) {
      console.error('Error playing sound:', err);
    }
  },

  send: async (title: string, body: string) => {
    if (Capacitor.isNativePlatform()) {
      await LocalNotifications.schedule({
        notifications: [{
          title,
          body,
          id: Date.now(),
          schedule: { at: new Date(Date.now() + 100) },
          sound: 'beep.wav',
          actionTypeId: "",
          extra: null
        }]
      });
    } else {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }
  }
};
