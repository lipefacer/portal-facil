
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Toast } from '@capacitor/toast';

export const isNative = Capacitor.isNativePlatform();

export const nativeBridge = {
  // GPS de Alta Precisão (Nativo vs Web)
  getCurrentPosition: async () => {
    if (isNative) {
      const permissions = await Geolocation.checkPermissions();
      if (permissions.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') throw new Error("Permissão de GPS negada");
      }
      
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
      
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
    } else {
      return new Promise<{lat: number, lng: number}>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          (e) => reject(e),
          { enableHighAccuracy: true }
        );
      });
    }
  },

  // Feedback de vibração ao usuário (Essencial para motoristas)
  vibrate: async (style: ImpactStyle = ImpactStyle.Heavy) => {
    if (isNative) {
      await Haptics.impact({ style });
    }
  },

  successVibrate: async () => {
    if (isNative) {
      await Haptics.notification({ type: NotificationType.Success });
    }
  },

  // Alerta nativo (Toast) que aparece sobre o sistema
  showToast: async (text: string) => {
    if (isNative) {
      await Toast.show({ text, duration: 'long', position: 'bottom' });
    } else {
      console.log('Toast:', text);
    }
  }
};
