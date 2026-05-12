package br.com.objetivo.tracker

data class PendingLocation(
    val id: Long,
    val clientPointId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float?,
    val speed: Float?,
    val bearing: Float?,
    val battery: Float?,
    val capturedAt: String
)