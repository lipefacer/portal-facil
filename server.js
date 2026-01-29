
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Escuta em todas as interfaces de rede

const distPath = path.join(__dirname, 'dist');

// Verifica se a pasta dist existe antes de iniciar
if (!fs.existsSync(distPath)) {
  console.error('❌ ERRO: Pasta "dist" não encontrada!');
  console.error('Execute "npm run build" antes de iniciar o servidor.');
}

// Serve os arquivos estáticos
app.use(express.static(distPath));

// Redireciona qualquer rota para o index.html (SPA)
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Erro: Build não encontrado. Execute npm run build no servidor.');
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n✅ Portal Fácil - Servidor Ativo`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`🌐 Rede:  http://${HOST}:${PORT}`);
  console.log(`📂 Servindo arquivos de: ${distPath}\n`);
});
