# 🌯 Beduíno Árabe - Logística Preditiva em Tempo Real

> Sistema inteligente de pedidos antecipados que sincroniza o tempo de preparo da cozinha com o deslocamento via GPS (API OSRM) e comunicação bidirecional (WebSockets) para garantir que a refeição fique pronta no exato momento da chegada do cliente.

---

## 🚀 Funcionalidades Mapeadas

* **Aba do Cliente (`index.html`):** Cardápio dinâmico integrado com tempos de preparo específicos para cada prato (esfihas, beirutes, porções). Envia automaticamente coordenadas de geolocalização em segundo plano para o servidor.
* **Painel da Cozinha (`cozinha.html`):** Dashboard de produção automatizado. Os pratos entram em modo de alerta visual pulsante (`🚨 GATILHO`) se o tempo estático limite estourar ou se o trânsito real do cliente via GPS for menor que o tempo de chapa necessário.
* **Métricas de Performance (`dashboard.html`):** Painel gerencial restrito que calcula a eficiência da operação em tempo real (Total de pedidos, sincronia perfeita e tempo de espera do cliente na loja ou do prato na estufa).
* **Segurança de Nível de Produção:** Autenticação robusta utilizando cookies criptografados (`httpOnly`) e validação de rotas através de tokens JWT.

---

## 🛠️ Tecnologias Utilizadas

O ecossistema foi construído utilizando o que há de mais moderno no desenvolvimento web full-stack:

| Camada | Tecnologia | Descrição |
| :--- | :--- | :--- |
| **Front-end** | HTML5 / Tailwind CSS | Rápida estilização responsiva e efeitos visuais nativos. |
| **Back-end** | Node.js / Express | Servidor HTTP leve, rápido e modular. |
| **Banco de Dados**| SQLite | Persistência relacional estável e leve para histórico e usuários. |
| **Tempo Real** | Socket.io (WebSockets) | Comunicação instantânea bidirecional entre cozinha e cliente. |
| **Logística/Mapas**| OSRM (Open Source Routing Machine) | Consumo de API de mapas rodoviários para cálculo de trânsito em minutos. |
| **Segurança** | JWT & Bcryptjs | Criptografia de senhas e geração de tokens para sessões seguras. |

---

## 📦 Como Rodar o Projeto Localmente

### 1. Clonar o repositório
```bash
git clone [https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git](https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git)
cd NOME_DO_REPOSITORIO
