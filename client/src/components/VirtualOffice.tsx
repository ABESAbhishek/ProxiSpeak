import { useRef, useEffect, useState } from "react";
import type {
  AvatarPosition,
  JoinPayload,
} from "../types/office";
import { useRemoteAvatars } from "../hooks/useRemoteAvatars";
import { socket, socketService } from "../services/socket";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const AVATAR_RADIUS = 18;
const SPEED = 5;

type Obstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// Solid objects that the avatar must not walk through.
const OBSTACLES: Obstacle[] = [
  // Four desks, including their shadows
  { x: 65, y: 135, width: 109, height: 58 },
  { x: 225, y: 135, width: 109, height: 58 },
  { x: 65, y: 235, width: 109, height: 58 },
  { x: 225, y: 235, width: 109, height: 58 },

  // Meeting table
  { x: 490, y: 195, width: 180, height: 100 },

  // Six meeting-room chairs
  { x: 520, y: 175, width: 24, height: 17 },
  { x: 580, y: 175, width: 24, height: 17 },
  { x: 640, y: 175, width: 24, height: 17 },
  { x: 520, y: 315, width: 24, height: 17 },
  { x: 580, y: 315, width: 24, height: 17 },
  { x: 640, y: 315, width: 24, height: 17 },

  // Plants, including their leaves and pots
  { x: 359, y: 112, width: 32, height: 50 },
  { x: 704, y: 107, width: 32, height: 50 },
  { x: 704, y: 357, width: 32, height: 50 },
  { x: 39, y: 362, width: 32, height: 50 },
];

function isBlocked(x: number, y: number): boolean {
  // Approximate the complete avatar body, not just its centre.
  const avatarLeft = x - 14;
  const avatarRight = x + 14;
  const avatarTop = y - 18;
  const avatarBottom = y + 25;

  return OBSTACLES.some((obstacle) => {
    return (
      avatarLeft < obstacle.x + obstacle.width &&
      avatarRight > obstacle.x &&
      avatarTop < obstacle.y + obstacle.height &&
      avatarBottom > obstacle.y
    );
  });
}

type AvatarStyle = {
  skin: string;
  hair: string;
  shirt: string;
  hairStyle: number;
};

const SKIN_COLOURS = [
  "#F2C6A0",
  "#D9A078",
  "#B97850",
  "#8D5524",
  "#F7D7B5",
];

const HAIR_COLOURS = [
  "#30231D",
  "#593B2A",
  "#171717",
  "#9A633C",
  "#B88A42",
];

const SHIRT_COLOURS = [
  "#6366F1",
  "#0D9488",
  "#E8795A",
  "#DB2777",
  "#2563EB",
  "#7C3AED",
  "#475569",
  "#CA8A04",
];

function getAvatarStyle(userId: string): AvatarStyle {
  // Stable appearance: the same user ID always gets the same avatar.
  let hash = 0;

  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }

  const seed = Math.abs(hash);

  return {
    skin: SKIN_COLOURS[seed % SKIN_COLOURS.length],
    hair: HAIR_COLOURS[Math.floor(seed / 7) % HAIR_COLOURS.length],
    shirt: SHIRT_COLOURS[Math.floor(seed / 13) % SHIRT_COLOURS.length],
    hairStyle: Math.floor(seed / 19) % 3,
  };
}

