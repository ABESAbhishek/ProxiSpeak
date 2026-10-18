
export interface AvatarPosition {
  userId: string;
  displayName: string;
  x: number;
  y: number;
}

export interface JoinPayload {
  displayName: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  roomId: string;
}

export interface PositionUpdatePayload {
  x: number;
  y: number;
}

export interface ServerUser {
  id: string;
  username: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  roomId: string;
  avatarUrl?: string;
}

export interface WorldStatePayload {
  roomId: string;
  users: Record<string, ServerUser>;
}

export interface RemotePositionUpdatePayload {
  userId: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  roomId: string;
}
