const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Friendly text for common HTTP status codes
const STATUS_TEXT = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  429: 'Rate Limit Exceeded',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};

app.post('/api/check', async (req, res) => {
  const { endpoint, apiKey, method } = req.body || {};

  if (!endpoint || !apiKey) {
    return res.json({
      ok: false,
      status: 0,
      statusText: 'Missing input',
      error: 'Both the endpoint and the API key are required.'
    });
  }

  // ---- Validate the URL ----
  let url;
  try {
    url = new URL(String(endpoint).trim());
  } catch {
    return res.json({
      ok: false,
      status: 0,
      statusText: 'Invalid URL',
      error: 'That is not a valid URL. It must start with https://'
    });
  }

  const host = url.hostname.toLowerCase();
  const isApilayer =
    host === 'apilayer.com' || host.endsWith('.apilayer.com') ||
    host === 'apilayer.net' || host.endsWith('.apilayer.net');

  if (url.protocol !== 'https:' || !isApilayer) {
    return res.json({
      ok: false,
      status: 0,
      statusText: 'Blocked',
      error: 'Only https:// APILayer endpoints are allowed (apilayer.com or apilayer.net).'
    });
  }

  // ---- Call APILayer from the backend (key never touches the browser) ----
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const apiRes = await fetch(url, {
      method: (method || 'GET').toUpperCase(),
      headers: {
        apikey: String(apiKey).trim(),
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timer);

    const raw = await apiRes.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw.slice(0, 3000) || '(empty response)';
    }

    res.json({
      ok: apiRes.ok,
      status: apiRes.status,
      statusText: apiRes.statusText || STATUS_TEXT[apiRes.status] || 'Unknown Status',
      data
    });
  } catch (err) {
    clearTimeout(timer);

    const timedOut = err.name === 'AbortError';
    res.json({
      ok: false,
      status: 0,
      statusText: timedOut ? 'Timeout' : 'Network Error',
      error: timedOut
        ? 'APILayer did not respond within 20 seconds.'
        : 'Could not reach APILayer. ' +
          (err.cause && err.cause.code ? `(${err.cause.code})` : err.message)
    });
  }
});

app.listen(PORT, () => {
  console.log(`APILayer API Checker running on port ${PORT}`);
});
