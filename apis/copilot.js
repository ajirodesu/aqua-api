// copilot.js
import WebSocket from 'ws';
import axios from 'axios';

export const meta = {
  name: 'copilot',
  desc: 'chat with Microsoft Copilot AI via WebSocket connection',
  method: ['get', 'post'],
  category: 'AI',
  params: [
    {
      name: 'message',
      desc: 'The user message or query to send to Copilot AI',
      example: 'Hello, how are you?',
      required: true
    },
    {
      name: 'model',
      desc: 'The AI model (default, think-deeper, gpt-5)',
      example: 'default',
      required: false,
      options: ['default', 'think-deeper', 'gpt-5']
    }
  ]
};

export async function onStart({ req, res }) {
  let message, model;
  if (req.method === 'POST') {
    ({ message, model } = req.body || {});
  } else {
    ({ message, model } = req.query || {});
  }
  model = model || 'default';

  if (!message) {
    return res.status(400).json({
      error: 'Missing required parameter: message'
    });
  }

  // guard so we don't call res.* multiple times
  let responded = false;
  let timer = null;

  const safeRespond = (fn) => {
    if (!responded) {
      responded = true;
      // clear timeout if any
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        fn();
      } catch (err) {
        // ignore errors from response sending
      }
    }
  };

  try {
    // Basic headers (use standard casing)
    const headers = {
      Origin: 'https://copilot.microsoft.com',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36'
    };

    const models = {
      default: 'chat',
      'think-deeper': 'reasoning',
      'gpt-5': 'smart'
    };

    if (!models[model]) {
      return res.status(400).json({
        error: `Invalid model. Available: ${Object.keys(models).join(', ')}`
      });
    }

    // Create conversation (some endpoints expect a JSON body; using {} is safer than null)
    const convResp = await axios.post(
      'https://copilot.microsoft.com/c/api/conversations',
      {},
      { headers }
    );

    const conversationId = convResp && convResp.data && convResp.data.id;
    if (!conversationId) {
      return res.status(500).json({ error: 'Failed to create conversation' });
    }

    const wsUrl =
      'wss://copilot.microsoft.com/c/api/chat?api-version=2&features=-,ncedge,edgepagecontext&setflight=-,ncedge,edgepagecontext&ncedge=1';
    const ws = new WebSocket(wsUrl, { headers });

    const response = { text: '', citations: [] };

    // ensure we close ws once we finish or on error
    const safeClose = () => {
      try {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      } catch (e) {
        // ignore
      }
    };

    ws.on('open', () => {
      try {
        // set options
        ws.send(
          JSON.stringify({
            event: 'setOptions',
            supportedFeatures: ['partial-generated-images'],
            supportedCards: [
              'weather',
              'local',
              'image',
              'sports',
              'video',
              'ads',
              'safetyHelpline',
              'quiz',
              'finance',
              'recipe'
            ],
            ads: {
              supportedTypes: [
                'text',
                'product',
                'multimedia',
                'tourActivity',
                'propertyPromotion'
              ]
            }
          })
        );

        // send the user message
        ws.send(
          JSON.stringify({
            event: 'send',
            mode: models[model],
            conversationId,
            content: [{ type: 'text', text: message }],
            context: {}
          })
        );
      } catch (err) {
        // If sending fails immediately, return an error
        safeRespond(() =>
          res.status(500).json({ error: 'Failed to send message over WebSocket' })
        );
        safeClose();
      }
    });

    // Some servers send multiple JSON msgs in one chunk or newline-delimited.
    const handleChunk = (data) => {
      const raw = data.toString();
      // handle NDJSON or multiple JSON objects separated by newlines
      const parts = raw.split(/\r?\n/).filter(Boolean);
      for (const part of parts) {
        try {
          const parsed = JSON.parse(part);
          switch (parsed.event) {
            case 'appendText':
              response.text += parsed.text || '';
              break;

            case 'citation':
              response.citations.push({
                title: parsed.title,
                icon: parsed.iconUrl,
                url: parsed.url
              });
              break;

            case 'done':
              safeRespond(() =>
                res.json({ answer: response.text, citations: response.citations })
              );
              safeClose();
              break;

            case 'error':
              safeRespond(() =>
                res.status(500).json({ error: parsed.message || 'WebSocket error event' })
              );
              safeClose();
              break;

            default:
            // ignore unknown events
          }
        } catch (err) {
          // ignore non-JSON parts
        }
      }
    };

    ws.on('message', handleChunk);

    ws.on('error', (err) => {
      safeRespond(() => res.status(500).json({ error: err?.message || 'WebSocket error' }));
      safeClose();
    });

    ws.on('close', () => {
      // if ws closed without 'done' event, ensure we respond
      if (!responded) {
        safeRespond(() => res.json({ answer: response.text || '', citations: response.citations }));
      }
    });

    // Optional: set a hard timeout to avoid hanging requests (e.g., 30s)
    const TIMEOUT_MS = 30000;
    timer = setTimeout(() => {
      if (!responded) {
        safeRespond(() => res.status(504).json({ error: 'Timeout waiting for copilot response' }));
      }
      safeClose();
    }, TIMEOUT_MS);
  } catch (error) {
    return res.status(500).json({
      error: (error && error.message) || 'Internal server error'
    });
  }
}