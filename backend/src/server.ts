import express from 'express';
import path from 'path';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { initWebSocket } from './websocket';
import router from './routes';
import { openApiDocument } from './openapi';

const app = express();
const httpServer = createServer(app);

app.get('/docs', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MTG Tournament Manager API Docs</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      body { margin: 0; background: #f8fafc; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
      });
    </script>
  </body>
</html>`);
});

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  }),
);
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

initWebSocket(httpServer);

app.get('/openapi.json', (_req, res) => res.json(openApiDocument));
app.use('/api', router);
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = parseInt(process.env.PORT ?? '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});

export default app;
