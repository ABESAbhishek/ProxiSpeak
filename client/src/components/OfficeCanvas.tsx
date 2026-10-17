
import React, { useCallback, useEffect, useRef, useState } from 'react';

type Position = {
  x: number;
  y: number;
  z: number;
};

type VirtualOfficeProps = {
  onMove: (position: Position) => void;
  devicePosition?: { x: number; y: number };
  isLocationTracking?: boolean;
};

type DemoAvatar = {
  x: number;
  y: number;
  name: string;
  color: string;
};

const WIDTH = 1000;
const HEIGHT = 560;
const HEARING_RADIUS = 115;

const DEMO_AVATARS: DemoAvatar[] = [
  { x: 0.22, y: 0.34, name: 'Alex', color: '#34d399' },
  { x: 0.78, y: 0.34, name: 'Sam', color: '#fbbf24' },
  { x: 0.25, y: 0.75, name: 'Jordan', color: '#f472b6' },
];

const VirtualOffice: React.FC<VirtualOfficeProps> = ({ onMove, devicePosition, isLocationTracking = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  const [position, setPosition] = useState({ x: 0.5, y: 0.48 });

  useEffect(() => {
    if (devicePosition) setPosition(devicePosition);
  }, [devicePosition]);

  const moveAvatar = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();

      if (!rect.width || !rect.height) return;

      const projectedX = ((clientX - rect.left) / rect.width) * WIDTH;
      const projectedY = ((clientY - rect.top) / rect.height) * HEIGHT;
      const unprojectedY = (projectedY - 35) / 0.82;
      const y = Math.max(0.12, Math.min(0.88, unprojectedY / HEIGHT));
      const x = Math.max(
        0.08,
        Math.min(0.92, (projectedX - 50 + (0.06 * unprojectedY)) / (0.9 * WIDTH))
      );

      setPosition({ x, y });

      onMove({
        x: Math.round(x * WIDTH),
        y: Math.round(y * HEIGHT),
        z: 0,
      });
    },
    [onMove]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) return;

    // A restrained oblique projection makes the plan read as a small studio
    // model while preserving a broad, easy-to-scan floor area.
    ctx.save();
    ctx.transform(0.9, 0, -0.06, 0.82, 50, 35);

    const width = WIDTH;
    const height = HEIGHT;
    const px = position.x * width;
    const py = position.y * height;

    // Warm, softly lit floor with a subtle tile grid.
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#f1e5d3');
    background.addColorStop(0.52, '#e8d8c2');
    background.addColorStop(1, '#d9c5aa');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const ambient = ctx.createRadialGradient(width * 0.5, height * 0.47, 30, width * 0.5, height * 0.47, 470);
    ambient.addColorStop(0, 'rgba(255, 250, 232, 0.56)');
    ambient.addColorStop(1, 'rgba(255, 245, 220, 0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, width, height);

    // Floorboards give the room a more tactile plan-view appearance.
    ctx.strokeStyle = 'rgba(112, 78, 52, 0.09)';
    ctx.lineWidth = 1;
    for (let y = 58; y < height; y += 42) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }
    for (let row = 0; row < 13; row += 1) {
      const y = 58 + row * 42;
      const offset = row % 2 ? 0 : 52;
      for (let x = 20 + offset; x < width; x += 104) {
        ctx.beginPath();
        ctx.moveTo(x, y - 42);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    const roundedRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      radius: number
    ) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
    };

    // Wall shadow and inner trim.
    ctx.save();
    ctx.fillStyle = 'rgba(73, 48, 30, 0.2)';
    roundedRect(17, 17, width - 34, height - 34, 17);
    ctx.fill();
    const wall = ctx.createLinearGradient(0, 18, 0, 47);
    wall.addColorStop(0, '#987455');
    wall.addColorStop(1, '#674b39');
    ctx.fillStyle = wall;
    roundedRect(20, 20, width - 40, height - 40, 15);
    ctx.fill();
    ctx.fillStyle = '#c3a989';
    roundedRect(32, 48, width - 64, height - 80, 8);
    ctx.fill();
    ctx.restore();

    // Interior floor area (clip keeps the plank texture inside the walls).
    ctx.save();
    roundedRect(32, 48, width - 64, height - 80, 8);
    ctx.clip();
    ctx.fillStyle = background;
    ctx.fillRect(32, 48, width - 64, height - 80);
    ctx.fillStyle = ambient;
    ctx.fillRect(32, 48, width - 64, height - 80);
    ctx.strokeStyle = 'rgba(172, 190, 196, 0.035)';
    for (let y = 58; y < height; y += 42) {
      ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(width - 32, y); ctx.stroke();
    }
    for (let row = 0; row < 13; row += 1) {
      const y = 58 + row * 42;
      const offset = row % 2 ? 0 : 52;
      for (let x = 32 + offset; x < width; x += 104) {
        ctx.beginPath(); ctx.moveTo(x, y - 42); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    ctx.restore();

    // Window panels along the back wall.
    for (let x = 260; x <= 680; x += 140) {
      ctx.save();
      ctx.fillStyle = '#172935';
      roundedRect(x, 21, 104, 20, 5); ctx.fill();
      const glass = ctx.createLinearGradient(x, 21, x + 104, 41);
      glass.addColorStop(0, 'rgba(99, 193, 211, 0.3)');
      glass.addColorStop(1, 'rgba(102, 150, 187, 0.1)');
      ctx.fillStyle = glass;
      roundedRect(x + 3, 23, 98, 16, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(199, 222, 226, 0.18)';
      ctx.beginPath(); ctx.moveTo(x + 52, 24); ctx.lineTo(x + 52, 38); ctx.stroke();
      ctx.restore();
    }

    // Room outline
    ctx.strokeStyle = 'rgba(102, 71, 49, 0.5)';
    ctx.lineWidth = 1.5;
    roundedRect(18, 18, width - 36, height - 36, 16);
    ctx.stroke();

    // Room label
    ctx.fillStyle = 'rgba(88, 64, 46, 0.78)';
    ctx.font = '600 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('PROXISPEAK  /  MAIN OFFICE', 34, 40);

    // Draw workstation
    const drawDesk = (x: number, y: number, label: string) => {
      ctx.save();

      // Desk shadow and soft mat.
      ctx.fillStyle = 'rgba(76, 48, 29, 0.24)';
      roundedRect(x + 5, y + 8, 120, 70, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(135, 98, 65, 0.11)';
      roundedRect(x - 14, y - 12, 148, 105, 20);
      ctx.fill();

      // Desk body
      const wood = ctx.createLinearGradient(x, y, x + 120, y + 66);
      wood.addColorStop(0, '#ae8058');
      wood.addColorStop(0.5, '#966b49');
      wood.addColorStop(1, '#77543b');
      ctx.fillStyle = wood;
      ctx.strokeStyle = '#967c62';
      ctx.lineWidth = 2;
      roundedRect(x, y, 120, 66, 12);
      ctx.fill();
      ctx.stroke();

      // A narrow front edge gives the desks a light isometric depth cue.
      ctx.fillStyle = '#634631';
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 62);
      ctx.lineTo(x + 113, y + 62);
      ctx.lineTo(x + 108, y + 71);
      ctx.lineTo(x + 13, y + 71);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 224, 178, 0.24)';
      ctx.fillRect(x + 12, y + 4, 94, 2);

      // Monitor, screen glow, and stand.
      ctx.fillStyle = '#46372f';
      roundedRect(x + 27, y + 8, 66, 38, 5);
      ctx.fill();
      const screen = ctx.createLinearGradient(x + 29, y + 10, x + 91, y + 43);
      screen.addColorStop(0, '#b8d0c2');
      screen.addColorStop(0.5, '#718d87');
      screen.addColorStop(1, '#536a66');
      ctx.fillStyle = screen;
      roundedRect(x + 30, y + 11, 60, 30, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(235, 247, 219, 0.76)';
      ctx.fillRect(x + 36, y + 16, 24, 2);
      ctx.fillRect(x + 36, y + 21, 39, 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(x + 36, y + 26, 31, 2);

      ctx.fillStyle = '#b9c8c3';
      ctx.fillRect(x + 57, y + 45, 6, 5);
      ctx.fillRect(x + 45, y + 50, 30, 3);

      // Keyboard
      ctx.fillStyle = '#59483a';
      roundedRect(x + 35, y + 55, 50, 5, 2);
      ctx.fill();

      // Desk chair.
      ctx.fillStyle = '#75604d';
      ctx.strokeStyle = '#a68a69';
      roundedRect(x + 42, y + 69, 36, 20, 8); ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#59402f';
      ctx.font = '600 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 60, y + 88);

      ctx.restore();
    };

    // Decorative plant
    const drawPlant = (x: number, y: number) => {
      ctx.save();

      ctx.fillStyle = 'rgba(57, 116, 74, 0.15)';
      ctx.beginPath();
      ctx.arc(x, y, 23, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#53694e';
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#789765';

      ctx.beginPath();
      ctx.ellipse(x - 5, y - 4, 5, 9, -0.5, 0, Math.PI * 2);
      ctx.ellipse(x + 5, y - 5, 5, 9, 0.5, 0, Math.PI * 2);
      ctx.ellipse(x, y + 4, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    // Draw avatar
    const drawAvatar = (
      x: number,
      y: number,
      name: string,
      color: string,
      isLocal = false
    ) => {
      ctx.save();

      // Glow
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 38);
      glow.addColorStop(0, `${color}38`);
      glow.addColorStop(1, `${color}00`);

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 38, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring
      ctx.strokeStyle = isLocal ? '#a94e37' : `${color}cc`;
      ctx.lineWidth = isLocal ? 2.5 : 2;
      ctx.beginPath();
      ctx.arc(x, y, isLocal ? 24 : 23, 0, Math.PI * 2);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y + 8, 16, 0, Math.PI * 2);
      ctx.fill();

      // Shirt detail
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x, y + 18);
      ctx.stroke();

      // Head
      ctx.fillStyle = '#f4c9a5';
      ctx.beginPath();
      ctx.arc(x, y - 12, 11, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#59483b';
      ctx.beginPath();
      ctx.arc(x, y - 16, 10, Math.PI, Math.PI * 2);
      ctx.fill();

      // Name label
      ctx.font = '600 12px sans-serif';
      const textWidth = ctx.measureText(name).width;
      const labelWidth = textWidth + 20;
      const labelY = y + 37;

      ctx.fillStyle = '#fff9ef';
      ctx.strokeStyle = isLocal ? '#a94e37' : `${color}90`;
      ctx.lineWidth = 1.5;

      roundedRect(x - labelWidth / 2, labelY, labelWidth, 25, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#49372c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, x, labelY + 12.5);

      ctx.restore();
    };

    // Lounge seating in the shared central area.
    ctx.save();
    ctx.fillStyle = 'rgba(82, 55, 36, 0.2)';
    roundedRect(width / 2 - 118, height / 2 - 39, 236, 82, 22); ctx.fill();
    ctx.fillStyle = '#9b7562';
    ctx.strokeStyle = '#bd9d82';
    ctx.lineWidth = 1.5;
    roundedRect(width / 2 - 112, height / 2 - 45, 224, 72, 20); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b58b72';
    roundedRect(width / 2 - 94, height / 2 - 32, 188, 46, 14); ctx.fill();
    ctx.fillStyle = '#d5b48f';
    roundedRect(width / 2 - 84, height / 2 - 25, 34, 30, 9); ctx.fill();
    roundedRect(width / 2 + 50, height / 2 - 25, 34, 30, 9); ctx.fill();
    ctx.restore();

    // Furniture layout
    drawDesk(65, 75, 'Design');
    drawDesk(width - 185, 75, 'Engineering');
    drawDesk(65, height - 145, 'Meeting');
    drawDesk(width - 185, height - 145, 'Workspace');

    drawPlant(43, 48);
    drawPlant(width - 43, 48);
    drawPlant(43, height - 43);
    drawPlant(width - 43, height - 43);

    // Meeting zone
    ctx.save();
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;

    roundedRect(width / 2 - 75, height / 2 + 65, 150, 48, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MEETING ZONE', width / 2, height / 2 + 89);
    ctx.restore();

    // Hearing radius (visual indicator only)
    ctx.save();
    ctx.fillStyle = 'rgba(201, 110, 81, 0.12)';
    ctx.strokeStyle = 'rgba(169, 78, 55, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, HEARING_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Demo teammates (visual placeholders, not live server users)
    DEMO_AVATARS.forEach((avatar) => {
      drawAvatar(
        avatar.x * width,
        avatar.y * height,
        avatar.name,
        avatar.color
      );
    });

    // Local player
    drawAvatar(px, py, 'You', '#c96e51', true);
    ctx.restore();
  }, [position]);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (isLocationTracking) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveAvatar(event.clientX, event.clientY);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!draggingRef.current || isLocationTracking) return;
    moveAvatar(event.clientX, event.clientY);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    draggingRef.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="office-canvas-frame overflow-hidden rounded-xl border border-white/[0.06] bg-[#0b1220]">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          aria-label={isLocationTracking ? 'Virtual office. Your avatar follows your device location.' : 'Virtual office. Drag your avatar to change your position.'}
          className={`office-canvas block w-full touch-none ${isLocationTracking ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-indigo-400" />
          {isLocationTracking ? 'Device position' : 'Your position'}
        </div>

        <p className="font-mono text-[11px] text-slate-500">
          X: {Math.round(position.x * WIDTH)} · Y: {Math.round(position.y * HEIGHT)}
        </p>
      </div>
    </div>
  );
};

export default VirtualOffice;
