# Documentação API IXC Soft — INMAP & FiberDocs

> Referência completa para construir um sistema de mapa próprio usando os dados do IXC Provedor.
>
> Fonte: https://wikiapiprovedor.ixcsoft.com.br/

---

## Sumário

1. [Configuração e Autenticação da API](#1-configuração-e-autenticação-da-api)
2. [Estrutura Base das Requisições](#2-estrutura-base-das-requisições)
3. [Tabelas do Módulo INMAP](#3-tabelas-do-módulo-inmap)
   - [df_projeto (Projetos FiberDocs)](#31-df_projeto--projetos-fiberdocs)
   - [df_elemento (Elementos FiberDocs)](#32-df_elemento--elementos-fiberdocs)
   - [df_tipo_elemento_regiao (Tipos de Elemento / Regiões de Cobertura)](#33-df_tipo_elemento_regiao--tipos-de-elemento--regiões-de-cobertura)
   - [rad_caixa_ftth (Caixas de Atendimento FTTH)](#34-rad_caixa_ftth--caixas-de-atendimento-ftth)
4. [Tabelas Complementares para o Mapa](#4-tabelas-complementares-para-o-mapa)
   - [cliente (Clientes)](#41-cliente--clientes)
   - [cliente_contrato (Contratos)](#42-cliente_contrato--contratos)
   - [radusuarios (Logins/Conexões)](#43-radusuarios--loginsconexões)
   - [radpop (POPs — Pontos de Presença)](#44-radpop--pops--pontos-de-presença)
   - [radpop_radio_cliente_fibra (ONUs — Clientes Fibra)](#45-radpop_radio_cliente_fibra--onus--clientes-fibra)
   - [estrutura (Estruturas/Filiais)](#46-estrutura--estruturasfiliais)
   - [cidade (Cidades)](#47-cidade--cidades)
   - [contato (Contatos/Leads)](#48-contato--contatosleads)
5. [Exemplos de Código](#5-exemplos-de-código)
6. [Estratégia de Montagem do Mapa](#6-estratégia-de-montagem-do-mapa)

---

## 1. Configuração e Autenticação da API

### URL Base

```
https://SEU_DOMINIO/webservice/v1
```

### Token de Acesso

O token é gerado no cadastro do usuário dentro do IXC. Formato:

```
ID_USUARIO:TOKEN_HASH
```

Exemplo: `6:4dacdb8e47193e8cbbabe508c3c59b4547e463817b1d9b9a1d20ab4812fe1a62`

### Autenticação

A API usa **Basic Authentication**. O token deve ser convertido para Base64:

```
Authorization: Basic <base64(ID:TOKEN)>
```

### Headers Obrigatórios

| Header          | Valor                     | Obrigatório |
|-----------------|---------------------------|-------------|
| `Authorization` | `Basic <token_base64>`    | Sim         |
| `Content-Type`  | `application/json`        | Sim         |
| `ixcsoft`       | `listar`                  | Apenas GET/Listar |

### Métodos HTTP

| Método   | Ação        | Endpoint                              |
|----------|-------------|---------------------------------------|
| `POST`   | Inserir     | `/webservice/v1/{tabela}`             |
| `PUT`    | Editar      | `/webservice/v1/{tabela}/{id}`        |
| `DELETE` | Deletar     | `/webservice/v1/{tabela}/{id}`        |
| `POST`   | Listar      | `/webservice/v1/{tabela}` (com header `ixcsoft: listar`) |

> **Nota:** Para **listar** registros, usa-se `POST` com o header especial `ixcsoft: listar`.

---

## 2. Estrutura Base das Requisições

### Listar Registros (Consulta)

```json
{
  "qtype": "tabela.campo",
  "query": "valor",
  "oper": "=",
  "page": "1",
  "rp": "20",
  "sortname": "tabela.id",
  "sortorder": "desc"
}
```

| Parâmetro   | Descrição                                      |
|-------------|-------------------------------------------------|
| `qtype`     | Campo para filtro (ex: `cliente.id`)            |
| `query`     | Valor para consultar                            |
| `oper`      | Operador: `=`, `>`, `<`, `>=`, `<=`, `!=`, `%` |
| `page`      | Página a ser exibida                            |
| `rp`        | Registros por página (máx depende do servidor)  |
| `sortname`  | Campo de ordenação                              |
| `sortorder` | `asc` (crescente) ou `desc` (decrescente)       |

### Resposta Padrão

```json
{
  "page": "1",
  "total": 150,
  "registros": [
    { "id": "1", "campo1": "valor1", ... }
  ]
}
```

---

## 3. Tabelas do Módulo INMAP

### 3.1. `df_projeto` — Projetos FiberDocs

O projeto é o **container principal** do mapa FiberDocs. Define a área geográfica central e o zoom inicial do mapa.

**Endpoint:** `/webservice/v1/df_projeto`

| Campo        | Tipo                  | Obrigatório | Descrição                                     |
|--------------|-----------------------|-------------|------------------------------------------------|
| `id`         | Texto (11)            | Sim         | Auto-incrementável. Não enviar ao inserir.     |
| `nome`       | Texto (100)           | Sim         | Nome do projeto                                |
| `id_filial`  | Busca avançada        | Não         | FK → `filial.id`                               |
| `zoom`       | Texto (11)            | Sim         | Nível de zoom inicial do mapa                  |
| `status`     | Seleção               | Sim         | Status do projeto (ativo/inativo)              |
| `cor_mapa`   | Texto (45)            | Não         | Cor do projeto no mapa                         |
| `longitude`  | Texto (45)            | Sim         | **Longitude do centro do projeto**             |
| `latitude`   | Texto (45)            | Sim         | **Latitude do centro do projeto**              |

> **Uso no mapa:** Centralizar a viewport do mapa na `latitude`/`longitude` com o `zoom` definido.

---

### 3.2. `df_elemento` — Elementos FiberDocs

Cada elemento é um **objeto no mapa** (cabo, CTO, poste, splitter, emenda, etc).

**Endpoint:** `/webservice/v1/df_elemento`

| Campo                | Tipo                  | Obrigatório | Descrição                                     |
|----------------------|-----------------------|-------------|------------------------------------------------|
| `id`                 | Texto (11)            | Sim         | Auto-incrementável. Não enviar ao inserir.     |
| `id_projeto`         | Busca avançada        | Sim         | FK → `df_projeto.id`                           |
| `id_tipo_elemento`   | Busca avançada        | Sim         | FK → `df_tipo_elemento.id`                     |
| `descricao`          | Texto (45)            | Sim         | Descrição/rótulo do elemento                   |
| `preco_unidade`      | Texto (20)            | Sim         | Preço por unidade                              |
| `observacao`         | Área de texto (45)    | Sim         | Observações                                    |
| `tipo`               | Texto (10)            | Sim         | Tipo do elemento                               |
| `id_diretorio`       | Texto (11)            | Não         | ID do diretório                                |
| `ultima_atualizacao` | Texto (20)            | Não         | Data/hora da última atualização                |

> **Nota:** Este registro contém os dados dos elementos. As **coordenadas geográficas** (polylines, pontos) são armazenadas internamente pelo FiberDocs e podem ser acessadas em conjunto com os elementos.

---

### 3.3. `df_tipo_elemento_regiao` — Tipos de Elemento / Regiões de Cobertura

Define os **tipos de elementos** e as **regiões de cobertura** que aparecem no mapa.

**Endpoint:** `/webservice/v1/df_tipo_elemento_regiao`

| Campo                      | Tipo              | Obrigatório | Descrição                                              |
|----------------------------|-------------------|-------------|--------------------------------------------------------|
| `id`                       | Texto (11)        | Sim         | Auto-incrementável                                     |
| `status`                   | Seleção           | Não         | Status (ativo/inativo)                                 |
| `nome_tipo`                | Texto (45)        | Sim         | Nome do tipo de elemento                               |
| `especura_linha`           | Texto (11)        | Não         | Espessura da linha no mapa (px)                        |
| `cor_fundo`                | Texto (100)       | Não         | Cor de fundo no mapa (hex/rgb)                         |
| `cor_ativa`                | Texto (100)       | Não         | Cor quando ativa/selecionada                           |
| `pontilhada`               | Seleção           | Sim         | Se a linha é pontilhada                                |
| `verificar_viabilidade`    | Checkbox          | Não         | Se participa da verificação de viabilidade             |
| `classificacao_tipo`       | —                 | Sim         | Classificação do tipo                                  |
| `id_categoria_tipo`        | —                 | Sim         | Categoria do tipo                                      |
| `categoria_tipo`           | —                 | Não         | Nome da categoria                                      |
| `tec_28`                   | Checkbox          | Não         | Tecnologia 2.8 GHz                                    |
| `tec_58`                   | Checkbox          | Não         | Tecnologia 5.8 GHz                                    |
| `tec_adsl`                 | Checkbox          | Não         | Tecnologia ADSL                                        |
| `tec_cabo`                 | Checkbox          | Não         | Tecnologia Cabo                                        |
| `tec_fibra`                | Checkbox          | Não         | Tecnologia Fibra                                       |
| `url_icone`                | —                 | Não         | URL do ícone personalizado no mapa                     |
| `criacao_automatica`       | —                 | Não         | Criação automática                                     |

> **Uso no mapa:** Define a simbologia — cores, espessura de linhas, ícones e se a linha é pontilhada. Essencial para renderizar corretamente cada tipo de elemento.

---

### 3.4. `rad_caixa_ftth` — Caixas de Atendimento FTTH

Caixas de derivação/atendimento (CTOs, CEOs, etc.) com **coordenadas geográficas**.

**Endpoint:** `/webservice/v1/rad_caixa_ftth`

| Campo                   | Tipo              | Obrigatório | Descrição                                              |
|-------------------------|-------------------|-------------|--------------------------------------------------------|
| `id`                    | Texto (11)        | Sim         | Auto-incrementável                                     |
| `descricao`             | Texto             | Sim         | Descrição/nome da caixa                                |
| `tipo`                  | Seleção           | Não         | Tipo de caixa                                          |
| `id_projeto`            | Busca avançada    | Sim         | FK → `df_projeto.id`                                   |
| `id_transmissor`        | Busca avançada    | Não         | FK → `radpop_radio.id` (OLT)                           |
| `id_interface`          | Busca avançada    | Não         | FK → `radpop_radio_porta_fibra.id`                     |
| `id_tecnologia`         | Busca avançada    | Não         | FK → `rad_caixa_ftth_tecnologia.id`                    |
| `capacidade`            | Texto             | Não         | Capacidade de portas                                   |
| `codigo_estilo_caixa`   | Seleção           | Sim         | Estilo visual no mapa                                  |
| `obs_caixa_ftth`        | Área de texto     | Não         | Observações                                            |
| `status`                | Seleção           | Não         | Status da caixa                                        |
| `idx`                   | Texto             | Não         | Índice para integração                                 |
| `ultima_atualizacao`    | Texto             | Não         | Última atualização                                     |
| `cep`                   | Texto             | Não         | CEP                                                    |
| `endereco`              | Texto             | Não         | Endereço                                               |
| `numero`                | Texto             | Não         | Número                                                 |
| `bairro`                | Texto             | Não         | Bairro                                                 |
| `id_cidade`             | Busca avançada    | Não         | FK → `cidade.id`                                       |
| **`latitude`**          | **Texto**         | **Não**     | **Latitude da caixa (coordenada)**                     |
| **`longitude`**         | **Texto**         | **Não**     | **Longitude da caixa (coordenada)**                    |

> **Uso no mapa:** Plotar cada caixa como marcador/ponto no mapa usando `latitude` e `longitude`. Usar `codigo_estilo_caixa` para diferenciar os ícones.

---

## 4. Tabelas Complementares para o Mapa

### 4.1. `cliente` — Clientes

**Endpoint:** `/webservice/v1/cliente`

**Campos relevantes para o mapa:**

| Campo           | Tipo              | Obrigatório | Descrição                          |
|-----------------|-------------------|-------------|------------------------------------|
| `id`            | Texto (11)        | Sim         | Auto-incrementável                 |
| `razao`         | Texto             | Sim         | Nome/Razão social                  |
| `fantasia`      | Texto             | Não         | Nome fantasia                      |
| `cnpj_cpf`      | Texto             | Não         | CPF ou CNPJ                        |
| `tipo_pessoa`   | Seleção           | Sim         | Física ou Jurídica                 |
| `ativo`         | Seleção           | Sim         | Status ativo/inativo               |
| `endereco`      | Texto             | Sim         | Endereço do cliente                |
| `numero`        | Texto             | Sim         | Número                             |
| `bairro`        | Texto             | Sim         | Bairro                             |
| `cidade`        | Busca avançada    | Sim         | FK → `cidade.id`                   |
| `cep`           | Texto             | Não         | CEP                                |
| **`latitude`**  | **Texto**         | **Não**     | **Latitude do endereço**           |
| **`longitude`** | **Texto**         | **Não**     | **Longitude do endereço**          |
| `email`         | Texto             | Não         | E-mail                             |
| `fone`          | Texto             | Não         | Telefone                           |
| `telefone_celular` | Texto          | Não         | Celular                            |

> **Uso no mapa:** Marcar a localização de cada cliente. Associar com contratos e logins para exibir status de conexão.

---

### 4.2. `cliente_contrato` — Contratos

**Endpoint:** `/webservice/v1/cliente_contrato`

**Campos relevantes para o mapa:**

| Campo              | Tipo              | Obrigatório | Descrição                               |
|--------------------|-------------------|-------------|------------------------------------------|
| `id`               | Texto (11)        | Sim         | Auto-incrementável                       |
| `id_cliente`       | Busca avançada    | Sim         | FK → `cliente.id`                        |
| `id_vd_contrato`   | Busca avançada    | Sim         | FK → `vd_contratos.id` (plano)           |
| `status`           | Status            | Não         | Status do contrato                       |
| `status_internet`  | Status            | Não         | Status da internet (ativo/bloqueado)     |
| `data_ativacao`    | Texto             | Não         | Data de ativação                         |
| `data_cancelamento`| Texto             | Não         | Data de cancelamento                     |
| `endereco`         | Texto             | Não         | Endereço de instalação                   |
| `numero`           | Texto             | Não         | Número                                   |
| `bairro`           | Texto             | Não         | Bairro                                   |
| `cidade`           | Busca avançada    | Não         | FK → `cidade.id`                         |
| **`latitude`**     | **Texto**         | **Não**     | **Latitude da instalação**               |
| **`longitude`**    | **Texto**         | **Não**     | **Longitude da instalação**              |
| `bloqueio_automatico` | Seleção        | Sim         | Bloqueio automático habilitado           |

> **Uso no mapa:** Quando o contrato tem endereço diferente do cliente, usar estas coordenadas. O campo `status_internet` permite colorir no mapa (verde=ativo, vermelho=bloqueado, cinza=cancelado).

---

### 4.3. `radusuarios` — Logins/Conexões

**Endpoint:** `/webservice/v1/radusuarios`

**Campos relevantes para o mapa:**

| Campo                        | Tipo              | Obrigatório | Descrição                                  |
|------------------------------|-------------------|-------------|---------------------------------------------|
| `id`                         | Texto (11)        | Sim         | Auto-incrementável                          |
| `id_cliente`                 | Busca avançada    | Sim         | FK → `cliente.id`                           |
| `id_contrato`                | Busca avançada    | Não         | FK → `cliente_contrato.id`                  |
| `login`                      | Texto             | Sim         | Login do usuário                            |
| `ativo`                      | Seleção           | Sim         | Ativo/Inativo                               |
| `online`                     | Status            | Não         | Se está online agora                        |
| `tipo_conexao_mapa`          | Seleção           | Sim         | Tipo de conexão exibido no mapa             |
| `ip`                         | Texto             | Não         | IP atribuído                                |
| `mac`                        | Texto             | Não         | MAC Address                                 |
| `id_df_projeto`              | Busca avançada    | Não         | FK → `df_projeto.id`                        |
| `id_transmissor`             | Busca avançada    | Não         | FK → `radpop_radio.id` (OLT)               |
| `id_caixa_ftth`              | Busca avançada    | Não         | FK → `rad_caixa_ftth.id` (CTO)             |
| `ftth_porta`                 | Texto             | Não         | Porta na caixa FTTH                         |
| `onu_mac`                    | Texto             | Não         | MAC da ONU                                  |
| `sinal_ultimo_atendimento`   | Texto             | Não         | Sinal óptico último atendimento             |
| `download_atual`             | Texto             | Não         | Download atual                              |
| `upload_atual`               | Texto             | Não         | Upload atual                                |
| `ultima_conexao_inicial`     | Texto             | Não         | Início da última conexão                    |
| `ultima_conexao_final`       | Texto             | Não         | Fim da última conexão                       |
| **`latitude`**               | **Texto**         | **Não**     | **Latitude do login**                       |
| **`longitude`**              | **Texto**         | **Não**     | **Longitude do login**                      |
| `endereco`                   | Texto             | Não         | Endereço do login                           |
| `bairro`                     | Texto             | Não         | Bairro                                      |
| `cidade`                     | Busca avançada    | Não         | FK → `cidade.id`                            |

> **Uso no mapa:** Exibir conexões no mapa. `online` indica status em tempo real. `id_caixa_ftth` vincula o login à CTO para traçar a fibra no mapa.

---

### 4.4. `radpop` — POPs (Pontos de Presença)

**Endpoint:** `/webservice/v1/radpop`

| Campo            | Tipo              | Obrigatório | Descrição                          |
|------------------|-------------------|-------------|------------------------------------|
| `id`             | Texto (11)        | Sim         | Auto-incrementável                 |
| `pop`            | Texto             | Sim         | Nome do POP                        |
| `id_projeto`     | Busca avançada    | Não         | FK → `df_projeto.id`              |
| `cep`            | Texto             | Não         | CEP                                |
| `endereco`       | Texto             | Não         | Endereço                           |
| `numero`         | Texto             | Não         | Número                             |
| `bairro`         | Texto             | Não         | Bairro                             |
| `id_cidade`      | Busca avançada    | Sim         | FK → `cidade.id`                   |
| **`latitude`**   | **Texto**         | **Não**     | **Latitude do POP**                |
| **`longitude`**  | **Texto**         | **Não**     | **Longitude do POP**               |
| `id_fornecedor`  | Busca avançada    | Não         | FK → `fornecedor.id`              |

> **Uso no mapa:** Plotar os pontos de presença como marcadores grandes/importantes. São os nós centrais da rede.

---

### 4.5. `radpop_radio_cliente_fibra` — ONUs (Clientes Fibra)

**Endpoint:** `/webservice/v1/radpop_radio_cliente_fibra`

**Campos relevantes para o mapa:**

| Campo               | Tipo              | Obrigatório | Descrição                              |
|---------------------|-------------------|-------------|----------------------------------------|
| `id`                | Texto (11)        | Sim         | Auto-incrementável                     |
| `id_transmissor`    | Busca avançada    | Sim         | FK → `radpop_radio.id` (OLT)          |
| `id_projeto`        | Busca avançada    | Não         | FK → `df_projeto.id`                   |
| `id_caixa_ftth`     | Busca avançada    | Não         | FK → `rad_caixa_ftth.id`              |
| `id_login`          | Busca avançada    | Não         | FK → `radusuarios.id`                  |
| `nome`              | Texto             | Sim         | Nome/identificação da ONU              |
| `mac`               | Texto             | Não         | MAC da ONU                              |
| `sinal_rx`          | Texto             | Não         | Sinal RX (recebido)                    |
| `sinal_tx`          | Texto             | Não         | Sinal TX (transmitido)                 |
| `temperatura`       | Texto             | Não         | Temperatura da ONU                     |
| `distancia_onu`     | Texto             | Não         | Distância da ONU até a OLT             |
| **`latitude`**      | **Texto**         | **Não**     | **Latitude da ONU**                    |
| **`longitude`**     | **Texto**         | **Não**     | **Longitude da ONU**                   |

> **Uso no mapa:** Plotar a localização de cada ONU. Os campos `sinal_rx`/`sinal_tx` podem ser usados para heatmaps de qualidade de sinal.

---

### 4.6. `estrutura` — Estruturas/Filiais

**Endpoint:** `/webservice/v1/estrutura`

| Campo            | Tipo              | Obrigatório | Descrição                          |
|------------------|-------------------|-------------|------------------------------------|
| `id`             | Texto (11)        | Sim         | Auto-incrementável                 |
| `ativo`          | Checkbox          | Sim         | Status                             |
| `id_filial`      | Busca avançada    | Não         | FK → `filial.id`                   |
| `descricao`      | Texto             | Sim         | Descrição da estrutura             |
| `cep`            | Texto             | Não         | CEP                                |
| `endereco`       | Texto             | Não         | Endereço                           |
| `numero`         | Texto             | Não         | Número                             |
| `bairro`         | Texto             | Não         | Bairro                             |
| `id_cidade`      | Busca avançada    | Sim         | FK → `cidade.id`                   |
| **`latitude`**   | **Texto**         | **Não**     | **Latitude da estrutura**          |
| **`longitude`**  | **Texto**         | **Não**     | **Longitude da estrutura**         |

---

### 4.7. `cidade` — Cidades

**Endpoint:** `/webservice/v1/cidade`

| Campo       | Tipo              | Obrigatório | Descrição                          |
|-------------|-------------------|-------------|------------------------------------|
| `id`        | Texto (11)        | Sim         | Auto-incrementável                 |
| `origem`    | Seleção           | Sim         | Nacional ou Internacional          |
| `nome`      | Texto             | Sim         | Nome da cidade                     |
| `uf`        | Busca avançada    | Sim         | FK → `uf.id`                       |
| `regiao`    | Texto             | Não         | Região                             |
| `cod_ibge`  | Texto             | Sim         | Código IBGE                        |

---

### 4.8. `contato` — Contatos/Leads

**Endpoint:** `/webservice/v1/contato`

**Campos relevantes para o mapa (verificação de viabilidade e leads):**

| Campo                       | Tipo              | Obrigatório | Descrição                                |
|-----------------------------|-------------------|-------------|-------------------------------------------|
| `id`                        | Texto (11)        | Sim         | Auto-incrementável                        |
| `id_cliente`                | Busca avançada    | Não         | FK → `cliente.id`                         |
| `nome`                      | Texto             | Sim         | Nome do contato                           |
| `lead`                      | Seleção           | Não         | É um lead?                                |
| `id_tipo_elemento`          | Busca avançada    | Não         | FK → `df_tipo_elemento_regiao.id`         |
| `status_viabilidade`        | Status            | Não         | Status da viabilidade                     |
| `tipo_rede`                 | Status            | Não         | Tipo de rede disponível                   |
| `caixa_mais_proxima`        | Busca avançada    | Não         | FK → `rad_caixa_ftth.id`                  |
| `distancia_caixa_mais_proxima` | —              | Não         | Distância até a CTO mais próxima          |
| **`latitude`**              | **Texto**         | **Não**     | **Latitude do contato**                   |
| **`longitude`**             | **Texto**         | **Não**     | **Longitude do contato**                  |
| `endereco`                  | Texto             | Não         | Endereço                                  |
| `bairro`                    | Texto             | Não         | Bairro                                    |
| `cidade`                    | Busca avançada    | Não         | FK → `cidade.id`                          |

> **Uso no mapa:** Plotar leads/contatos para análise de viabilidade. O campo `caixa_mais_proxima` e `distancia_caixa_mais_proxima` são essenciais para verificação de viabilidade técnica no mapa.

---

## 5. Exemplos de Código

### 5.1. CURL — Listar Projetos FiberDocs

```bash
curl -k -s \
  -H "Authorization: Basic $(echo -n 'ID:TOKEN' | base64 | tr -d [:space:])" \
  -H "Content-Type: application/json" \
  -H "ixcsoft: listar" \
  -X POST \
  -d '{
    "qtype": "df_projeto.id",
    "query": "0",
    "oper": ">",
    "page": "1",
    "rp": "100",
    "sortname": "df_projeto.id",
    "sortorder": "desc"
  }' \
  "https://SEU_DOMINIO/webservice/v1/df_projeto"
```

### 5.2. CURL — Listar Caixas de Atendimento FTTH

```bash
curl -k -s \
  -H "Authorization: Basic $(echo -n 'ID:TOKEN' | base64 | tr -d [:space:])" \
  -H "Content-Type: application/json" \
  -H "ixcsoft: listar" \
  -X POST \
  -d '{
    "qtype": "rad_caixa_ftth.id",
    "query": "0",
    "oper": ">",
    "page": "1",
    "rp": "500",
    "sortname": "rad_caixa_ftth.id",
    "sortorder": "asc"
  }' \
  "https://SEU_DOMINIO/webservice/v1/rad_caixa_ftth"
```

### 5.3. CURL — Listar Elementos FiberDocs de um Projeto

```bash
curl -k -s \
  -H "Authorization: Basic $(echo -n 'ID:TOKEN' | base64 | tr -d [:space:])" \
  -H "Content-Type: application/json" \
  -H "ixcsoft: listar" \
  -X POST \
  -d '{
    "qtype": "df_elemento.id_projeto",
    "query": "1",
    "oper": "=",
    "page": "1",
    "rp": "1000",
    "sortname": "df_elemento.id",
    "sortorder": "asc"
  }' \
  "https://SEU_DOMINIO/webservice/v1/df_elemento"
```

### 5.4. CURL — Listar Clientes com Coordenadas

```bash
curl -k -s \
  -H "Authorization: Basic $(echo -n 'ID:TOKEN' | base64 | tr -d [:space:])" \
  -H "Content-Type: application/json" \
  -H "ixcsoft: listar" \
  -X POST \
  -d '{
    "qtype": "cliente.ativo",
    "query": "S",
    "oper": "=",
    "page": "1",
    "rp": "500",
    "sortname": "cliente.id",
    "sortorder": "asc"
  }' \
  "https://SEU_DOMINIO/webservice/v1/cliente"
```

### 5.5. PHP — Listar Caixas FTTH

```php
<?php
require(__DIR__ . DIRECTORY_SEPARATOR . 'WebserviceClient.php');

$host = 'https://SEU_DOMINIO/webservice/v1';
$token = 'ID:TOKEN_HASH';
$selfSigned = true;

$api = new IXCsoft\WebserviceClient($host, $token, $selfSigned);

$params = array(
    'qtype'     => 'rad_caixa_ftth.id',
    'query'     => '0',
    'oper'      => '>',
    'page'      => '1',
    'rp'        => '500',
    'sortname'  => 'rad_caixa_ftth.id',
    'sortorder' => 'asc'
);

$api->get('rad_caixa_ftth', $params);
$retorno = $api->getRespostaConteudo(true); // true para array

foreach ($retorno['registros'] as $caixa) {
    echo "CTO: {$caixa['descricao']} - Lat: {$caixa['latitude']} Lng: {$caixa['longitude']}\n";
}
?>
```

### 5.6. Python — Listar POPs

```python
import requests
import base64

host = "https://SEU_DOMINIO/webservice/v1"
token = "ID:TOKEN_HASH"
token_b64 = base64.b64encode(token.encode()).decode()

headers = {
    "Authorization": f"Basic {token_b64}",
    "Content-Type": "application/json",
    "ixcsoft": "listar"
}

payload = {
    "qtype": "radpop.id",
    "query": "0",
    "oper": ">",
    "page": "1",
    "rp": "100",
    "sortname": "radpop.id",
    "sortorder": "asc"
}

response = requests.post(f"{host}/radpop", json=payload, headers=headers, verify=False)
data = response.json()

for pop in data.get("registros", []):
    print(f"POP: {pop['pop']} - Lat: {pop['latitude']} Lng: {pop['longitude']}")
```

### 5.7. JavaScript (Node.js) — Listar Logins com Coordenadas

```javascript
const axios = require('axios');

const host = 'https://SEU_DOMINIO/webservice/v1';
const token = Buffer.from('ID:TOKEN_HASH').toString('base64');

const headers = {
    'Authorization': `Basic ${token}`,
    'Content-Type': 'application/json',
    'ixcsoft': 'listar'
};

const payload = {
    qtype: 'radusuarios.ativo',
    query: 'S',
    oper: '=',
    page: '1',
    rp: '500',
    sortname: 'radusuarios.id',
    sortorder: 'asc'
};

axios.post(`${host}/radusuarios`, payload, {
    headers,
    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
})
.then(res => {
    const logins = res.data.registros;
    logins.forEach(login => {
        if (login.latitude && login.longitude) {
            console.log(`Login: ${login.login} - Online: ${login.online} - [${login.latitude}, ${login.longitude}]`);
        }
    });
});
```

---

## 6. Estratégia de Montagem do Mapa

### 6.1. Camadas Recomendadas

| Camada                   | Tabela API                        | Dados Geográficos          |
|--------------------------|-----------------------------------|----------------------------|
| Projetos (áreas)         | `df_projeto`                      | `latitude`, `longitude`, `zoom` |
| Elementos de rede        | `df_elemento`                     | Vinculado ao projeto       |
| Tipos/Simbologia         | `df_tipo_elemento_regiao`         | `cor_fundo`, `cor_ativa`, `espessura_linha`, `url_icone` |
| Caixas FTTH (CTOs)       | `rad_caixa_ftth`                  | `latitude`, `longitude`    |
| POPs                     | `radpop`                          | `latitude`, `longitude`    |
| Clientes                 | `cliente`                         | `latitude`, `longitude`    |
| Contratos (instalação)   | `cliente_contrato`                | `latitude`, `longitude`    |
| Logins/Conexões          | `radusuarios`                     | `latitude`, `longitude`    |
| ONUs (Fibra)             | `radpop_radio_cliente_fibra`      | `latitude`, `longitude`    |
| Estruturas               | `estrutura`                       | `latitude`, `longitude`    |
| Leads/Viabilidade        | `contato`                         | `latitude`, `longitude`    |

### 6.2. Fluxo de Dados Recomendado

```
1. Carregar df_projeto → centralizar mapa
2. Carregar df_tipo_elemento_regiao → montar simbologia
3. Carregar rad_caixa_ftth → plotar CTOs
4. Carregar radpop → plotar POPs
5. Carregar radusuarios → plotar conexões
6. Carregar cliente → plotar clientes
7. Carregar contato (leads) → plotar viabilidade
```

### 6.3. Relacionamentos Principais

```
df_projeto (Projeto)
  ├── df_elemento (Elementos do projeto)
  │     └── df_tipo_elemento_regiao (Tipo/simbologia)
  ├── rad_caixa_ftth (CTOs do projeto)
  │     └── radusuarios (Logins vinculados à CTO)
  ├── radpop (POPs do projeto)
  │     └── radpop_radio (OLTs/Transmissores)
  │           └── radpop_radio_cliente_fibra (ONUs)
  └── radusuarios (Logins do projeto)
        └── cliente_contrato (Contrato do login)
              └── cliente (Dados do cliente)
```

### 6.4. Filtros Úteis por Projeto

Para montar o mapa de um projeto específico, filtre todas as consultas por `id_projeto`:

```json
{
  "qtype": "rad_caixa_ftth.id_projeto",
  "query": "1",
  "oper": "=",
  "page": "1",
  "rp": "9999"
}
```

### 6.5. Status e Cores Sugeridas

| Entidade        | Campo Status         | Valores           | Cor Sugerida             |
|-----------------|----------------------|-------------------|--------------------------|
| Cliente         | `ativo`              | `S` / `N`         | Verde / Cinza            |
| Contrato        | `status_internet`    | Ativo/Bloqueado   | Verde / Vermelho         |
| Login           | `online`             | `S` / `N`         | Verde / Amarelo          |
| Caixa FTTH      | `status`             | Ativo/Inativo     | Azul / Cinza             |

---

## Notas Importantes

1. **Paginação:** A API retorna resultados paginados. Use `page` e `rp` para navegar. Itere todas as páginas para obter todos os registros.

2. **Certificado SSL:** Se usar certificado auto-assinado, desabilite a verificação SSL (`-k` no curl, `verify=False` em Python, `rejectUnauthorized: false` em Node.js).

3. **Rate Limiting:** A API não documenta rate limits explícitos, mas evite requisições massivas simultâneas.

4. **Coordenadas:** Nem todos os registros possuem latitude/longitude preenchidos. Filtre registros sem coordenadas ao montar o mapa.

5. **WebserviceClient.php:** O IXC fornece uma classe PHP auxiliar (`WebserviceClient.php`) que facilita a integração. Pode ser obtida na documentação oficial.

6. **Operadores de Filtro:**
   - `=` — Igual
   - `>` — Maior que
   - `<` — Menor que
   - `>=` — Maior ou igual
   - `<=` — Menor ou igual
   - `!=` — Diferente
   - `%` — Contém (LIKE)
