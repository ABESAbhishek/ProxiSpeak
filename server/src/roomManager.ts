export interface UserData {
  id: string;
  accountId: string;
  username: string;
  avatarUrl?: string;
  position: { x: number; y: number; z: number };
  roomId: string;
  isMuted?: boolean;
  isSpeaking?: boolean;
  joinedAt: number;
  activitySummary: string;
  lastActivityAt: number;
}

export class RoomManager {
  private users = new Map<string, UserData>();
  private rooms = new Map<string, Set<string>>();
  private recentUsers: UserData[] = [];
  public readonly DEFAULT_ROOM = 'global-space';

  addUser(socketId: string, accountId: string, username: string, position: UserData['position'], roomId: string, avatarUrl = ''): UserData {
    const previous = this.users.get(socketId);
    if (previous && previous.roomId !== roomId) this.removeFromRoom(socketId, previous.roomId);
    const now = Date.now();
    const changedRoom = previous?.roomId !== roomId;
    const user: UserData = previous
      ? { ...previous, accountId, username, avatarUrl, position, roomId, activitySummary: changedRoom ? `Joined ${roomId}.` : previous.activitySummary, lastActivityAt: changedRoom ? now : previous.lastActivityAt }
      : { id: socketId, accountId, username, avatarUrl, position, roomId, isMuted: false, isSpeaking: false, joinedAt: now, activitySummary: `Joined ${roomId}.`, lastActivityAt: now };
    this.users.set(socketId, user);
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(socketId);
    return user;
  }

  updatePosition(socketId: string, position: UserData['position']): UserData | null {
    const user = this.users.get(socketId);
    if (!user) return null;
    user.position = { x: Math.round(position.x * 100) / 100, y: Math.round(position.y * 100) / 100, z: Math.round(position.z * 100) / 100 };
    user.activitySummary = 'Moved around the virtual office.';
    user.lastActivityAt = Date.now();
    return user;
  }

  updateProfile(socketId: string, updates: { isMuted?: boolean; isSpeaking?: boolean; username?: string; avatarUrl?: string }): UserData | null {
    const user = this.users.get(socketId);
    if (!user) return null;
    let changed = false;
    if (typeof updates.isMuted === 'boolean' && updates.isMuted !== user.isMuted) { user.isMuted = updates.isMuted; changed = true; }
    if (typeof updates.isSpeaking === 'boolean' && updates.isSpeaking !== user.isSpeaking) { user.isSpeaking = updates.isSpeaking; changed = true; }
    if (typeof updates.username === 'string') user.username = updates.username;
    if (typeof updates.avatarUrl === 'string') user.avatarUrl = updates.avatarUrl;
    if (changed) {
      user.activitySummary = user.isMuted ? 'Used the workspace with the microphone muted.' : user.isSpeaking ? 'Used voice chat; speaking activity was detected.' : 'Used the workspace with the microphone on.';
      user.lastActivityAt = Date.now();
    }
    return user;
  }

  getUser(socketId: string) { return this.users.get(socketId); }
  removeUser(socketId: string): UserData | null {
    const user = this.users.get(socketId);
    if (!user) return null;
    user.activitySummary = `Left ${user.roomId}.`;
    user.lastActivityAt = Date.now();
    this.recentUsers = [ { ...user, position: { ...user.position } }, ...this.recentUsers.filter((entry) => entry.id !== socketId) ].slice(0, 50);
    this.removeFromRoom(socketId, user.roomId);
    this.users.delete(socketId);
    return user;
  }
  private removeFromRoom(socketId: string, roomId: string) {
    const room = this.rooms.get(roomId);
    room?.delete(socketId);
    if (room?.size === 0) this.rooms.delete(roomId);
  }
  getUsersInRoom(roomId = this.DEFAULT_ROOM): Record<string, UserData> {
    const result: Record<string, UserData> = {};
    this.rooms.get(roomId)?.forEach((id) => { const user = this.users.get(id); if (user) result[id] = { ...user, position: { ...user.position } }; });
    return result;
  }
  getRoomSummaries() { return Array.from(this.rooms, ([id, users]) => ({ id, userCount: users.size })); }
  getTotalUsersCount() { return this.users.size; }
  getAllUsers() { return Array.from(this.users.values()); }
  getRecentUsers(limit = 25) { return this.recentUsers.slice(0, limit); }
}

export const roomManager = new RoomManager();
