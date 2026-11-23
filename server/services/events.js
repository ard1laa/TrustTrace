// Server-Sent Events hub. Every write to the database publishes a lightweight
// "something changed" event; web and mobile clients refetch on receipt.

const clients = new Set();
let revision = Date.now();

export function currentRevision() {
  return revision;
}

export function publishChange(topics = ['data']) {
  revision = Date.now();
  const message = `event: change\ndata: ${JSON.stringify({ revision, topics })}\n\n`;
  for (const res of clients) {
    try {
      res.write(message);
    } catch {
      clients.delete(res);
    }
  }
}

export function sseHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ revision })}\n\n`);
  clients.add(res);

  // Keeps proxies and mobile radios from dropping an idle connection.
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}
