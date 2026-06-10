const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const http = require('http'); // 🛠️ Importação necessária para o Socket
const { Server } = require('socket.io'); // 🛠️ Importação do Socket.io
const cookieParser = require('cookie-parser');
const app = express();
const server = http.createServer(app); // 🛠️ Cria o servidor HTTP acoplado ao Express
const io = new Server(server); // 🛠️ Inicializa o Socket.io no servidor
const jwt = require('jsonwebtoken');
const PORT = 3000;

app.use(cookieParser());
app.use(express.json());

const bcrypt = require('bcryptjs');

// 1. ROTA POST: Processar o Login
app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;

    db.get(`SELECT * FROM usuarios WHERE usuario = ?`, [usuario], async (err, user) => {
        if (err) return res.status(500).json({ erro: err.message });
        if (!user) return res.status(400).json({ erro: 'Usuário ou senha incorretos.' });

        // Verificar se a senha bate com o hash do banco
        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) return res.status(400).json({ erro: 'Usuário ou senha incorretos.' });

        // Gerar Token JWT (expira em 2 horas)
        const token = jwt.sign({ id: user.id, usuario: user.usuario }, JWT_SECRET, { expiresIn: '2h' });

        // Salvar nos cookies do navegador de forma segura (httpOnly)
        res.cookie('token', token, { httpOnly: true, secure: false }); // mude secure para true se usar HTTPS
        res.json({ mensagem: 'Login efetuado com sucesso!' });
    });
});

// 2. ROTA POST: Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ mensagem: 'Sessão encerrada.' });
});

// 3. Proteger os arquivos estáticos da cozinha e dashboard antes de servir a pasta public
app.get('/cozinha.html', verificarAutenticacao, (req, res) => res.sendFile(__dirname + '/public/cozinha.html'));
app.get('/dashboard.html', verificarAutenticacao, (req, res) => res.sendFile(__dirname + '/public/dashboard.html'));

// Proteger também as rotas de dados da API para ninguém burlar olhando o código

// Deixa o resto da pasta public livre (como index.html, imagens, login.html)
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || "chavesupersecreta123!@#"; // Em produção, use uma variável de ambiente para isso

function verificarAutenticacao(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        // Se for uma requisição de página HTML, redireciona para o login
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect('/login.html');
        }
        return res.status(401).json({ erro: 'Não autorizado. Faça login.' });
    }

    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        req.usuario = verificado;
        next(); // Usuário validado, pode prosseguir!
    } catch (error) {
        res.clearCookie('token');
        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return res.redirect('/login.html');
        }
        return res.status(400).json({ erro: 'Token inválido.' });
    }
}

// ==========================================
// 1. CONFIGURAÇÃO DO RESTAURANTE (GPS)
// ==========================================
const RESTAURANTE_LAT = -23.5374562;
const RESTAURANTE_LNG = -46.7775295;

// ==========================================
// 2. CONEXÃO E CRIAÇÃO DO BANCO DE DADOS
// ==========================================
const db = new sqlite3.Database('./restaurante.db', (err) => {
    if (err) console.error('Erro ao conectar ao SQLite:', err.message);
    else console.log('Conectado ao banco de dados SQLite com sucesso!');
});

db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL
    )
`, () => {
    // Criar um usuário padrão (admin / 123456) para teste, se a tabela estiver vazia
    const bcrypt = require('bcryptjs');
    db.get(`SELECT * FROM usuarios WHERE usuario = 'admin'`, async (err, row) => {
        if (!row) {
            const senhaCriptografada = await bcrypt.hash('123456', 10);
            db.run(`INSERT INTO usuarios (usuario, senha) VALUES ('admin', ?)`, [senhaCriptografada]);
            console.log("👤 Usuário padrão criado: admin / 123456");
        }
    });
});

db.run(`
    CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente TEXT NOT NULL,
        prato TEXT NOT NULL,
        tempo_base_minutos INTEGER NOT NULL,
        horario_chegada TEXT NOT NULL,
        horario_inicio_preparo TEXT,
        tempo_transito_atual INTEGER DEFAULT 999,
        status TEXT DEFAULT 'pendente',
        horario_conclusao TEXT
    )
