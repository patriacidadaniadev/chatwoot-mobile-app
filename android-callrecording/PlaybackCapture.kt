package br.com.patriacidadania.chatwoot.callrecording

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Process
import android.util.Log
import androidx.annotation.RequiresApi
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.concurrent.thread

/**
 * Captura o áudio que o **próprio app** está tocando (a perna remota da chamada) via
 * AudioPlaybackCapture, e grava num WAV.
 *
 * Só funciona porque o CallRecordingAudio marca a saída do WebRTC como USAGE_MEDIA:
 * o Android nunca deixa capturar USAGE_VOICE_COMMUNICATION.
 */
@RequiresApi(Build.VERSION_CODES.Q)
class PlaybackCapture(private val projection: MediaProjection) {
    private var record: AudioRecord? = null
    @Volatile private var running = false
    private var worker: Thread? = null

    @SuppressLint("MissingPermission")
    fun start(target: File) {
        if (running) return

        val config =
            AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUid(Process.myUid())
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .build()

        val format =
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                .build()

        val minBuffer =
            AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
        val bufferSize = if (minBuffer > 0) minBuffer * 2 else SAMPLE_RATE * 2

        val audioRecord =
            AudioRecord.Builder()
                .setAudioPlaybackCaptureConfig(config)
                .setAudioFormat(format)
                .setBufferSizeInBytes(bufferSize)
                .build()

        record = audioRecord
        running = true
        audioRecord.startRecording()

        worker = thread(name = "call-playback-capture") { pump(audioRecord, target, bufferSize) }
    }

    fun stop() {
        running = false
        worker?.join(2000)
        worker = null
        record?.let { audioRecord ->
            runCatching {
                audioRecord.stop()
                audioRecord.release()
            }
        }
        record = null
    }

    private fun pump(audioRecord: AudioRecord, target: File, bufferSize: Int) {
        target.parentFile?.mkdirs()
        RandomAccessFile(target, "rw").use { out ->
            out.setLength(0)
            out.write(ByteArray(WAV_HEADER_BYTES)) // reservado; preenchido no fim

            val buffer = ByteArray(bufferSize)
            var total = 0L
            var silentReads = 0
            while (running) {
                val read = audioRecord.read(buffer, 0, buffer.size)
                if (read <= 0) continue
                out.write(buffer, 0, read)
                total += read
                if (isSilent(buffer, read)) silentReads += 1
            }

            writeWavHeader(out, total)
            // O spike precisa saber se veio áudio de verdade ou só silêncio — sem isso
            // um WAV do tamanho certo cheio de zeros passaria por sucesso.
            Log.i(TAG, "capturado ${total} bytes, leituras silenciosas: $silentReads")
        }
    }

    private fun isSilent(buffer: ByteArray, length: Int): Boolean {
        var i = 0
        while (i + 1 < length) {
            val sample = ((buffer[i + 1].toInt() shl 8) or (buffer[i].toInt() and 0xff)).toShort()
            if (kotlin.math.abs(sample.toInt()) > SILENCE_THRESHOLD) return false
            i += 2
        }
        return true
    }

    private fun writeWavHeader(out: RandomAccessFile, dataBytes: Long) {
        val header =
            ByteBuffer.allocate(WAV_HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN).apply {
                put("RIFF".toByteArray())
                putInt((36 + dataBytes).toInt())
                put("WAVE".toByteArray())
                put("fmt ".toByteArray())
                putInt(16)
                putShort(1.toShort()) // PCM
                putShort(1.toShort()) // mono
                putInt(SAMPLE_RATE)
                putInt(SAMPLE_RATE * 2) // byte rate
                putShort(2.toShort()) // block align
                putShort(16.toShort()) // bits por amostra

                put("data".toByteArray())
                putInt(dataBytes.toInt())
            }
        out.seek(0)
        out.write(header.array())
    }

    companion object {
        private const val TAG = "PlaybackCapture"
        private const val SAMPLE_RATE = 48000
        private const val WAV_HEADER_BYTES = 44
        private const val SILENCE_THRESHOLD = 64
    }
}
