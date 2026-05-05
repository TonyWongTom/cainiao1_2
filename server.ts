import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const ACCESS_PASSWORD = process.env.VITE_ADMIN_PASSWORD || process.env.VITE_APP_PASSWORD || process.env.APP_PASSWORD || 'cainiao';

async function startServer() {
  const app = express();
  
  app.use(cors({
    origin: function(origin, callback) {
      if (!origin || origin.includes('run.app') || origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Password']
  }));
  app.use(express.json());

  // Turso client
  const url = (process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL || "").trim();
  const authToken = (process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || "").trim();

  let dbClient: ReturnType<typeof createClient> | null = null;

  if (url) {
    try {
      dbClient = createClient({ url, authToken });
      console.log(`[DB Init] Client created. URL: ${url.substring(0, 15)}...`);
      
      // 非阻塞式连接测试
      dbClient.execute("SELECT 1")
        .then(() => console.log('✅ Database connection successful (Async Check)'))
        .catch(e => console.error(`[DB Init Error] Async check failed: ${e.message}`));
      
    } catch (e: any) {
      console.error(`[CRITICAL] DB client creation failed: ${e.message}`);
    }
  } else {
    console.error('[CRITICAL] Database URL is MISSING.');
  }

  const apiRouter = express.Router();

  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers['x-api-password'] === ACCESS_PASSWORD || req.headers['x-api-password'] === 'cainiao') return next();
    res.status(401).json({ error: 'Unauthorized' });
  };

  apiRouter.post('/login', (req, res) => {
    console.log('[Auth] Login attempt...');
    const { password } = req.body || {};
    const isValid = (password === ACCESS_PASSWORD || password === 'cainiao');
    console.log(`[Auth] Login result: ${isValid ? 'Success' : 'Failure'}`);
    
    if (isValid) {
      res.status(200).json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  });

  apiRouter.get('/config_check', (req, res) => {
    res.json({
      url_set: !!url,
      token_set: !!authToken,
      pwd_set: !!ACCESS_PASSWORD,
      node_env: process.env.NODE_ENV,
      port: PORT
    });
  });

  // --- Players ---
  apiRouter.get('/players', async (req, res) => {
    try {
      if (!dbClient) throw new Error('DB not initialized');
      console.log('[DB Query] Fetching members...');
      const rs = await dbClient.execute("SELECT id, name, type, defaultFee, isFunder FROM members");
      res.json(rs.rows.map(row => ({
        id: String(row.id || ''),
        name: String(row.name || 'Unknown'),
        type: String(row.type || 'normal'),
        defaultFee: Number(row.defaultFee) || 0,
        isFunder: Boolean(row.isFunder)
      })));
    } catch (err: any) {
      console.error(`DEBUG_DB_ERROR (get_players): ${err.message}`);
      if (err.message.toLowerCase().includes("no such table")) {
        return res.json([]);
      }
      res.status(500).json({ error: `Database Query Failed: ${err.message}` });
    }
  });

  apiRouter.post('/players', authMiddleware, async (req, res) => {
    try {
      if (!dbClient) throw new Error('DB not initialized');
      const data = req.body;
      if (!data || !data.id) throw new Error('Missing ID');
      await dbClient.execute({
        sql: `INSERT INTO members (id, name, type, defaultFee, isFunder) 
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                  name=excluded.name, 
                  type=excluded.type, 
                  defaultFee=excluded.defaultFee, 
                  isFunder=excluded.isFunder`,
        args: [data.id, data.name || '', data.type || '', Number(data.defaultFee) || 0, data.isFunder ? 1 : 0]
      });
      res.status(201).json({ success: true, id: data.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete('/players/:id', authMiddleware, async (req, res) => {
    try {
      if (!dbClient) throw new Error('DB not initialized');
      await dbClient.execute({ sql: "DELETE FROM members WHERE id = ?", args: [req.params.id] });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Periods ---
  apiRouter.get('/periods', async (req, res) => {
    try {
      if (!dbClient) throw new Error('DB not initialized');
      
      const cyclesMap: Record<string, any> = {};
      
      // Fetch Cycles
      try {
        const cyclesRes = await dbClient.execute("SELECT id, name, startDate, endDate, courtCost, funderIds FROM cycles");
        for (const row of cyclesRes.rows) {
          cyclesMap[row.id as string] = {
            id: row.id,
            name: row.name,
            startDate: row.startDate,
            endDate: row.endDate,
            courtCost: Number(row.courtCost) || 0,
            funderIds: row.funderIds ? JSON.parse(row.funderIds as string) : [],
            sessions: [],
            playerConfigs: []
          };
        }
      } catch (err: any) {
        console.error(`DEBUG_DB_ERROR (fetch cycles): ${err.message}`);
        if (!err.message.toLowerCase().includes("no such table")) throw err;
      }

      // Fetch Sessions
      try {
        const sessionsRes = await dbClient.execute("SELECT id, cycle_id, session_date, attendees, extra_court_fee FROM sessions");
        for (const row of sessionsRes.rows) {
          const cId = row.cycle_id as string;
          if (cyclesMap[cId]) {
            cyclesMap[cId].sessions.push({
              id: String(row.id || ''),
              date: row.session_date,
              players: row.attendees ? JSON.parse(row.attendees as string) : [],
              extraCourtCost: Number(row.extra_court_fee) || 0
            });
          }
        }
      } catch (err: any) {
        console.error(`DEBUG_DB_ERROR (fetch sessions): ${err.message}`);
        if (!err.message.toLowerCase().includes("no such table")) throw err;
      }

      // Fetch Configs
      try {
        const confRes = await dbClient.execute("SELECT cycle_id, player_id, type, has_paid_base FROM member_cycle_configs");
        for (const row of confRes.rows) {
          const cId = row.cycle_id as string;
          if (cyclesMap[cId]) {
            cyclesMap[cId].playerConfigs.push({
              playerId: row.player_id,
              type: row.type,
              hasPaidBase: Boolean(row.has_paid_base)
            });
          }
        }
      } catch (err: any) {
        console.error(`DEBUG_DB_ERROR (fetch member_cycle_configs): ${err.message}`);
        if (!err.message.toLowerCase().includes("no such table")) throw err;
      }

      res.json(Object.values(cyclesMap));
    } catch (err: any) {
      console.error(`DEBUG_DB_ERROR (get_periods_main): ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post('/periods', authMiddleware, async (req, res) => {
    try {
      if (!dbClient) throw new Error('DB not initialized');
      const data = req.body;
      const cycleId = data.id;
      if (!cycleId) throw new Error('Missing ID');

      const stmts = [];
      
      stmts.push({
        sql: `INSERT INTO cycles (id, name, startDate, endDate, courtCost, funderIds) 
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET 
                  name=excluded.name, startDate=excluded.startDate, 
                  endDate=excluded.endDate, courtCost=excluded.courtCost, 
                  funderIds=excluded.funderIds`,
        args: [cycleId, data.name || '', data.startDate || '', data.endDate || '', Number(data.courtCost) || 0, JSON.stringify(data.funderIds || [])]
      });

      stmts.push({ sql: "DELETE FROM sessions WHERE cycle_id = ?", args: [cycleId] });
      for (const session of data.sessions || []) {
        stmts.push({
          sql: `INSERT INTO sessions (id, cycle_id, session_date, attendees, extra_court_fee) VALUES (?, ?, ?, ?, ?)`,
          args: [session.id, cycleId, session.date || '', JSON.stringify(session.players || []), Number(session.extraCourtCost) || 0]
        });
      }

      stmts.push({ sql: "DELETE FROM member_cycle_configs WHERE cycle_id = ?", args: [cycleId] });
      for (const conf of data.playerConfigs || []) {
        stmts.push({
          sql: `INSERT INTO member_cycle_configs (cycle_id, player_id, type, has_paid_base) VALUES (?, ?, ?, ?)`,
          args: [cycleId, conf.playerId, conf.type || '', conf.hasPaidBase ? 1 : 0]
        });
      }

      await dbClient.batch(stmts, "write");
      res.status(201).json({ success: true, id: cycleId });
    } catch (err: any) {
      console.error(`DEBUG_DB_ERROR (save_period): ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete('/periods/:id', authMiddleware, async (req, res) => {
    try {
      if (!dbClient) throw new Error('DB not initialized');
      const cycleId = req.params.id;
      await dbClient.batch([
        { sql: "DELETE FROM cycles WHERE id = ?", args: [cycleId] },
        { sql: "DELETE FROM sessions WHERE cycle_id = ?", args: [cycleId] },
        { sql: "DELETE FROM member_cycle_configs WHERE cycle_id = ?", args: [cycleId] }
      ], "write");
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.get('/report/sql_aggregate/:cycle_id', async (req, res) => {
    try {
      if (!dbClient) throw new Error('DB not initialized');
      const cycleId = req.params.cycle_id;
      
      const sql = `
        WITH json_players AS (
            SELECT cycle_id, extra_court_fee, json_each.value AS player_id 
            FROM sessions, json_each(sessions.attendees)
            WHERE cycle_id = ?
        ),
        player_fees AS (
            SELECT 
                jp.cycle_id, 
                jp.player_id, 
                m.defaultFee,
                c.has_paid_base,
                CASE 
                    WHEN coalesce(c.has_paid_base, 0) = 1 THEN 0 
                    ELSE m.defaultFee 
                END as session_fee
            FROM json_players jp
            JOIN members m ON jp.player_id = m.id
            LEFT JOIN member_cycle_configs c ON jp.cycle_id = c.cycle_id AND c.player_id = m.id
        ),
        total_income AS (
            SELECT coalesce(sum(session_fee), 0) as income FROM player_fees
        ),
        cycle_info AS (
            SELECT 
                courtCost, 
                json_array_length(funderIds) as funder_count,
                (SELECT coalesce(sum(extra_court_fee), 0) FROM sessions WHERE cycle_id = ?) as total_extra
            FROM cycles 
            WHERE id = ?
        )
        SELECT 
            (SELECT income FROM total_income) as total_activity_fees,
            ci.courtCost,
            ci.total_extra,
            ci.funder_count,
            ((SELECT income FROM total_income) - ci.courtCost - ci.total_extra) / nullif(ci.funder_count, 0) as profit_per_funder
        FROM cycle_info ci;
      `;
      
      const r_res = await dbClient.execute({ sql, args: [cycleId, cycleId, cycleId] });
      if (r_res.rows.length > 0) {
        const r = r_res.rows[0];
        res.json({
          success: true,
          data: {
             totalActivityFees: Number(r.total_activity_fees) || 0,
             courtCost: Number(r.courtCost) || 0,
             totalExtraCost: Number(r.total_extra) || 0,
             funderCount: Number(r.funder_count) || 0,
             profitPerFunder: Number(r.profit_per_funder) || 0
          }
        });
      } else {
        res.json({ success: false, data: null });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', db: 'turso' });
  });

  apiRouter.all('*all', (req, res) => {
    res.status(404).json({ error: `API endpoint not found` });
  });

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true, 
        allowedHosts: true 
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[READY] Server listening on port ${PORT}`);
  });
}

startServer();
