package br.com.objetivo.tracker

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.location.Location
import java.time.Instant
import java.util.UUID

class LocationStore(context: Context) : SQLiteOpenHelper(context, "objetivo_tracker.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE pending_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_point_id TEXT NOT NULL UNIQUE,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                accuracy REAL,
                speed REAL,
                bearing REAL,
                battery REAL,
                captured_at TEXT NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun insert(location: Location, battery: Float?) {
        val values = ContentValues().apply {
            put("client_point_id", UUID.randomUUID().toString())
            put("latitude", location.latitude)
            put("longitude", location.longitude)
            put("accuracy", if (location.hasAccuracy()) location.accuracy else null)
            put("speed", if (location.hasSpeed()) location.speed else null)
            put("bearing", if (location.hasBearing()) location.bearing else null)
            put("battery", battery)
            put("captured_at", Instant.ofEpochMilli(location.time.takeIf { it > 0 } ?: System.currentTimeMillis()).toString())
        }
        writableDatabase.insertWithOnConflict("pending_locations", null, values, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun listPending(limit: Int = 50): List<PendingLocation> {
        val rows = mutableListOf<PendingLocation>()
        readableDatabase.rawQuery(
            "SELECT * FROM pending_locations ORDER BY captured_at LIMIT ?",
            arrayOf(limit.toString())
        ).use { cursor ->
            while (cursor.moveToNext()) {
                rows += PendingLocation(
                    id = cursor.getLong(cursor.getColumnIndexOrThrow("id")),
                    clientPointId = cursor.getString(cursor.getColumnIndexOrThrow("client_point_id")),
                    latitude = cursor.getDouble(cursor.getColumnIndexOrThrow("latitude")),
                    longitude = cursor.getDouble(cursor.getColumnIndexOrThrow("longitude")),
                    accuracy = cursor.floatOrNull("accuracy"),
                    speed = cursor.floatOrNull("speed"),
                    bearing = cursor.floatOrNull("bearing"),
                    battery = cursor.floatOrNull("battery"),
                    capturedAt = cursor.getString(cursor.getColumnIndexOrThrow("captured_at"))
                )
            }
        }
        return rows
    }

    fun delete(ids: List<Long>) {
        if (ids.isEmpty()) return
        val placeholders = ids.joinToString(",") { "?" }
        writableDatabase.delete("pending_locations", "id IN ($placeholders)", ids.map { it.toString() }.toTypedArray())
    }

    fun pendingCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM pending_locations", emptyArray()).use { cursor ->
            return if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }
    }
}

private fun android.database.Cursor.floatOrNull(column: String): Float? {
    val index = getColumnIndexOrThrow(column)
    return if (isNull(index)) null else getFloat(index)
}