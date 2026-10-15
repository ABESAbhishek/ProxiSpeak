
import { useCallback, useState } from "react";
import type { AvatarPosition } from "../types/office";

export function useRemoteAvatars(currentUserId: string) {
  const [remoteAvatars, setRemoteAvatars] = useState<
    Map<string, AvatarPosition>
  >(() => new Map());

  // Add a new remote avatar or update its position.
  const updateRemoteAvatar = useCallback(
    (avatar: AvatarPosition) => {
      if (!avatar.userId || avatar.userId === currentUserId) {
        return;
      }

      setRemoteAvatars((previous) => {
        const next = new Map(previous);
        next.set(avatar.userId, avatar);
        return next;
      });
    },
    [currentUserId]
  );

  // Remove an avatar when its user leaves.
  const removeRemoteAvatar = useCallback((userId: string) => {
    setRemoteAvatars((previous) => {
      if (!previous.has(userId)) {
        return previous;
      }

      const next = new Map(previous);
      next.delete(userId);
      return next;
    });
  }, []);

  // Replace all remote avatars with the latest user list.
  const setRemoteAvatarList = useCallback(
    (avatars: AvatarPosition[]) => {
      const next = new Map<string, AvatarPosition>();

      for (const avatar of avatars) {
        if (avatar.userId && avatar.userId !== currentUserId) {
          next.set(avatar.userId, avatar);
        }
      }

      setRemoteAvatars(next);
    },
    [currentUserId]
  );

  // Clear remote avatars when needed.
  const clearRemoteAvatars = useCallback(() => {
    setRemoteAvatars(new Map());
  }, []);

  return {
    remoteAvatars,
    updateRemoteAvatar,
    removeRemoteAvatar,
    setRemoteAvatarList,
    clearRemoteAvatars,
  };
}
