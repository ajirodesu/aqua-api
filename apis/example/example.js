// apis/Example/example.js
// ← Place this file exactly here (inside apis/)

export const meta = {
  name: 'example',
  desc: 'A simple example API that echoes back the input text with a greeting',
  method: ['get', 'post'],
  category: 'example',
  params: [
    {
      name: 'text',
      desc: 'Input your text here',
      example: 'Hello, world!',
      required: true
    }
  ]
};

export async function onStart({ req, res }) {
  let text;
  if (req.method === 'POST') {
    ({ text } = req.body);
  } else {
    ({ text } = req.query);
  }

  if (!text) {
    return res.status(400).json({
      error: 'Missing required parameter: text'
    });
  }

  try {
    const greeting = `Hello, ${text}! This is an example response.`;
    return res.json({
      message: greeting
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
}