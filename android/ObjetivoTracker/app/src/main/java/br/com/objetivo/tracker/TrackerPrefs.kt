package br.com.objetivo.tracker

import android.content.Context
import android.content.SharedPreferences

class TrackerPrefs(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("objetivo_tracker", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server_url", BuildConfig.DEFAULT_SERVER_URL) ?: BuildConfig.DEFAULT_SERVER_URL
        set(value) = prefs.edit().putString("server_url", value.trim().trimEnd('/')).apply()

    var gpsToken: String
        get() = prefs.getString("gps_token", BuildConfig.DEFAULT_GPS_TOKEN) ?: BuildConfig.DEFAULT_GPS_TOKEN
        set(value) = prefs.edit().putString("gps_token", value.trim()).apply()

    var technicianId: Int
        get() = prefs.getInt("technician_id", BuildConfig.DEFAULT_TECHNICIAN_ID)
        set(value) = prefs.edit().putInt("technician_id", value).apply()

    var trackingEnabled: Boolean
        get() = prefs.getBoolean("tracking_enabled", false)
        set(value) = prefs.edit().putBoolean("tracking_enabled", value).apply()

    var deviceId: String
        get() {
            val current = prefs.getString("device_id", null)
            if (!current.isNullOrBlank()) return current
            val created = "android-${java.util.UUID.randomUUID()}"
            prefs.edit().putString("device_id", created).apply()
            return created
        }
        set(value) = prefs.edit().putString("device_id", value).apply()
}