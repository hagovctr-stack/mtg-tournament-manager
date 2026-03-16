import express from "express";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import { initWebSocket } from "./websocket";
import router from "./routes";

const app = express();
const httpServer = createServer(app);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  methods: ["GET", "POST", "PATCH", "DELETE"],
  credentials: true,
}));
app.use(express.json());

initWebSocket(httpServer);

app.use("/api", router);
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = parseInt(process.env.PORT ?? "3001", 10);
httpServer.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});

export default app;
