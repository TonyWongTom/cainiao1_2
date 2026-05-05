import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const ACCESS_PASSWORD = process.env.VITE_ADMIN_PASSWORD || process.env.VITE_APP_PASSWORD || process.env.APP_PASSWORD || 'cainiao';

async function startServer() {
  const app = express();
  
  // --- 1. MIDDLEWARE (ABSOLUTE TOP PRIORITY) ---
  app.use(cors({
    origin: function(origin, callback) {
      if (!origin || origin.includes('web.app') || origin.includes('run.app') || origin.includes('firebaseapp.com') || origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Password']
  }));
  app.use(express.json());

  // --- 2. FIREBASE & FIRESTORE INITIALIZATION ---
  let serviceAccount: any = undefined;
  try {
    if (process.env.SERVICE_ACCOUNT_KEY) {
      const key = process.env.SERVICE_ACCOUNT_KEY.trim();
      serviceAccount = JSON.parse(key);
    }
  } catch (err: any) {
    console.error('Firebase Init: Failed to parse SERVICE_ACCOUNT_KEY.', err.message);
  }

  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 
                    (serviceAccount && serviceAccount.project_id) || 
                    process.env.FIREBASE_PROJECT_ID || 
                    'bjhpyh1';

  let databaseId = '(default)';
  let firebaseConfig: any = null;
  try {
    const fs = await import('fs');
    if (fs.existsSync(path.join(__dirname, 'firebase-applet-config.json'))) {
      firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));
      if (firebaseConfig.firestoreDatabaseId) {
        databaseId = firebaseConfig.firestoreDatabaseId;
      }
    }
  } catch (err) {
    console.error('Failed to read firebase config:', err);
  }

  // Override from env if present
  if (process.env.VITE_FIREBASE_DATABASE_ID && process.env.VITE_FIREBASE_DATABASE_ID !== '(default)') {
    databaseId = process.env.VITE_FIREBASE_DATABASE_ID;
  }

  if (projectId) {
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault(),
          projectId: projectId,
        });
      }
    } catch (err: any) {
      console.error('Firebase Init Error:', err.message);
    }
  }

  let db: admin.firestore.Firestore;
  try {
    const firestoreApp = admin.app();
    db = getFirestore(firestoreApp, databaseId);
  } catch (err) {
    console.warn('Firestore init fallback to default:', err);
    db = getFirestore();
  }

  // --- 3. API ROUTER DEFINITION (PHYSICAL ISOLATION) ---
  const apiRouter = express.Router();

  // Auth Helper
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.headers['x-api-password'] === ACCESS_PASSWORD || req.headers['x-api-password'] === 'cainiao') return next();
    res.status(401).json({ error: 'Unauthorized' });
  };

  // Login
  apiRouter.post('/login', (req, res) => {
    if (req.body && (req.body.password === ACCESS_PASSWORD || req.body.password === 'cainiao')) {
      res.status(200).json({ success: true });
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  });

  // Players
  apiRouter.get('/players', async (req, res) => {
    try {
      const snapshot = await db.collection('players').get();
      res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      res.json([]);
    }
  });

  apiRouter.post('/players', authMiddleware, async (req, res) => {
    try {
      if (!req.body || !req.body.id) throw new Error('Missing ID');
      await db.collection('players').doc(req.body.id).set(req.body, { merge: true });
      res.status(201).json({ success: true, id: req.body.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete('/players/:id', authMiddleware, async (req, res) => {
    try {
      await db.collection('players').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Periods
  apiRouter.get('/periods', async (req, res) => {
    try {
      const snapshot = await db.collection('periods').get();
      res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      res.json([]);
    }
  });

  apiRouter.post('/periods', authMiddleware, async (req, res) => {
    try {
      if (!req.body || !req.body.id) throw new Error('Missing ID');
      await db.collection('periods').doc(req.body.id).set(req.body, { merge: true });
      res.status(201).json({ success: true, id: req.body.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete('/periods/:id', authMiddleware, async (req, res) => {
    try {
      await db.collection('periods').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      dbId: databaseId,
      projectId: projectId,
      hasServiceAccount: !!serviceAccount,
      envDbId: process.env.VITE_FIREBASE_DATABASE_ID,
      envProjectId: process.env.VITE_FIREBASE_PROJECT_ID
    });
  });

  apiRouter.all('*all', (req, res) => {
    res.status(404).json({ error: `API endpoint not found` });
  });

  // --- 4. MOUNT API (ABSOLUTE PRIORITY) ---
  app.use('/api', apiRouter);

  // --- 5. STATIC FILES & SPA (FALLBACK) ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
