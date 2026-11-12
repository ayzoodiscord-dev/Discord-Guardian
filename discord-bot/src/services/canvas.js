import { createCanvas, loadImage } from "@napi-rs/canvas";

const WIDTH = 1200;
const HEIGHT = 440;

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawCloud(ctx, x, y, scale, opacity = 0.7) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#f3fbff";
  for (const [dx, dy, radius] of [
    [0, 9, 34],
    [37, 0, 42],
    [77, 12, 31],
    [43, 23, 45],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx * scale, y + dy * scale, radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLandscape(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#49a8ef");
  sky.addColorStop(0.62, "#a4d8fb");
  sky.addColorStop(1, "#eaf8ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const sun = ctx.createRadialGradient(830, 95, 8, 830, 95, 430);
  sun.addColorStop(0, "rgba(255,255,255,0.48)");
  sun.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(400, 0, 800, 360);

  drawCloud(ctx, 140, 85, 1.35, 0.75);
  drawCloud(ctx, 470, 42, 0.8, 0.68);
  drawCloud(ctx, 860, 100, 1.15, 0.6);
  drawCloud(ctx, 1070, 30, 0.72, 0.72);

  ctx.fillStyle = "#58a8dc";
  ctx.beginPath();
  ctx.moveTo(0, 286);
  ctx.bezierCurveTo(180, 230, 280, 288, 460, 260);
  ctx.bezierCurveTo(650, 230, 780, 286, 960, 252);
  ctx.bezierCurveTo(1070, 235, 1135, 247, WIDTH, 226);
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2e83bd";
  ctx.beginPath();
  ctx.moveTo(0, 340);
  ctx.bezierCurveTo(200, 280, 330, 350, 510, 310);
  ctx.bezierCurveTo(730, 276, 860, 350, WIDTH, 288);
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(213,242,255,0.44)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 55; i += 1) {
    const x = (i * 47) % WIDTH;
    const baseY = 362 + ((i * 19) % 78);
    ctx.beginPath();
    ctx.moveTo(x, HEIGHT + 8);
    ctx.quadraticCurveTo(x - 14, baseY - 30, x + 8, baseY - 70 - (i % 3) * 12);
    ctx.stroke();
  }
}

async function drawBase() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  drawLandscape(ctx);

  const shade = ctx.createLinearGradient(0, 0, WIDTH, 0);
  shade.addColorStop(0, "rgba(9,43,78,0.56)");
  shade.addColorStop(0.55, "rgba(9,43,78,0.12)");
  shade.addColorStop(1, "rgba(9,43,78,0.46)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(10,51,90,0.78)";
  roundedRect(ctx, 18, 18, WIDTH - 36, HEIGHT - 36, 30);
  ctx.fill();
  return { canvas, ctx };
}

async function loadAvatar(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("L'avatar Discord n'a pas pu être chargé.");
  return loadImage(Buffer.from(await response.arrayBuffer()));
}

function drawAvatar(ctx, image, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.strokeStyle = "#9bdcff";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
  ctx.stroke();
}

function fitText(ctx, text, maxWidth) {
  let output = text;
  while (output.length > 2 && ctx.measureText(output).width > maxWidth) {
    output = `${output.slice(0, -2)}…`;
  }
  return output;
}

export async function createProfileCard({ member, progress }) {
  const { canvas, ctx } = await drawBase();
  const avatar = await loadAvatar(member.user.displayAvatarURL({ extension: "png", size: 256 }));

  drawAvatar(ctx, avatar, 166, 218, 92);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 44px Arial";
  ctx.fillText(fitText(ctx, member.displayName, 650), 310, 145);
  ctx.fillStyle = "#d1edff";
  ctx.font = "24px Arial";
  ctx.fillText(`Niveau ${progress.level}  ·  ${progress.messages} messages`, 312, 188);

  ctx.fillStyle = "rgba(234,247,255,0.24)";
  roundedRect(ctx, 310, 225, 790, 28, 14);
  ctx.fill();
  const ratio = progress.nextLevelXp > 0 ? progress.currentLevelXp / progress.nextLevelXp : 0;
  const barWidth = Math.max(8, Math.min(790, 790 * ratio));
  const bar = ctx.createLinearGradient(310, 0, 310 + barWidth, 0);
  bar.addColorStop(0, "#73c8ff");
  bar.addColorStop(1, "#dbf5ff");
  ctx.fillStyle = bar;
  roundedRect(ctx, 310, 225, barWidth, 28, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 21px Arial";
  ctx.fillText(`${progress.currentLevelXp} / ${progress.nextLevelXp} XP`, 312, 294);
  ctx.textAlign = "right";
  ctx.fillText(`${progress.xpToNextLevel} XP avant le prochain niveau`, 1095, 294);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

export async function createMemberCard({ member, heading, message }) {
  const { canvas, ctx } = await drawBase();
  const avatar = await loadAvatar(member.user.displayAvatarURL({ extension: "png", size: 256 }));
  drawAvatar(ctx, avatar, 174, 220, 96);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 48px Arial";
  ctx.fillText(fitText(ctx, heading, 790), 320, 170);
  ctx.fillStyle = "#e0f4ff";
  ctx.font = "26px Arial";
  const safeMessage = fitText(ctx, message.replace(/\s+/g, " "), 790);
  ctx.fillText(safeMessage, 322, 224);
  ctx.fillStyle = "rgba(208,237,255,0.78)";
  ctx.font = "21px Arial";
  ctx.fillText(fitText(ctx, member.guild.name, 790), 322, 276);

  return canvas.toBuffer("image/png");
}
