// welcome-pro.mjs
import { createCanvas, loadImage } from '@napi-rs/canvas';

export const meta = {
  name: 'welcome-pro',
  desc: 'Generate a high-end, glassmorphic welcome image with procedural backgrounds and squircle avatars.',
  method: ['get', 'post'],
  category: 'canvas',
  params: [
    { name: 'username', desc: "The new member's username", example: 'DesignGod', required: true },
    { name: 'avatar_url', desc: 'User avatar URL', example: 'https://github.com/ghost.png', required: true },
    { name: 'title', desc: 'Main title text', example: 'WELCOME', required: false },
    { name: 'subtitle', desc: 'Subtitle (e.g. Server Name)', example: 'TO THE DESIGN LAB', required: false },
    { name: 'footer', desc: 'Footer text (e.g. Member count)', example: 'Member #4,291', required: false },
    { name: 'theme', desc: 'Accent color (hex)', example: '#6366f1', required: false },
    { name: 'bg_image', desc: 'Optional custom background URL', example: '', required: false }
  ]
};

// Geometry helpers
function createSquirclePath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawProceduralBackground(ctx, width, height, accentColor) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#020617');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const gridSize = 40;

  ctx.beginPath();
  for (let x = 0; x <= width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  const glow1 = ctx.createRadialGradient(0, 0, 0, 0, 0, 600);
  glow1.addColorStop(0, accentColor + '40');
  glow1.addColorStop(1, 'transparent');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(width, height, 0, width, height, 500);
  glow2.addColorStop(0, '#ffffff10');
  glow2.addColorStop(1, 'transparent');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);
}

export async function onStart({ req, res }) {
  const input = req.method === 'POST' ? req.body : req.query;

  const config = {
    username: (input.username || 'New Member').toUpperCase(),
    avatar: input.avatar_url || input.avatar,
    title: (input.title || 'WELCOME').toUpperCase(),
    subtitle: (input.subtitle || 'TO THE SERVER').toUpperCase(),
    footer: (input.footer || 'You are the newest member').toUpperCase(),
    theme: input.theme || '#6366f1',
    bgImage: input.bg_image || null
  };

  const width = 1024;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (config.bgImage) {
    try {
      const bg = await loadImage(config.bgImage);
      const ratio = Math.max(width / bg.width, height / bg.height);
      const centerShift_x = (width - bg.width * ratio) / 2;
      const centerShift_y = (height - bg.height * ratio) / 2;
      ctx.drawImage(bg, 0, 0, bg.width, bg.height, centerShift_x, centerShift_y, bg.width * ratio, bg.height * ratio);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, width, height);
    } catch (e) {
      drawProceduralBackground(ctx, width, height, config.theme);
    }
  } else {
    drawProceduralBackground(ctx, width, height, config.theme);
  }

  // Glass card
  const cardW = 900;
  const cardH = 350;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2;
  const cardR = 24;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;

  createSquirclePath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.fillStyle = 'rgba(20, 20, 25, 0.6)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  createSquirclePath(ctx, cardX, cardY, cardW, cardH, cardR);
  ctx.lineWidth = 1.5;
  const borderGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
  borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
  borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
  ctx.strokeStyle = borderGrad;
  ctx.stroke();
  ctx.restore();

  // Avatar
  const avatarSize = 220;
  const avatarX = cardX + 60;
  const avatarY = cardY + (cardH - avatarSize) / 2;

  try {
    let avatarImg;
    if (config.avatar) {
      avatarImg = await loadImage(config.avatar);
    } else {
      const p = createCanvas(avatarSize, avatarSize);
      const px = p.getContext('2d');
      px.fillStyle = '#333';
      px.fillRect(0,0,avatarSize, avatarSize);
      avatarImg = p;
    }

    ctx.save();
    ctx.shadowColor = config.theme;
    ctx.shadowBlur = 30;

    createSquirclePath(ctx, avatarX, avatarY, avatarSize, avatarSize, 40);
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    ctx.save();
    createSquirclePath(ctx, avatarX, avatarY, avatarSize, avatarSize, 40);
    ctx.lineWidth = 4;
    ctx.strokeStyle = config.theme;
    ctx.stroke();
    ctx.restore();

  } catch (e) {
    // ignore avatar load error
  }

  // Text
  const textX = avatarX + avatarSize + 50;
  const centerY = height / 2;

  ctx.font = 'bold 18px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillStyle = config.theme;
  ctx.letterSpacing = "4px";
  ctx.fillText(config.subtitle, textX, centerY - 55);

  ctx.font = '900 64px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.letterSpacing = "0px";
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillText(config.title, textX, centerY + 10);

  ctx.shadowColor = 'transparent';
  ctx.font = '40px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(config.username, textX, centerY + 60);

  ctx.font = '16px "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#94a3b8';

  const footerText = config.footer;
  const footerMetrics = ctx.measureText(footerText);
  const pillPadding = 12;
  const pillW = footerMetrics.width + (pillPadding * 2);
  const pillH = 28;
  const pillX = textX;
  const pillY = centerY + 85;

  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
  } else {
    ctx.beginPath();
    const r = 14;
    ctx.moveTo(pillX + r, pillY);
    ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
    ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r);
    ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
    ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
  }

  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(footerText, pillX + pillPadding, pillY + 20);

  // Decorations
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  const crossSize = 6;
  const decorations = [
    { x: cardX + 20, y: cardY + 20 },
    { x: cardX + cardW - 20, y: cardY + 20 },
    { x: cardX + 20, y: cardY + cardH - 20 },
    { x: cardX + cardW - 20, y: cardY + cardH - 20 }
  ];

  decorations.forEach(d => {
    ctx.fillRect(d.x - crossSize/2, d.y - 1, crossSize, 2);
    ctx.fillRect(d.x - 1, d.y - crossSize/2, 2, crossSize);
  });

  res.setHeader('Content-Type', 'image/png');
  res.send(canvas.toBuffer('image/png'));
}