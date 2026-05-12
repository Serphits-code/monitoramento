package br.com.objetivo.tracker

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.concurrent.thread

class TrackerService : Service() {
    private lateinit var prefs: TrackerPrefs
    private lateinit var store: LocationStore
    private lateinit var fused: FusedLocationProviderClient
    private val handler = Handler(Looper.getMainLooper())
    private var syncing = false
    private var lastStoredAtMs = 0L

    private val syncRunnable = object : Runnable {
        override fun run() {
            captureHeartbeatIfNeeded()
            syncPending()
            handler.postDelayed(this, SYNC_INTERVAL_MS)
        }
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach { location -> saveLocation(location) }
            syncPending()
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = TrackerPrefs(this)
        store = LocationStore(this)
        fused = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopTracking()
            return START_NOT_STICKY
        }
        startTracking()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission")
    private fun startTracking() {
        prefs.trackingEnabled = true
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, notification("Salvando rota real e enviando heartbeat"))

        if (!hasLocationPermission()) {
            stopSelf()
            return
        }

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_LOCATION_INTERVAL_MS)
            .setMinUpdateDistanceMeters(MIN_DISTANCE_METERS)
            .setMaxUpdateDelayMillis(LOCATION_INTERVAL_MS)
            .setWaitForAccurateLocation(false)
            .build()
        fused.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        handler.removeCallbacks(syncRunnable)
        handler.post(syncRunnable)
    }

    private fun stopTracking() {
        prefs.trackingEnabled = false
        fused.removeLocationUpdates(locationCallback)
        handler.removeCallbacks(syncRunnable)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun saveLocation(location: Location, captureNow: Boolean = false) {
        val capturedAtMillis = if (captureNow) System.currentTimeMillis() else (location.time.takeIf { it > 0 } ?: System.currentTimeMillis())
        store.insert(location, batteryPercent(), capturedAtMillis)
        lastStoredAtMs = System.currentTimeMillis()
    }

    @SuppressLint("MissingPermission")
    private fun captureHeartbeatIfNeeded() {
        val now = System.currentTimeMillis()
        if (now - lastStoredAtMs < HEARTBEAT_INTERVAL_MS) return
        fused.lastLocation
            .addOnSuccessListener { location ->
                if (location != null) {
                    saveLocation(location, captureNow = true)
                    syncPending()
                }
            }
            .addOnFailureListener {
                // Sem ultima localizacao disponivel; aguardamos o proximo callback do GPS.
            }
    }

    private fun syncPending() {
        if (syncing || !hasNetwork()) return
        syncing = true
        thread(name = "gps-sync") {
            try {
                while (hasNetwork()) {
                    val batch = store.listPending(SYNC_BATCH_SIZE)
                    if (batch.isEmpty()) break
                    val ok = SyncClient.sendBatch(prefs.serverUrl, prefs.gpsToken, prefs.technicianId, prefs.deviceId, batch)
                    if (!ok) break
                    store.delete(batch.map { it.id })
                }
            } finally {
                syncing = false
            }
        }
    }

    private fun hasNetwork(): Boolean {
        val manager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = manager.activeNetwork ?: return false
        val caps = manager.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun batteryPercent(): Float? {
        val manager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val percent = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (percent in 0..100) percent.toFloat() else null
    }

    private fun notification(text: String) = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setContentTitle("Objetivo Tracker")
        .setContentText(text)
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, "Rastreamento GPS", NotificationManager.IMPORTANCE_LOW)
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        const val ACTION_STOP = "br.com.objetivo.tracker.STOP"
        private const val CHANNEL_ID = "objetivo_tracker_location"
        private const val NOTIFICATION_ID = 6777
        private const val LOCATION_INTERVAL_MS = 5_000L
        private const val FASTEST_LOCATION_INTERVAL_MS = 2_000L
        private const val SYNC_INTERVAL_MS = 10_000L
        private const val HEARTBEAT_INTERVAL_MS = 60_000L
        private const val MIN_DISTANCE_METERS = 5f
        private const val SYNC_BATCH_SIZE = 100
    }
}