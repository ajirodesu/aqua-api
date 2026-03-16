// horny.mjs
import { createCanvas, loadImage } from '@napi-rs/canvas';

export const meta = {
  name: 'horny',
  desc: 'Generate a horny image with an avatar',
  method: ['get', 'post'],
  category: 'canvas',
  params: [
    { name: 'avatar', desc: 'URL of the avatar image', example: 'https://raw.githubusercontent.com/lanceajiro/Storage/refs/heads/main/1756728735205.jpg', required: true }
  ]
};

export async function onStart({ req, res }) {
  let avatar;
  if (req.method === 'POST') {
    ({ avatar } = req.body);
  } else {
    ({ avatar } = req.query);
  }
  if (!avatar) {
    return res.status(400).json({ error: 'Missing required parameter: avatar' });
  }
  try {
    const canvas = createCanvas(500, 468);
    const ctx = canvas.getContext('2d');

    const bgUrl = 'https://raw.githubusercontent.com/Zaxerion/databased/refs/heads/main/asset/Horny.jpg';
    const background = await loadImage(bgUrl);
    ctx.drawImage(background, 0, 0, 500, 468);

    ctx.save();
    ctx.beginPath();
    ctx.rotate(-22 * Math.PI / 180);
    const avatarImage = await loadImage(avatar);
    ctx.strokeStyle = '#450d00';
    ctx.lineWidth = 4;
    ctx.drawImage(avatarImage, -27, 210, 126, 126);
    ctx.strokeRect(-27, 210, 126, 126);
    ctx.restore();

    const bufferArr = await canvas.encode('png');
    res.type('image/png').send(Buffer.from(bufferArr));
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}