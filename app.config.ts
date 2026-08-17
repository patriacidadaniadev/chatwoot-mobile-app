import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    name: 'Pátria',
    slug: process.env.EXPO_PUBLIC_APP_SLUG || 'patria-chatwoot-mobile',
    version: '4.8.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    scheme: 'patriachat',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
      enableFullScreenImage_legacy: true,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'br.com.patriacidadania.chatwoot',
      infoPlist: {
        NSCameraUsageDescription:
          'This app requires access to the camera to upload images and videos.',
        NSPhotoLibraryUsageDescription:
          'This app requires access to the photo library to upload images.',
        NSMicrophoneUsageDescription: 'This app requires access to the microphone to record audio.',
        NSAppleMusicUsageDescription:
          'This app does not use Apple Music, but a system API may require this permission.',
        // 'audio' mantém a sessão de áudio viva quando a chamada WhatsApp vai para
        // segundo plano. Não usar 'voip': exige PushKit e a Apple rejeita sem ele.
        UIBackgroundModes: ['fetch', 'remote-notification', 'audio'],
        ITSAppUsesNonExemptEncryption: false,
      },
      // Please use the relative path to the google-services.json file
      googleServicesFile: process.env.EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE,
      entitlements: { 'aps-environment': 'production' },
      associatedDomains: ['applinks:chat.patriacidadania.com.br'],
    },
    android: {
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' },
      package: 'br.com.patriacidadania.chatwoot',
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.BLUETOOTH_CONNECT',
      ],
      // O config plugin do react-native-webrtc injeta SYSTEM_ALERT_WINDOW sem
      // precisarmos dela (só serve para chamada recebida com overlay) e a revisão
      // da Play implica com a permissão.
      blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW'],
      // Please use the relative path to the google-services.json file
      googleServicesFile: process.env.EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'chat.patriacidadania.com.br',
              pathPrefix: '/app/accounts/',
              pathPattern: '/*/conversations/*',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
        {
          action: 'VIEW',
          data: [
            {
              scheme: 'patriachat',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    extra: {
      eas: {
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
        storybookEnabled: process.env.EXPO_STORYBOOK_ENABLED,
      },
    },
    owner: process.env.EXPO_PUBLIC_EXPO_OWNER || 'chatwoot',
    plugins: [
      'expo-font',
      [
        'react-native-permissions',
        { iosPermissions: ['Camera', 'PhotoLibrary', 'MediaLibrary', 'Microphone'] },
      ],
      // Sem org/projeto o plugin ainda instala a task de upload de source map no
      // Gradle, e o build de release morre com "An organization ID or slug is
      // required". Só entra quando o Sentry estiver realmente configurado.
      ...(process.env.EXPO_PUBLIC_SENTRY_ORG_NAME && process.env.EXPO_PUBLIC_SENTRY_PROJECT_NAME
        ? [
            [
              '@sentry/react-native/expo',
              {
                url: 'https://sentry.io/',
                project: process.env.EXPO_PUBLIC_SENTRY_PROJECT_NAME,
                organization: process.env.EXPO_PUBLIC_SENTRY_ORG_NAME,
              },
            ] as [string, Record<string, unknown>],
          ]
        : []),
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      [
        'expo-build-properties',
        {
          // https://github.com/invertase/notifee/issues/808#issuecomment-2175934609
          android: {
            minSdkVersion: 24,
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            enableProguardInReleaseBuilds: true,
          },
          ios: { useFrameworks: 'static' },
        },
      ],
      '@config-plugins/react-native-webrtc',
      './with-call-recording.js',
      './with-ffmpeg-pod.js',
    ],
    androidNavigationBar: { backgroundColor: '#ffffff' },
  };
};
