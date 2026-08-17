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
const PACKAGE_LINE = 'add(CallRecordingPackage())';

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
        fs.copyFileSync(path.join(from, file), path.join(to, file));
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

    if (!contents.includes(PACKAGE_LINE)) {
      contents = contents.replace(
        /(\/\/ packages\.add\(MyReactNativePackage\(\)\)|add\(MyReactNativePackage\(\)\))/,
        `$1\n              ${PACKAGE_LINE}`,
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
