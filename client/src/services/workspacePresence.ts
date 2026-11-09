import type { RemotePeerAudio } from '../types';

export type WorkspaceMember = {
  id: string;
  name: string;
  avatarUrl?: string;
  isYou: boolean;
  speaking: boolean;
  nearby: boolean;
  activity: string;
};

export type ActiveDiscussion = {
  id: string;
  roomId: string;
  participantNames: string[];
  speaking: boolean;
  speakingName?: string;
};

export const sortWorkspaceMembers = (members: WorkspaceMember[]) => [...members].sort((a, b) =>
  Number(b.isYou) - Number(a.isYou)
  || Number(b.speaking) - Number(a.speaking)
  || a.name.localeCompare(b.name)
  || a.id.localeCompare(b.id),
);


export const deriveActiveDiscussions = (
  peers: RemotePeerAudio[],
  localDisplayName: string,
  localIsSpeaking: boolean,
  localRoomId: string,
): ActiveDiscussion[] => {
  const connectedPeers = peers.filter(
    (peer) =>
      peer.connectionState === 'connected' &&
      peer.roomId === localRoomId,
  );

  if (connectedPeers.length === 0) return [];

  const speakingPeer = connectedPeers.find(
    (peer) => peer.isSpeaking,
  );

  return [{
    id: `discussion-${localRoomId}`,
    roomId: localRoomId,
    participantNames: [
      ...new Set([
        localDisplayName,
        ...connectedPeers.map((peer) => peer.username),
      ]),
    ],
    speaking: localIsSpeaking || Boolean(speakingPeer),
    speakingName: localIsSpeaking
      ? localDisplayName
      : speakingPeer?.username,
  }];
};