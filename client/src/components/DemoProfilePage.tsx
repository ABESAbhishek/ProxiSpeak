import React from 'react';
import { ArrowLeft, Clock3, Coffee, Headphones, MessageCircle, Sparkles } from 'lucide-react';

type Props = { onBack: () => void };

const interests = ['Design systems', 'Facilitation', 'Creative coding', 'Soundscapes'];

export const DemoProfilePage: React.FC<Props> = ({ onBack }) => (
  <section className="demo-profile mx-auto max-w-5xl space-y-6" aria-labelledby="demo-profile-title">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="demo-muted mb-2 text-xs font-bold uppercase tracking-[0.2em]">Profile preview · sample content</p>
        <h2 id="demo-profile-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">A profile that feels like you.</h2>
        <p className="demo-muted mt-2 max-w-2xl text-sm leading-6">Here’s how a teammate’s profile can introduce them before the conversation starts.</p>
      </div>
      <button type="button" className="demo-back-button" onClick={onBack}><ArrowLeft size={16} />Back to office</button>
    </header>

    <article className="demo-profile-card account-card overflow-hidden p-0">
      <div className="demo-profile-cover relative h-36 sm:h-48" aria-hidden="true">
        <div className="demo-cover-orbit demo-cover-orbit-one" />
        <div className="demo-cover-orbit demo-cover-orbit-two" />
        <span className="demo-sample-tag"><Sparkles size={13} />Demo profile</span>
      </div>

      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
          <div className="demo-avatar" aria-label="Maya Chen initials avatar">MC</div>
          <span className="demo-availability"><span />Open to a quick chat</span>
        </div>

        <div className="mt-4 grid gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.8fr)]">
          <div>
            <p className="demo-muted text-sm font-medium">@maya.chen</p>
            <h3 className="demo-profile-name mt-1 text-3xl font-semibold">Maya Chen</h3>
            <p className="demo-profile-role mt-2 text-sm font-medium">Product Designer <span>·</span> Experience Design</p>
            <p className="demo-profile-bio mt-5 max-w-2xl text-sm leading-7">I turn complex ideas into calm, clear experiences. I love making space for the small conversations that help good teams do their best work.</p>

            <div className="mt-7">
              <h4 className="demo-section-label">A few things I’m into</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {interests.map((interest) => <span className="demo-interest" key={interest}>{interest}</span>)}
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="demo-detail-card"><MessageCircle size={17} /><div><span className="demo-detail-label">Best way to reach me</span><strong>Drop by or leave a note</strong></div></div>
              <div className="demo-detail-card"><Coffee size={17} /><div><span className="demo-detail-label">Conversation starter</span><strong>What are you exploring?</strong></div></div>
            </div>
          </div>

          <aside className="demo-side-panel">
            <p className="demo-section-label">Working with me</p>
            <p className="demo-side-copy mt-2 text-sm leading-6">I’m happiest sketching together, sharing early ideas, and keeping feedback kind and specific.</p>
            <div className="demo-side-divider" />
            <div className="flex items-center gap-3"><span className="demo-meta-icon"><Headphones size={16} /></span><div><span className="demo-detail-label">Workspace</span><strong className="demo-meta-value">Design Studio</strong></div></div>
            <div className="mt-4 flex items-center gap-3"><span className="demo-meta-icon"><Clock3 size={16} /></span><div><span className="demo-detail-label">Typical focus time</span><strong className="demo-meta-value">9:30 AM – 3:00 PM</strong></div></div>
            <p className="demo-preview-note mt-6">Fictional sample content. No account or email is created.</p>
          </aside>
        </div>
      </div>
    </article>
  </section>
);
