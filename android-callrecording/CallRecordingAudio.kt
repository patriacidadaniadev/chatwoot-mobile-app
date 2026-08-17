package br.com.patriacidadania.chatwoot.callrecording

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.util.Log
import com.oney.WebRTCModule.LibraryLoader
import com.oney.WebRTCModule.WebRTCModuleOptions
import org.webrtc.PeerConnectionFactory
import org.webrtc.audio.JavaAudioDeviceModule

/**
 * Injeta o AudioDeviceModule do WebRTC antes de o WebRTCModule criar o dele.
 *
 * Por que isso existe: o áudio remoto da chamada não tem nenhum gancho de PCM no
 * react-native-webrtc (não há AudioTrackSink no org.jitsi:webrtc:124, e o Builder do
 * JavaAudioDeviceModule só expõe callback do microfone). O único caminho por API
 * pública para capturar a perna remota é o AudioPlaybackCapture do Android, que
 * **não captura** áudio marcado como USAGE_VOICE_COMMUNICATION.
 *
 * Então, quando a gravação está ligada, marcamos a saída como USAGE_MEDIA +
 * ALLOW_CAPTURE_BY_ALL. Isso é uma troca real: o áudio sai do stream de chamada
 * (roteamento, volume e cancelamento de eco mudam). É exatamente o que o spike
 * precisa medir em aparelho antes de a gente se comprometer com essa abordagem.
 *
 * `WebRTCModule` só cria o ADM padrão se este campo estiver nulo
 * (WebRTCModule.java:100), então basta preencher antes — daí a chamada vir do
 * MainApplication.onCreate.
 */
object CallRecordingAudio {
    private const val TAG = "CallRecordingAudio"

    /** Ligado pelo BuildConfig para dar para comparar os dois modos no mesmo aparelho. */
    @JvmStatic
    var captureFriendlyAudio: Boolean = true

    @JvmStatic
    fun install(context: Context) {
        val options = WebRTCModuleOptions.getInstance()

        // O serviço de foreground com foregroundServiceType="mediaProjection" já vem
        // declarado no manifest do react-native-webrtc; só precisa estar habilitado.
        options.enableMediaProjectionService = true

        if (options.audioDeviceModule != null) {
            Log.w(TAG, "audioDeviceModule já definido, não vou sobrescrever")
            return
        }

        val usage =
            if (captureFriendlyAudio) AudioAttributes.USAGE_MEDIA
            else AudioAttributes.USAGE_VOICE_COMMUNICATION

        // createAudioDeviceModule() chama JNI, então a lib nativa precisa estar
        // carregada. O WebRTCModule só chama PeerConnectionFactory.initialize DEPOIS
        // de ler options.audioDeviceModule (WebRTCModule.java:69-81), ou seja: se a
        // gente não inicializar aqui, o app quebra na criação do ADM. A chamada é
        // idempotente — a segunda, feita pelo WebRTCModule, vira no-op.
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                .setNativeLibraryLoader(LibraryLoader())
                .createInitializationOptions()
        )

        val attributes =
            AudioAttributes.Builder()
                .setUsage(usage)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .apply {
                    if (captureFriendlyAudio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_ALL)
                    }
                }
                .build()

        options.audioDeviceModule =
            JavaAudioDeviceModule.builder(context)
                .setAudioAttributes(attributes)
                .setEnableVolumeLogger(false)
                // Mantemos os efeitos de hardware ligados: sem eles o eco fica pior
                // ainda fora do modo de comunicação.
                .setUseHardwareAcousticEchoCanceler(true)
                .setUseHardwareNoiseSuppressor(true)
                .createAudioDeviceModule()

        Log.i(TAG, "AudioDeviceModule instalado (usage=$usage, capturável=$captureFriendlyAudio)")
    }
}
