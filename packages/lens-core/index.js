// @lisa/lens-core - Local daemon for LISA Lens
// Placeholder - implementation pending

import express from 'express';
import cors from 'cors';
import { matchesWatchFilter, buildEvidencePack } from '@lisa/lens-shared';

const app = express();
const PORT = process.env.LENS_PORT || 3001;
const UPSTREAM_STREAM = process.env.UPSTREAM_STREAM || 'http://localhost:3000/stream';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory fact store (recent signals)
const factStore = {
  signals: [],
  capacity: 500
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    upstreamStream: UPSTREAM_STREAM,
    signalsInStore: factStore.signals.length 
  });
});

// Answer endpoint (verified question answering)
app.post('/lens/answer', async (req, res) => {
  const { query, mode = 'assist' } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'query required' });
  }
  
  // TODO: Match query against fact store
  // TODO: Build evidence pack
  // TODO: Route to upstream AI provider
  // TODO: Attach verification overlay
  
  res.json({
    query,
    answer: 'Placeholder response',
    evidencePack: buildEvidencePack([], query),
    mode
  });
});

// Stream endpoint (filtered SSE)
app.get('/lens/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // TODO: Subscribe to upstream SSE
  // TODO: Filter signals
  // TODO: Forward to client
  
  res.write('event: hello\n');
  res.write('data: {"message":"LISA Lens stream (placeholder)"}\n\n');
});

// V1 proxy (backwards compatibility)
app.all('/v1/*', (req, res) => {
  // TODO: Proxy to http://localhost:3000/v1/*
  res.status(501).json({ error: 'V1 proxy not implemented yet' });
});

// Start server
app.listen(PORT, () => {
  console.log(`LISA Lens daemon listening on http://localhost:${PORT}`);
  console.log(`Upstream stream: ${UPSTREAM_STREAM}`);
  console.log(`Fact store capacity: ${factStore.capacity}`);
});