function drawDesk(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
) {
  ctx.save();

  // Desk shadow
  ctx.fillStyle = "#D6C6B2";
  ctx.fillRect(x + 3, y + 5, 106, 53);

  // Wooden desk
  ctx.fillStyle = "#D8B58B";
  ctx.fillRect(x, y, 106, 53);
  ctx.strokeStyle = "#B58C61";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 106, 53);

  // Monitor
  ctx.fillStyle = "#334155";
  ctx.fillRect(x + 34, y + 7, 38, 25);
  ctx.fillStyle = "#93C5FD";
  ctx.fillRect(x + 38, y + 11, 30, 17);
  ctx.fillStyle = "#64748B";
  ctx.fillRect(x + 51, y + 32, 4, 5);
  ctx.fillRect(x + 44, y + 37, 18, 3);

  // Keyboard
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(x + 36, y + 42, 34, 5);

  ctx.fillStyle = "#5B4636";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.fillText(label, x + 53, y - 6);

  ctx.restore();
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();

  ctx.fillStyle = "#B77952";
  ctx.beginPath();
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x + 12, y);
  ctx.lineTo(x + 8, y + 17);
  ctx.lineTo(x - 8, y + 17);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#15803D";

  for (const [dx, dy, radius] of [
    [-7, -8, 8],
    [5, -13, 9],
    [0, -23, 8],
    [12, -5, 6],
  ]) {
    ctx.beginPath();
    ctx.ellipse(
      x + dx,
      y + dy,
      radius * 0.65,
      radius,
      -0.3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawOffice(ctx: CanvasRenderingContext2D) {
  // Main floor
  ctx.fillStyle = "#F3F0E9";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Subtle floor tiles
  ctx.strokeStyle = "#E6E0D7";
  ctx.lineWidth = 1;

  for (let x = 20; x < CANVAS_WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, CANVAS_HEIGHT - 20);
    ctx.stroke();
  }

  for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(CANVAS_WIDTH - 20, y);
    ctx.stroke();
  }

  // Outer walls
  ctx.fillStyle = "#475569";
  ctx.fillRect(0, 0, CANVAS_WIDTH, 18);
  ctx.fillRect(0, 0, 18, CANVAS_HEIGHT);
  ctx.fillRect(CANVAS_WIDTH - 18, 0, 18, CANVAS_HEIGHT);
  ctx.fillRect(0, CANVAS_HEIGHT - 18, CANVAS_WIDTH, 18);

  // Office title panel
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(32, 30, 260, 42);
  ctx.strokeStyle = "#D6D3D1";
  ctx.strokeRect(32, 30, 260, 42);

  ctx.fillStyle = "#1E293B";
  ctx.font = "bold 17px Arial";
  ctx.textAlign = "left";
  ctx.fillText("PROXISPEAK OFFICE", 45, 56);

  // Work area
  ctx.fillStyle = "#E8F1E8";
  ctx.fillRect(35, 90, 340, 345);

  ctx.fillStyle = "#477653";
  ctx.font = "bold 13px Arial";
  ctx.fillText("WORKSPACE", 48, 112);

  // Individual workstations
  drawDesk(ctx, 65, 135, "DESK 01");
  drawDesk(ctx, 225, 135, "DESK 02");
  drawDesk(ctx, 65, 235, "DESK 03");
  drawDesk(ctx, 225, 235, "DESK 04");

  // Meeting room
  ctx.fillStyle = "#E5EDF8";
  ctx.fillRect(405, 90, 355, 345);

  ctx.fillStyle = "#365A85";
  ctx.font = "bold 13px Arial";
  ctx.fillText("MEETING ROOM", 420, 112);

  // Meeting table
  ctx.fillStyle = "#CBD5E1";
  ctx.fillRect(490, 195, 180, 100);
  ctx.fillStyle = "#B4C2D2";
  ctx.fillRect(497, 202, 166, 86);
  ctx.strokeStyle = "#8DA0B5";
  ctx.lineWidth = 2;
  ctx.strokeRect(490, 195, 180, 100);

  // Meeting room chairs
  const chairs = [
    [520, 175],
    [580, 175],
    [640, 175],
    [520, 315],
    [580, 315],
    [640, 315],
  ];

  chairs.forEach(([x, y]) => {
    ctx.fillStyle = "#64748B";
    ctx.beginPath();
    ctx.roundRect(x, y, 24, 17, 5);
    ctx.fill();
  });

  // Plants and room decorations
  drawPlant(ctx, 375, 145);
  drawPlant(ctx, 720, 140);
  drawPlant(ctx, 720, 390);
  drawPlant(ctx, 55, 395);

  // Bottom status / walkway area
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(35, 465, 725, 100);
  ctx.strokeStyle = "#DDD6CE";
  ctx.strokeRect(35, 465, 725, 100);

  ctx.fillStyle = "#475569";
  ctx.font = "bold 13px Arial";
  ctx.fillText("OFFICE WALKWAY", 50, 487);

  ctx.fillStyle = "#64748B";
  ctx.font = "12px Arial";
  ctx.fillText("Move around and meet your teammates", 50, 510);

  ctx.restore();
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  position: AvatarPosition,
  isCurrentUser: boolean,
) {
  const { x, y, userId } = position;
  const style = getAvatarStyle(userId);

  ctx.save();

  // Avatar shadow
  ctx.fillStyle = "rgba(15, 23, 42, 0.15)";
  ctx.beginPath();
  ctx.ellipse(x, y + 20, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body / shirt
  ctx.fillStyle = style.shirt;
  ctx.beginPath();
  ctx.roundRect(x - 13, y + 4, 26, 20, [7, 7, 4, 4]);
  ctx.fill();

  // Neck
  ctx.fillStyle = style.skin;
  ctx.fillRect(x - 4, y + 1, 8, 8);

  // Ears
  ctx.fillStyle = style.skin;
  ctx.beginPath();
  ctx.ellipse(x - 11, y - 5, 3, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 11, y - 5, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = style.skin;
  ctx.beginPath();
  ctx.ellipse(x, y - 5, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair styles
  ctx.fillStyle = style.hair;
  ctx.beginPath();

  if (style.hairStyle === 0) {
    // Short hair
    ctx.arc(x, y - 9, 11, Math.PI, Math.PI * 2);
    ctx.lineTo(x + 10, y - 6);
    ctx.quadraticCurveTo(x, y - 15, x - 10, y - 6);
  } else if (style.hairStyle === 1) {
    // Side-swept hair
    ctx.arc(x, y - 9, 12, Math.PI, Math.PI * 2);
    ctx.lineTo(x + 10, y - 12);
    ctx.lineTo(x - 5, y - 16);
    ctx.lineTo(x - 11, y - 7);
  } else {
    // Longer hair
    ctx.ellipse(x, y - 7, 12, 15, 0, Math.PI, Math.PI * 2);
    ctx.fillRect(x - 11, y - 9, 4, 15);
    ctx.fillRect(x + 7, y - 9, 4, 15);
  }

  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#1F2937";
  ctx.beginPath();
  ctx.arc(x - 4, y - 5, 1.5, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 5, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = "#7C4030";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y - 1, 3, 0.15, Math.PI - 0.15);
  ctx.stroke();

  // Name label
  const displayName = position.displayName || userId;
  const name =
    displayName.length > 14
      ? `${displayName.slice(0, 12)}…`
      : displayName;

  ctx.font = "bold 11px Arial";
  const labelWidth = Math.max(48, ctx.measureText(name).width + 16);
  const labelY = y - 39;

  ctx.fillStyle = isCurrentUser ? "#1D4ED8" : "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(x - labelWidth / 2, labelY, labelWidth, 19, 7);
  ctx.fill();

  if (!isCurrentUser) {
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = isCurrentUser ? "#FFFFFF" : "#334155";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, x, labelY + 9.5);

  // Highlight the local user's avatar
  if (isCurrentUser) {
    ctx.strokeStyle = "#1D4ED8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 5, 16, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export const VirtualOffice = ({
  currentUserId,
}: {
  currentUserId: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [myPos, setMyPos] = useState<AvatarPosition>({
    userId: currentUserId,
    displayName: currentUserId,
    x: 400,
    y: 400,
  });

  // Keep the latest position available to Socket.IO without reconnecting.
  const myPosRef = useRef<AvatarPosition>(myPos);

  useEffect(() => {
    myPosRef.current = myPos;
  }, [myPos]);

  // Only one useRemoteAvatars call is needed.
  const {
    remoteAvatars: otherUsers,
    setRemoteAvatarList,
    removeRemoteAvatar,
    clearRemoteAvatars,
  } = useRemoteAvatars(currentUserId);


  // Connect to the Socket.IO server and manage remote users.
  useEffect(() => {
    if (!socket) {
      console.info(
        "Socket.IO is not configured. Set VITE_SOCKET_URL to enable multiplayer.",
      );
      return;
    }

    const activeSocket = socket;

    const handleConnect = () => {
      const currentPosition = myPosRef.current;

      const joinPayload: JoinPayload = {
        displayName: currentPosition.displayName,
        position: {
          x: currentPosition.x,
          y: currentPosition.y,
          z: 0,
        },
        roomId: "global-space",
      };

      activeSocket.emit("user:join", joinPayload);
    };

    const handleWorldState = (payload: {
      roomId: string;
      users: Record<
        string,
        {
          id: string;
          username: string;
          position: { x: number; y: number; z: number };
        }
      >;
    }) => {
      const avatars: AvatarPosition[] = Object.values(
        payload.users ?? {},
      ).map((user) => ({
        userId: user.id,
        displayName: user.username,
        x: user.position.x,
        y: user.position.y,
      }));
      const localUserId = activeSocket.id;

      setRemoteAvatarList(
        avatars.filter((avatar) => avatar.userId !== localUserId),
      );

      if (localUserId) {
        setMyPos((previous) => ({
          ...previous,
          userId: localUserId,
        }));
      }
    };

    const handleUserLeft = (payload: { userId: string }) => {
      removeRemoteAvatar(payload.userId);
    };

    activeSocket.on("connect", handleConnect);
    activeSocket.on("world:state", handleWorldState);
    activeSocket.on("user:left", handleUserLeft);

    activeSocket.connect();

    return () => {
      activeSocket.off("connect", handleConnect);
      activeSocket.off("world:state", handleWorldState);
      activeSocket.off("user:left", handleUserLeft);
      clearRemoteAvatars();
    };
  }, [
    currentUserId,
    setRemoteAvatarList,
    removeRemoteAvatar,
    clearRemoteAvatars,
  ]);


  // Keep the local avatar inside the canvas.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (
        [
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "w",
          "a",
          "s",
          "d",
        ].includes(key)
      ) {
        e.preventDefault();
      }

      setMyPos((prev) => {
        let { x, y } = prev;

        let nextX = x;
        let nextY = y;

        if (key === "arrowup" || key === "w") {
          nextY -= SPEED;
        }

        if (key === "arrowdown" || key === "s") {
          nextY += SPEED;
        }

        if (key === "arrowleft" || key === "a") {
          nextX -= SPEED;
        }

        if (key === "arrowright" || key === "d") {
          nextX += SPEED;
        }

        // Keep the entire avatar inside the outer walls.
        nextX = Math.max(
          AVATAR_RADIUS + 18,
          Math.min(CANVAS_WIDTH - AVATAR_RADIUS - 18, nextX),
        );

        nextY = Math.max(
          AVATAR_RADIUS + 25,
          Math.min(CANVAS_HEIGHT - AVATAR_RADIUS - 25, nextY),
        );

        // Check horizontal movement independently.
        // This allows the avatar to slide along obstacles.
        if (!isBlocked(nextX, y)) {
          x = nextX;
        }

        // Check vertical movement using the updated horizontal position.
        if (!isBlocked(x, nextY)) {
          y = nextY;
        }

        return { ...prev, x, y };
      });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Send position changes using the server's expected payload.
  useEffect(() => {
    if (!socket.connected) {
      return;
    }

    socketService.updatePosition({
      x: myPos.x,
      y: myPos.y,
      z: 0,
    });
  }, [myPos.x, myPos.y]);

  // Draw the office and all available avatars.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawOffice(ctx);

    otherUsers.forEach((position) => {
      drawAvatar(ctx, position, false);
    });

    drawAvatar(ctx, myPos, true);
  }, [myPos, otherUsers]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        padding: "24px 12px",
        boxSizing: "border-box",
        background: "linear-gradient(135deg, #0f172a, #1e293b)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h2 style={{ color: "#F8FAFC", margin: 0, fontSize: "26px" }}>
        ProxiSpeak Virtual Office
      </h2>

      <p style={{ color: "#CBD5E1", margin: 0, textAlign: "center" }}>
        Explore the office and meet your teammates.
      </p>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{
          width: "min(800px, 96vw)",
          height: "auto",
          border: "2px solid #64748B",
          borderRadius: "12px",
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.3)",
          background: "#F3F0E9",
        }}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "10px",
          color: "#F8FAFC",
          fontSize: "13px",
        }}
      >
        <span>⬆️ ⬇️ ⬅️ ➡️ Arrow keys</span>
        <span>•</span>
        <span>W A S D to move</span>
      </div>

      <p style={{ color: "#94A3B8", fontSize: "12px", margin: 0 }}>
        Your avatar: {currentUserId}
      </p>
    </div>
  );
};