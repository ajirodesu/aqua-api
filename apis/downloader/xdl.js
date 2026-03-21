// xdl.mjs
import axios from "axios";

export const meta = {
  name: "X Downloader",
  desc: "Download X videos",
  method: [ "get", "post" ],
  category: "downloader",
  params: [
    {
      name: 'url',
      desc: 'The X (Twitter) video URL',
      example: 'https://x.com/user/status/123456789',
      required: true
    }
  ]
};

export async function onStart({ req, res }) {
  let url;
  if (req.method === 'POST') {
    ({ url } = req.body);
  } else {
    ({ url } = req.query);
  }

  if (!url) {
    return res.status(400).json({ error: "Missing required parameter: url" });
  }

  try {
    const response = await axios.post(
      'https://api.x-downloader.com/request',
      {
        url: url,
        type: ".mp4"
      },
      {
        headers: {
          'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
          'sec-ch-ua-platform': '"Android"',
          'Referer': 'https://x-downloader.com/',
          'sec-ch-ua-mobile': '?1',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data;
    // Validate response structure before building URLs
    if (!data || !data.host || !data.filename) {
      return res.status(500).json({ error: "Unexpected response from downloader API" });
    }

    const videoUrl = `https://${data.host}/${data.filename}`;
    const thumbnail = data.thumbnail ? `https://${data.host}/${data.thumbnail}` : null;

    // Shorten the URLs with tinyurl (optional)
    const tinyUrlResponse = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(videoUrl)}`);
    const tinyThumbResponse = thumbnail
      ? await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(thumbnail)}`)
      : null;

    return res.json({
      answer: {
        title: data.title,
        description: data.description,
        videoUrl: tinyUrlResponse.data,
        thumbnail: tinyThumbResponse ? tinyThumbResponse.data : null
      }
    });

  } catch (error) {
    return res.status(500).json({
      error: error?.message || 'Internal server error'
    });
  }
}