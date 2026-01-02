
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.portalfacil.mototaxi',
  appName: 'Portal Fácil Mototáxi',
  webDir: 'dist', // O Capacitor vai buscar seus arquivos nesta pasta após o build
  bundledWebRuntime: false,
  server: {
    // Em produção, isso fica comentado. 
    // Em desenvolvimento, você pode colocar o IP da sua máquina para Live Reload:
    // url: "http://192.168.1.XX:5173", 
    // cleartext: true,
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#F58220",
      sound: "beep.wav",
    },
  },
};

export default config;
