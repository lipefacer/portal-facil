
const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Ativa compressão para carregar o app mais rápido no 4G/5G
app.use(compression());

// Serve os arquivos estáticos da raiz
app.use(express.static(__dirname));

// Suporte a roteamento SPA (redireciona rotas desconhecidas para o index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ===========================================
  🚀 PORTAL FÁCIL - SERVIDOR ATIVO
  📡 Rodando em: http://localhost:${PORT}
  🛠️  Pronto para Capacitor (WebAssets)
  ===========================================
  `);
});
