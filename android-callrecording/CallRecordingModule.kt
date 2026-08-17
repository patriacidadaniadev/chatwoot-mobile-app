package br.com.patriacidadania.chatwoot.callrecording

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.oney.WebRTCModule.MediaProjectionService
import java.io.File

/**
 * Ponte de JS para a gravação da perna remota no Android.
 *
 * Spike: só grava o que o app está tocando (o contato) num WAV e devolve o caminho.
 * Mixar com o microfone, transcodificar e subir para o Chatwoot vem depois, se o
 * teste em aparelho mostrar que (a) o áudio da chamada continua bom fora do modo
 * VOICE_COMMUNICATION e (b) a captura traz voz de verdade, não silêncio.
 */
class CallRecordingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var consentPromise: Promise? = null
    private var projection: MediaProjection? = null
    private var capture: PlaybackCapture? = null
    private var currentFile: File? = null

    private val projectionCallback =
        object : MediaProjection.Callback() {
            override fun onStop() {
                capture?.stop()
                capture = null
                projection = null
            }
        }

    private val activityListener: ActivityEventListener =
        object : BaseActivityEventListener() {
            override fun onActivityResult(
                activity: Activity?,
                requestCode: Int,
                resultCode: Int,
                data: Intent?,
            ) {
                if (requestCode != CONSENT_REQUEST_CODE) return
                val promise = consentPromise ?: return
                consentPromise = null

                if (resultCode != Activity.RESULT_OK || data == null) {
                    promise.resolve(false)
                    return
                }

                // Na API 29+ o getMediaProjection precisa acontecer com o serviço de
                // foreground já rodando, senão o sistema derruba a projeção.
                MediaProjectionService.launch(reactContext)
                    .whenComplete { _, error ->
                        if (error != null) {
                            Log.e(TAG, "serviço de foreground não subiu", error)
                            promise.resolve(false)
                            return@whenComplete
                        }
                        val manager =
                            reactContext.getSystemService(MediaProjectionManager::class.java)
                        projection =
                            manager?.getMediaProjection(resultCode, data)?.also {
                                // Na API 34+ o registerCallback é obrigatório antes de
                                // usar a projeção; sem ele o sistema mata a captura.
                                it.registerCallback(projectionCallback, Handler(Looper.getMainLooper()))
                            }
                        promise.resolve(projection != null)
                    }
            }
        }

    init {
        reactContext.addActivityEventListener(activityListener)
    }

    override fun getName() = "CallRecording"

    /** Abre o diálogo de consentimento do Android. Vale para a sessão inteira do app. */
    @ReactMethod
    fun requestConsent(promise: Promise) {
        if (projection != null) {
            promise.resolve(true)
            return
        }
        val activity = currentActivity
        if (activity == null) {
            promise.reject("no_activity", "Sem activity para pedir o consentimento")
            return
        }
        val manager = reactContext.getSystemService(MediaProjectionManager::class.java)
        if (manager == null) {
            promise.reject("no_manager", "MediaProjectionManager indisponível")
            return
        }
        consentPromise = promise
        activity.startActivityForResult(manager.createScreenCaptureIntent(), CONSENT_REQUEST_CODE)
    }

    @ReactMethod
    fun start(callId: Double, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            promise.reject("unsupported", "AudioPlaybackCapture exige Android 10 ou mais novo")
            return
        }
        val activeProjection = projection
        if (activeProjection == null) {
            promise.reject("no_consent", "Consentimento de captura não concedido")
            return
        }
        if (capture != null) {
            promise.reject("already_recording", "Já existe uma gravação em andamento")
            return
        }
        val file = File(reactContext.cacheDir, "call-${callId.toLong()}.wav")
        try {
            capture = PlaybackCapture(activeProjection).also { it.start(file) }
            currentFile = file
            promise.resolve(file.absolutePath)
        } catch (error: Throwable) {
            capture = null
            currentFile = null
            promise.reject("capture_failed", error)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        val running = capture
        val file = currentFile
        capture = null
        currentFile = null
        if (running == null || file == null) {
            promise.resolve(null)
            return
        }
        running.stop()
        promise.resolve(if (file.exists() && file.length() > WAV_HEADER_BYTES) file.absolutePath else null)
    }

    override fun invalidate() {
        capture?.stop()
        capture = null
        projection?.stop()
        projection = null
        MediaProjectionService.abort(reactContext)
        super.invalidate()
    }

    companion object {
        private const val TAG = "CallRecordingModule"
        private const val CONSENT_REQUEST_CODE = 8731
        private const val WAV_HEADER_BYTES = 44
    }
}
