package br.com.objetivo.tracker

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat

class MainActivity : Activity() {
    private lateinit var prefs: TrackerPrefs
    private lateinit var store: LocationStore
    private lateinit var serverInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var tecnicoInput: EditText
    private lateinit var statusView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = TrackerPrefs(this)
        store = LocationStore(this)
        setContentView(createContent())
        requestNeededPermissions()
        updateStatus()
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    private fun createContent(): LinearLayout {
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()

        serverInput = EditText(this).apply {
            hint = "http://IP_DA_VPS:3000"
            setText(prefs.serverUrl)
            setSingleLine(true)
        }
        tokenInput = EditText(this).apply {
            hint = "Token GPS"
            setText(prefs.gpsToken)
            setSingleLine(true)
        }
        tecnicoInput = EditText(this).apply {
            hint = "ID do tecnico"
            setText(prefs.technicianId.toString())
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setSingleLine(true)
        }
        statusView = TextView(this).apply { textSize = 14f }

        val salvar = Button(this).apply {
            text = "Salvar configuracao"
            setOnClickListener { saveConfig(); updateStatus() }
        }
        val iniciar = Button(this).apply {
            text = "Iniciar rastreamento"
            setOnClickListener { saveConfig(); startTracking(); updateStatus() }
        }
        val parar = Button(this).apply {
            text = "Parar rastreamento"
            setOnClickListener { stopTracking(); updateStatus() }
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(22), dp(18), dp(18))
            addView(TextView(context).apply { text = "Objetivo Tracker"; textSize = 22f })
            addView(TextView(context).apply { text = "Envio GPS a cada 30 segundos com fila offline."; textSize = 13f })
            addView(serverInput, fieldParams())
            addView(tokenInput, fieldParams())
            addView(tecnicoInput, fieldParams())
            addView(salvar, fieldParams())
            addView(iniciar, fieldParams())
            addView(parar, fieldParams())
            addView(statusView, fieldParams())
        }
    }

    private fun fieldParams(): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = 16
        }
    }

    private fun saveConfig() {
        prefs.serverUrl = serverInput.text.toString()
        prefs.gpsToken = tokenInput.text.toString()
        prefs.technicianId = tecnicoInput.text.toString().toIntOrNull() ?: 1
    }

    private fun startTracking() {
        val intent = Intent(this, TrackerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
    }

    private fun stopTracking() {
        val intent = Intent(this, TrackerService::class.java).setAction(TrackerService.ACTION_STOP)
        startService(intent)
    }

    private fun updateStatus() {
        statusView.text = "Tecnico: ${prefs.technicianId}\nServidor: ${prefs.serverUrl.ifBlank { "nao configurado" }}\nRastreamento: ${if (prefs.trackingEnabled) "ativo" else "parado"}\nPendentes offline: ${store.pendingCount()}"
    }

    private fun requestNeededPermissions() {
        val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) permissions += Manifest.permission.ACCESS_BACKGROUND_LOCATION
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permissions += Manifest.permission.POST_NOTIFICATIONS
        val missing = permissions.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 6777)
    }
}