const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withPlugins,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// O código nativo mora fora de android/ porque o projeto é gerado por prebuild.
const SOURCE_DIR = 'android-callrecording';
const JAVA_PACKAGE = 'br.com.patriacidadania.chatwoot.callrecording';
const INSTALL_CALL = 'CallRecordingAudio.install(this)';
const PACKAGE_LINE = 'packages.add(CallRecordingPackage())';
// Build do spike: EXPO_PUBLIC_CALL_RECORDING=1 npx expo prebuild --platform android --clean
const RECORDING_ENABLED = process.env.EXPO_PUBLIC_CALL_RECORDING === '1';

function copySources(config) {
  return withDangerousMod(config, [
    'android',
    cfg => {
      const from = path.join(cfg.modRequest.projectRoot, SOURCE_DIR);
      const to = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...JAVA_PACKAGE.split('.'),
      );
      fs.mkdirSync(to, { recursive: true });
      for (const file of fs.readdirSync(from)) {
        if (!file.endsWith('.kt')) continue;
        let source = fs.readFileSync(path.join(from, file), 'utf8');
        // Só o build do spike marca o áudio como capturável: fora dele a chamada tem
        // que ficar em USAGE_VOICE_COMMUNICATION, senão degrada para todo mundo.
        if (RECORDING_ENABLED) {
          source = source.replace(
            'var captureFriendlyAudio: Boolean = false',
            'var captureFriendlyAudio: Boolean = true',
          );
        }
        fs.writeFileSync(path.join(to, file), source);
      }
      return cfg;
    },
  ]);
}

function addPermissions(config) {
  return withAndroidManifest(config, cfg => {
    // O react-native-webrtc já declara o MediaProjectionService com
    // foregroundServiceType="mediaProjection"; falta só o app poder subir o serviço.
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
    ]);
    return cfg;
  });
}

function wireMainApplication(config) {
  return withMainApplication(config, cfg => {
    let contents = cfg.modResults.contents;

    if (!contents.includes(`import ${JAVA_PACKAGE}.CallRecordingAudio`)) {
      contents = contents.replace(
        /^(package .+)$/m,
        `$1\n\nimport ${JAVA_PACKAGE}.CallRecordingAudio\nimport ${JAVA_PACKAGE}.CallRecordingPackage`,
      );
    }

    // Tem que rodar antes de o WebRTCModule ser construído — ele só cria o
    // AudioDeviceModule padrão se WebRTCModuleOptions.audioDeviceModule estiver nulo.
    // E tem que ser depois do SoLoader.init, porque criar o ADM chama JNI.
    if (!contents.includes(INSTALL_CALL)) {
      contents = contents.replace(
        /^(\s*)(SoLoader\.init\(.+\)\n)/m,
        `$1$2$1${INSTALL_CALL}\n`,
      );
    }

    // O template do Expo usa `val packages = PackageList(this).packages` seguido de
    // `packages.add(...)`, e não o `.apply {}` de outros templates — daí o receptor
    // explícito. A indentação vem do próprio comentário de exemplo.
    if (!contents.includes(PACKAGE_LINE)) {
      contents = contents.replace(
        /^([ \t]*)\/\/ packages\.add\(MyReactNativePackage\(\)\)$/m,
        `$&\n$1${PACKAGE_LINE}`,
      );
    }

    if (!contents.includes(INSTALL_CALL) || !contents.includes(PACKAGE_LINE)) {
      throw new Error(
        'with-call-recording: não consegui editar o MainApplication — o template do Expo mudou, ajuste os regexes.',
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

const withCallRecording = config =>
  withPlugins(config, [copySources, addPermissions, wireMainApplication]);

module.exports = createRunOncePlugin(withCallRecording, 'with-call-recording', '1.0.0');
