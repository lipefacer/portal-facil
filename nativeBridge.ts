
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Toast } from '@capacitor/toast';

export const isNative = Capacitor.isNativePlatform();

export const nativeBridge = {
  // GPS de Alta Precisão (Nativo vs Web)
  getCurrentPosition: async () => {
    if (isNative) {
      const permissions = await Geolocation.checkPermissions();
      if (permissions.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
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

  // Feedback de vibração ao usuário
  vibrate: async (style: ImpactStyle = ImpactStyle.Heavy) => {
    if (isNative) {
      await Haptics.impact({ style });
    }
  },

  // Alerta nativo (Toast)
  showToast: async (text: string) => {
    if (isNative) {
      await Toast.show({ text, duration: 'short' });
    } else {
      console.log('Toast:', text);
    }
  }
};
