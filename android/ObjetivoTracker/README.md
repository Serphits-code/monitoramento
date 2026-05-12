# Objetivo Tracker Android

App Kotlin nativo de teste para enviar GPS ao servidor de monitoramento.

## O que faz

- Coleta localizacao em foreground service a cada 30 segundos.
- Salva todo ponto primeiro no SQLite local.
- Envia lotes para `POST /api/monitoramento/gps/batch`.
- Mantem pontos offline e apaga somente apos resposta OK do servidor.
- Reinicia apos boot se o rastreamento estava ativo.

## Build

Requer Android Studio ou Android SDK + Java + Gradle.

```powershell
cd android\ObjetivoTracker
gradle assembleDebug
```

APK esperado:

```text
android\ObjetivoTracker\app\build\outputs\apk\debug\app-debug.apk
```

## Configuracao no aparelho

Abra o app e informe:

- Servidor: `http://IP_DA_VPS:3000`
- Token GPS: mesmo valor de `GPS_INGEST_TOKEN` do `.env` da VPS
- ID do tecnico: id da tabela de tecnicos

Autorize localizacao em segundo plano e desative otimizacao agressiva de bateria para este app.