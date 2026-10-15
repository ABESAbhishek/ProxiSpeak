export interface UserData {
  id: string;
  username: string;
  position: { x: number; y: number; z: number };
  roomId: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  joinedAt: number;
}

export class RoomManager {
  private users: Map<string, UserData> = new Map();
  private rooms: Map<string, Set<string>> = new Map(); // roomId -> Set of socket IDs

  public readonly DEFAULT_ROOM = 'global-space';

  /**
   * Adds or registers a user in a specific room (defaults to 'global-space').
   */
  public addUser(
    socketId: string,
    username?: string,
    position?: { x: number; y: number; z: number },
    roomId?: string
  ): UserData {
    const targetRoom = roomId || this.DEFAULT_ROOM;
    const sanitizedUsername = (username || `User_${socketId.substring(0, 4)}`).trim().substring(0, 32);

    const user: UserData = {
      id: socketId,
      username: sanitizedUsername,
      position: position && typeof position.x === 'number' ? position : { x: 0, y: 0, z: 0 },
      roomId: targetRoom,
      isMuted: false,
      isSpeaking: false,
      joinedAt: Date.now()
    };

    // If user was already in another room, remove them first
    const existing = this.users.get(socketId);
    if (existing && existing.roomId !== targetRoom) {
      this.removeFromRoom(socketId, existing.roomId);
    }

    this.users.set(socketId, user);

    if (!this.rooms.has(targetRoom)) {
      this.rooms.set(targetRoom, new Set());
    }
    this.rooms.get(targetRoom)!.add(socketId);

    return user;
  }

  /**
   * Updates a user's 3D coordinates.
   */
  public updatePosition(
    socketId: string,
    position: { x: number; y: number; z: number }
  ): UserData | null {
    const user = this.users.get(socketId);
    if (!user) return null;

    if (
      typeof position.x === 'number' &&
      typeof position.y === 'number' &&
      typeof position.z === 'number'
    ) {
      user.position = {
        x: Math.round(position.x * 100) / 100,
        y: Math.round(position.y * 100) / 100,
        z: Math.round(position.z * 100) / 100
      };
      return user;
    }
    return null;
  }

  /**
   * Updates user profile fields (e.g., mute status).
   */
  public updateProfile(
    socketId: string,
    updates: { isMuted?: boolean; isSpeaking?: boolean; username?: string }
  ): UserData | null {
    const user = this.users.get(socketId);
    if (!user) return null;

    if (typeof updates.isMuted === 'boolean') user.isMuted = updates.isMuted;
    if (typeof updates.isSpeaking === 'boolean') user.isSpeaking = updates.isSpeaking;
    if (updates.username) user.username = updates.username.trim().substring(0, 32);

    return user;
  }

  /**
   * Retrieves a user by socket ID.
   */
  public getUser(socketId: string): UserData | undefined {
    return this.users.get(socketId);
  }

  /**
   * Removes a user upon disconnect.
   */
  public removeUser(socketId: string): UserData | null {
    const user = this.users.get(socketId);
    if (!user) return null;

    this.removeFromRoom(socketId, user.roomId);
    this.users.delete(socketId);
    return user;
  }

  private removeFromRoom(socketId: string, roomId: string): void {
    const roomSet = this.rooms.get(roomId);
    if (roomSet) {
      roomSet.delete(socketId);
      if (roomSet.size === 0 && roomId !== this.DEFAULT_ROOM) {
        this.rooms.delete(roomId);
      }
    }
  }

  /**
   * Returns a snapshot of all users in a given room.
   */
  public getUsersInRoom(roomId: string = this.DEFAULT_ROOM): Record<string, UserData> {
    const result: Record<string, UserData> = {};
    const roomSet = this.rooms.get(roomId);
    if (!roomSet) return result;

    roomSet.forEach((id) => {
      const u = this.users.get(id);
      if (u) result[id] = u;
    });

    return result;
  }

  /**
   * Returns summary of all active rooms.
   */
  public getRoomSummaries(): Array<{ id: string; userCount: number }> {
    const summaries: Array<{ id: string; userCount: number }> = [];
    this.rooms.forEach((set, id) => {
      summaries.push({ id, userCount: set.size });
    });
    return summaries;
  }

  public getTotalUsersCount(): number {
    return this.users.size;
  }

  public getAllUsers(): UserData[] {
    return Array.from(this.users.values());
  }
}

export const roomManager = new RoomManager();