`);

// 🛠️ Gerenciamento de conexões do Socket.io (Opcional, bom para debug)
io.on('connection', (socket) => {
    console.log(`📡 Novo cliente conectado ao WebSocket: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id}`);
    });
});

// ==========================================
// 3. ROTAS DA API
// ==========================================

const TEMPOS_CARDAPIO = {
    "Esfiha de Carne": 3,
    "Esfiha de Queijo": 3,
    "Esfiha de Calabresa": 3,
    "Beirute da Casa": 10,
    "Beirute Mata-Fome": 12,
    "Kibe Frito": 5,
    "Almofadinhas de Gouda": 6,
    "Refrigerante Lata": 0, // Bebida não gasta tempo de chapa
    "Suco Natural": 2,      // Suco gasta um tempinho para bater
    "Chocolate Árabe": 0
};

// ROTA: Criar Novo Pedido (Cliente)
app.post('/novo-pedido', (req, res) => {
    const { cliente, prato, tempo_base_minutos, horario_chegada } = req.body;
    const tempoBase = Number(tempo_base_minutos) || TEMPOS_CARDAPIO[prato] || 0;

    if (!cliente || !prato || !horario_chegada) {
        return res.status(400).json({ erro: 'cliente, prato e horario_chegada são obrigatórios.' });
    }

    const pedidosNaFrente = 3; 
    const atrasoPorPedido = 1.5; 
    const atrasoCozinha = pedidosNaFrente * atrasoPorPedido;
    const tempoTotalPreparo = tempoBase + atrasoCozinha;

    const dataChegada = new Date(horario_chegada);
    const dataInicioPreparo = new Date(dataChegada.getTime() - tempoTotalPreparo * 60000);
    const horarioInicioString = dataInicioPreparo.toISOString();

    const query = `INSERT INTO pedidos (cliente, prato, tempo_base_minutos, horario_chegada, horario_inicio_preparo) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(query, [cliente, prato, tempoBase, horario_chegada, horarioInicioString], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        
        res.json({
            mensagem: "Pedido recebido com sucesso!",
            pedido_id: this.lastID,
            cozinha_deve_comecar_as: dataInicioPreparo.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        });
    });
});

// ROTA: Atualizar GPS do Cliente em Tempo Real (OSRM API)
app.post('/atualizar-localizacao', async (req, res) => {
    const { pedidoId, lat, lng } = req.body;

    try {
        const urlOskm = `http://router.project-osrm.org/route/v1/driving/${lng},${lat};${RESTAURANTE_LNG},${RESTAURANTE_LAT}?overview=false`;
        const response = await fetch(urlOskm);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes.length > 0) {
            const rota = data.routes[0];
            const distanciaKm = rota.distance / 1000; 
            const tempoEstimadoSegundos = rota.duration; 
            const tempoEstimadoMinutos = Math.round((tempoEstimadoSegundos / 60) * 1.2);

            const query = `UPDATE pedidos SET tempo_transito_atual = ? WHERE id = ?`;

            db.run(query, [tempoEstimadoMinutos, pedidoId], function(err) {
                if (err) return res.status(500).json({ erro: err.message });
                
                res.json({ 
                    status: "Sucesso (Rota Real)",
                    distancia_km: distanciaKm.toFixed(2),
                    tempo_estimado_minutos: tempoEstimadoMinutos 
                });
            });
        } else {
            res.status(400).json({ erro: "Não foi possível calcular a rota terrestre." });
        }
    } catch (error) {
        console.error("Erro na API de Mapas:", error);
        res.status(500).json({ erro: "Erro ao consultar o servidor de mapas." });
    }
});

// ROTA: Listar Fila de Pedidos (Cozinha)
app.get('/fila-cozinha', verificarAutenticacao, (req, res) => {
    const query = `SELECT * FROM pedidos WHERE status = 'pendente' ORDER BY horario_inicio_preparo ASC`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json(rows);
    });
});

// ROTA: Concluir Pedido (Cozinha)
app.put('/concluir-pedido/:id', (req, res) => {
    const id = req.params.id;
    const agoraString = new Date().toISOString();

    console.log(`[PUT /concluir-pedido] recebendo pedido para concluir id=${id}`);

    const query = `UPDATE pedidos SET status = 'concluido', horario_conclusao = ? WHERE id = ?`;

    db.run(query, [agoraString, id], function(err) {
        if (err) {
            console.error('[PUT /concluir-pedido] erro no DB:', err.message);
            return res.status(500).json({ erro: err.message });
        }

        console.log(`[PUT /concluir-pedido] linhas afetadas: ${this.changes}`);

        // 🚨 MÁGICA DO WEBSOCKET: Avisa IMEDIATAMENTE a todos os clientes que o pedido mudou!
        io.emit('pedidoConcluido', { pedidoId: parseInt(id) });

        res.json({ mensagem: "Pedido concluído com sucesso!", linhas_afetadas: this.changes });
    });
});

// ROTA DO DASHBOARD
app.get('/metricas-restaurante', verificarAutenticacao, (req, res) => {
    const query = `SELECT * FROM pedidos WHERE status = 'concluido'`;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        let totalPedidos = rows.length;
        let totalTempoEsperaCliente = 0;

        rows.forEach(pedido => {
            const conclusao = new Date(pedido.horario_conclusao);
            const llegadaCliente = new Date(pedido.horario_chegada);
            const diferencaMinutos = (llegadaCliente - conclusao) / 60000;
            totalTempoEsperaCliente += diferencaMinutos;
        });

        const eficienciaMedia = totalPedidos > 0 ? (totalTempoEsperaCliente / totalPedidos).toFixed(1) : 0;
        res.json({
            total_pedidos_concluidos: totalPedidos,
            tempo_medio_espera_minutos: eficienciaMedia,
            historico: rows
        });
    });
});

// ==========================================
// 4. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
// 🚨 ATENÇÃO: Mudamos de app.listen para server.listen para o Socket.io rodar junto!
server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Servidor Executando em http://localhost:${PORT}`);
    console.log(`📍 Coordenadas do Restaurante prontas no sistema.`);
    console.log(`==================================================`);
});