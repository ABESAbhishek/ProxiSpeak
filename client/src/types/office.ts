
export interface AvatarPosition {
  userId: string;
  displayName: string;
  x: number;
  y: number;
}

export interface JoinPayload {
  displayName: string;
  x: number;
  y: number;
}

export interface PositionUpdatePayload {
  x: number;
  y: number;
}
