
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve os arquivos estáticos da pasta 'dist' (gerada pelo comando npm run build)
app.use(express.static(path.join(__dirname, 'dist')));

// Redireciona qualquer rota para o index.html (essencial para SPAs)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Portal Fácil rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
});
