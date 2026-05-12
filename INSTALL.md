# Instalacao na VPS

Este projeto roda por IP e porta aberta, sem dominio. Os arquivos que devem ir para a VPS sao o backend Node.js, a pasta `public`, `src`, `kml`, `package.json`, `package-lock.json`, `.env.example` e este guia. Nao envie `.env`, banco SQLite local, `node_modules` nem builds Android para o repositorio publico.

## 1. Preparar servidor

Na VPS Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

Confira:

```bash
node -v
npm -v
pm2 -v
```

## 2. Baixar o projeto

```bash
cd /opt
sudo git clone https://github.com/Serphits-code/monitoramento.git
sudo chown -R $USER:$USER /opt/monitoramento
cd /opt/monitoramento
npm install --omit=dev
```

## 3. Criar o `.env`

```bash
cp .env.example .env
nano .env
```

Preencha os valores reais:

```env
IXC_HOST=https://SEU_IXC
IXC_TOKEN=SEU_ID:SEU_TOKEN

PORT=3000
CACHE_TTL_MINUTES=5
PUBLIC_BASE_URL=http://IP_DA_VPS:3000
APP_TIMEZONE=America/Recife

AUTH_USER=Objetivo
AUTH_PASSWORD=SENHA_WEB_COMBINADA
AUTH_COOKIE_SECRET=SEGREDO_GRANDE_GERADO
AUTH_SESSION_HOURS=12

GPS_INGEST_TOKEN=TOKEN_GRANDE_PARA_O_APK
GPS_STOP_RADIUS_METERS=35
GPS_STOP_MIN_SECONDS=120
GPS_STALE_SECONDS=180
GPS_MAX_ACCURACY_METERS=120

OSRM_HOST=https://router.project-osrm.org
OSRM_PROFILE=bike
SEDE_LAT=-8.489729
SEDE_LNG=-36.231432
```

Gere segredos longos assim:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use um valor para `AUTH_COOKIE_SECRET` e outro para `GPS_INGEST_TOKEN`. Configure o mesmo `GPS_INGEST_TOKEN` no APK.

## 4. Abrir porta da VPS

Se usa `ufw`:

```bash
sudo ufw allow 3000/tcp
sudo ufw status
```

No painel da VPS, libere tambem a porta `3000/tcp` no firewall da provedora, se existir.

## 5. Subir o servico com PM2

```bash
cd /opt/monitoramento
pm2 start src/server.js --name objetivo-monitoramento
pm2 save
pm2 startup
```

O comando `pm2 startup` mostra uma linha com `sudo env ...`. Copie e execute essa linha para o servico voltar apos reiniciar a VPS.

Comandos uteis:

```bash
pm2 status
pm2 logs objetivo-monitoramento
pm2 restart objetivo-monitoramento
```

## 6. Acessar

Abra no navegador:

```text
http://IP_DA_VPS:3000/login
http://IP_DA_VPS:3000/monitoramento
```

Use o usuario configurado em `AUTH_USER` e a senha definida em `AUTH_PASSWORD`.

## 7. Configurar o APK

No app Android, informe:

```text
Servidor: http://IP_DA_VPS:3000
Token GPS: mesmo valor de GPS_INGEST_TOKEN
Tecnico: ID do tecnico de teste
Intervalo: 30 segundos
```

O app guarda pontos sem internet e envia em lote quando a rede voltar. O servidor ignora duplicados usando `device_id + client_point_id`.

## 8. Atualizar versao na VPS

```bash
cd /opt/monitoramento
git pull
npm install --omit=dev
pm2 restart objetivo-monitoramento
```

## Observacao de seguranca

Rodar por `http://IP:PORTA` funciona, mas login e token trafegam sem criptografia. Para operacao real em campo, prefira VPN, tunnel seguro ou HTTPS assim que possivel.