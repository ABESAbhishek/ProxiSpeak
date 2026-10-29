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
): ActiveDiscussion[] => peers
  .filter((peer) => peer.connectionState === 'connected')
  .map((peer) => ({
    id: peer.peerId,
    participantNames: [localDisplayName, peer.username],
    speaking: localIsSpeaking || Boolean(peer.isSpeaking),
    speakingName: localIsSpeaking ? localDisplayName : peer.isSpeaking ? peer.username : undefined,
  }));
