import React, { useMemo, useState } from 'react';
import { Activity, Headphones, Mic, Search, Users, Wifi } from 'lucide-react';
import { sortWorkspaceMembers } from '../services/workspacePresence';
import type { ActiveDiscussion, WorkspaceMember } from '../services/workspacePresence';

type WorkspaceSidebarProps = {
  members: WorkspaceMember[];
  discussions: ActiveDiscussion[];
  selectedMemberId: string | null;
  selectedDiscussionId: string | null;
  onSelectMember: (memberId: string) => void;
  onSelectDiscussion: (discussionId: string, memberId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  members, discussions, selectedMemberId, selectedDiscussionId,
  onSelectMember, onSelectDiscussion, collapsed, onToggleCollapsed,
}) => {
  const [search, setSearch] = useState('');
  const orderedMembers = useMemo(() => sortWorkspaceMembers(members), [members]);
  const duplicateNames = useMemo(() => members.reduce<Map<string, number>>((counts, member) => {
    const key = member.name.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map()), [members]);
  const filteredMembers = orderedMembers.filter((member) => member.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return (
    <aside className={`workspace-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Workspace members and discussions">
      {collapsed ? (
        <button type="button" className="workspace-sidebar-rail" onClick={onToggleCollapsed} aria-label="Expand workspace panel" title="Expand workspace panel">
          <Users size={19} /><span>{members.length}</span>
        </button>
      ) : (
        <>
          <header className="workspace-sidebar-header">
            <div>
              <p className="workspace-sidebar-eyebrow">Workspace</p>
              <h2>Team presence</h2>
              <p className="workspace-online-count"><span className="live-dot" />{members.length} {members.length === 1 ? 'member' : 'members'} online</p>
            </div>
            <button type="button" className="workspace-icon-button collapse-sidebar" onClick={onToggleCollapsed} aria-label="Collapse workspace panel" title="Collapse panel">
              <span aria-hidden="true">›</span>
            </button>
          </header>

          <label className="workspace-search">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Search members</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" />
          </label>

          <section className="workspace-panel-section" aria-labelledby="workspace-members-title">
            <div className="workspace-section-heading">
              <h3 id="workspace-members-title">Members</h3><span>{members.length}</span>
            </div>
            {filteredMembers.length ? (
              <ul className="workspace-member-list">
                {filteredMembers.map((member) => (
                  <li key={member.id}>
                    <button type="button" className={`workspace-member-row ${selectedMemberId === member.id ? 'is-selected' : ''}`} aria-label={`${member.name}${member.isYou ? ', you' : ''}${(duplicateNames.get(member.name.trim().toLocaleLowerCase()) ?? 0) > 1 ? `, participant ${member.id.slice(-6)}` : ''}, ${member.speaking ? 'speaking' : member.activity}`} aria-pressed={selectedMemberId === member.id} onClick={() => onSelectMember(member.id)}>
                      <span className={`member-avatar ${member.speaking ? 'is-speaking' : ''}`} aria-hidden="true">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.name.slice(0, 2).toUpperCase()}</span>
                      <span className="member-copy">
                        <span className="member-name">{member.name}{member.isYou && <span className="you-chip">You</span>}{(duplicateNames.get(member.name.trim().toLocaleLowerCase()) ?? 0) > 1 && <span className="member-id" title={`Participant ID ${member.id}`}>·{member.id.slice(-5)}</span>}</span>
                        <span className="member-activity">{member.speaking ? <><Activity size={12} /> Speaking</> : member.nearby ? <><Wifi size={12} /> Nearby · {member.activity}</> : <><Mic size={12} /> {member.activity}</>}</span>
                      </span>
                      <span className={`member-presence ${member.speaking ? 'is-speaking' : ''}`} aria-label={member.speaking ? 'Speaking' : 'Online'} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="workspace-empty-note">{members.length ? 'No members match that search.' : 'No members are online yet.'}</p>}
          </section>

          <section className="workspace-panel-section discussions-section" aria-labelledby="workspace-discussions-title">
            <div className="workspace-section-heading">
              <h3 id="workspace-discussions-title">Active discussions</h3><span>{discussions.length}</span>
            </div>
            {discussions.length ? (
              <ul className="workspace-discussion-list">
                {discussions.map((discussion) => (
                  <li key={discussion.id}>
                    <button type="button" className={`workspace-discussion-card ${selectedDiscussionId === discussion.id ? 'is-selected' : ''}`} aria-pressed={selectedDiscussionId === discussion.id} onClick={() => onSelectDiscussion(discussion.id, discussion.id)}>
                      <span className="discussion-icon"><Headphones size={16} /></span>
                      <span className="discussion-copy">
                        <span className="discussion-title">Audio connection</span>
                        <span className="discussion-participants">{discussion.participantNames.join(' · ')}</span>
                        <span className="discussion-status">{discussion.speaking ? `${discussion.speakingName ?? 'A member'} speaking` : 'Audio connected'}</span>
                      </span>
                      {discussion.speaking && <span className="member-presence is-speaking" aria-label="A participant is speaking" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="workspace-empty-note discussion-empty">
                <Headphones size={18} />
                <p>No active discussions yet</p>
                <span>Connect to a teammate through spatial audio to see active audio links here.</span>
              </div>
            )}
          </section>
        </>
      )}
    </aside>
  );
};
