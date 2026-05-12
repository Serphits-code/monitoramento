package br.com.objetivo.tracker

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object SyncClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    fun sendBatch(serverUrl: String, token: String, technicianId: Int, deviceId: String, points: List<PendingLocation>): Boolean {
        if (serverUrl.isBlank() || token.isBlank() || points.isEmpty()) return false

        val bodyJson = JSONObject().apply {
            put("id_tecnico", technicianId)
            put("device_id", deviceId)
            put("points", JSONArray().apply {
                points.forEach { point ->
                    put(JSONObject().apply {
                        put("client_point_id", point.clientPointId)
                        put("latitude", point.latitude)
                        put("longitude", point.longitude)
                        put("accuracy", point.accuracy)
                        put("speed", point.speed)
                        put("bearing", point.bearing)
                        put("battery", point.battery)
                        put("captured_at", point.capturedAt)
                    })
                }
            })
        }

        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/monitoramento/gps/batch")
            .addHeader("Authorization", "Bearer $token")
            .post(bodyJson.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return false
            val json = JSONObject(response.body?.string().orEmpty())
            val errors = json.optJSONArray("errors")
            return errors == null || errors.length() == 0
        }
    }
}