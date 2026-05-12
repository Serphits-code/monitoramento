const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'rotas.db');

// Garantir que o diretório data/ existe
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tecnicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_tecnico INTEGER NOT NULL,
    nome_cliente TEXT NOT NULL,
    endereco TEXT DEFAULT '',
    localidade TEXT DEFAULT '',
    tipo_servico TEXT DEFAULT 'instalação',
    periodo TEXT DEFAULT 'manhã',
    latitude REAL DEFAULT 0,
    longitude REAL DEFAULT 0,
    id_os_ixc TEXT DEFAULT '',
    status TEXT DEFAULT 'pendente',
    data_servico TEXT DEFAULT (date('now')),
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id)
  );

  CREATE TABLE IF NOT EXISTS rotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_tecnico INTEGER NOT NULL,
    data TEXT NOT NULL,
    geojson_rota TEXT DEFAULT '{}',
    waypoints_order TEXT DEFAULT '[]',
    criado_em TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id)
  );

  CREATE TABLE IF NOT EXISTS gps_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_tecnico INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    client_point_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    speed REAL,
    bearing REAL,
    battery REAL,
    captured_at TEXT NOT NULL,
    captured_date_local TEXT NOT NULL,
    received_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id),
    UNIQUE (device_id, client_point_id)
  );

  CREATE INDEX IF NOT EXISTS idx_gps_points_tecnico_time
    ON gps_points (id_tecnico, captured_at);

  CREATE INDEX IF NOT EXISTS idx_gps_points_date
    ON gps_points (captured_date_local, id_tecnico);

  CREATE TABLE IF NOT EXISTS gps_latest (
    id_tecnico INTEGER PRIMARY KEY,
    device_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    speed REAL,
    bearing REAL,
    battery REAL,
    captured_at TEXT NOT NULL,
    captured_date_local TEXT NOT NULL,
    received_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id)
  );

  CREATE TABLE IF NOT EXISTS gps_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_tecnico INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER DEFAULT 0,
    center_latitude REAL NOT NULL,
    center_longitude REAL NOT NULL,
    radius_meters REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    points_count INTEGER DEFAULT 0,
    captured_date_local TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_gps_stops_tecnico_date
    ON gps_stops (id_tecnico, captured_date_local, started_at);
`);

// ─── Seed: técnicos e serviços de teste ──────────────────
function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as c FROM tecnicos').get().c;
  if (count > 0) return;

  const insertTecnico = db.prepare('INSERT INTO tecnicos (nome) VALUES (?)');
  const insertServico = db.prepare(`
    INSERT INTO servicos (id_tecnico, nome_cliente, endereco, localidade, tipo_servico, periodo)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    // Técnicos
    insertTecnico.run('Alex');
    insertTecnico.run('Jailson');
    insertTecnico.run('Jucelio');
    insertTecnico.run('Jeovane');

    // Alex (id=1) — manhã, Cabanas
    insertServico.run(1, 'MÁRCIA MARIA FILHO SILVA', 'RUA DO COMERCIO', 'CABANAS', 'instalação', 'manhã');
    insertServico.run(1, 'IVANEIDE LOPES DA SILVA MELO', 'ANTÔNIO AVARISTO DE SOUZA', 'CABANAS', 'instalação', 'manhã');
    insertServico.run(1, 'SIMONE MARIA DA CONCEIÇÃO VÉRAS', 'RUA NOVA 3', 'CABANAS', 'instalação', 'manhã');
    insertServico.run(1, 'JOSE ANTONIO DE MATOS', 'RUA ROGERIO DUNES DE ANDRADE', 'CABANAS', 'instalação', 'manhã');

    // Jailson (id=2) — manhã
    insertServico.run(2, 'MARIA SOARES DOS SANTOS', '', 'SITIO CALDEIRÃO DE CIMA', 'instalação', 'manhã');
    insertServico.run(2, 'JOSÉ EDNALDO SILVA SANTOS', '', 'SÍTIO JOSE JERONIMO', 'passar segundo roteador', 'manhã');

    // Jucelio (id=3) — manhã
    insertServico.run(3, 'MARIA ERINEIDE SILVA DOS SANTOS', '', 'SITIO CALDEIRÃOZINHO', 'instalação', 'manhã');
    insertServico.run(3, 'MARIA JOSE DE LIMA', '', 'SITIO CALDEIRÃOZINHO', 'instalação', 'manhã');

    // Jeovane (id=4) — manhã
    insertServico.run(4, 'CIBELLE PATRICIA RODRIGUES DE MOURA', 'RUA DA SERRA', 'POVOADO PIMENTA', 'instalação', 'manhã');
    insertServico.run(4, 'MARIA SANDRA NASCIMENTO SILVA', '', 'SITIO MALHADA', 'instalação', 'manhã');
  });

  seed();
  console.log('[DB] Seed: 4 técnicos + 10 serviços inseridos');
}

seedIfEmpty();

module.exports = db;
