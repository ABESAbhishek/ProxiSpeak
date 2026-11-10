import { serverUrl } from './serverUrl';

export type OfficeFurniture = { id: string; type: 'desk' | 'sofa' | 'plant' | 'table'; label?: string; x: number; y: number; width: number; depth: number; rotation: number };
export type OfficeObstacle = { id: string; x: number; y: number; width: number; height: number; blocksSound: boolean; soundDamping: number };
export type OfficeLayout = { roomId: string; revision: number; furniture: OfficeFurniture[]; obstacles: OfficeObstacle[] };

export async function loadWorkspaceLayout(roomId: string): Promise<OfficeLayout | null> {
  const response = await fetch(`${serverUrl}/api/workspaces/${encodeURIComponent(roomId)}`, { credentials: 'include' });
  const data = await response.json().catch(() => ({})) as { layout?: OfficeLayout | null; error?: string };
  if (!response.ok) throw new Error(data.error || 'Workspace layout could not be loaded.');
  return data.layout ?? null;
}
