import React, { useEffect, useMemo, useState } from 'react';
import {
  getSongParts,
  getProjects,
  createSongPart,
  updateSongPart,
  deleteSongPart,
} from '../api/notion';
import ScreenHeader from './ScreenHeader';
import './MusicScreen.css';

const SONG_PART_TYPES = [
  'Verse',
  'Chorus',
  'Bridge',
  'Hook',
  'Vocals',
  'Instrumental',
  'Riff',
  'Full Song',
];

function MusicScreen() {
  const [songParts, setSongParts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [state, setState] = useState('loading');
  const [typeFilter, setTypeFilter] = useState('all');
  const [hideUsed, setHideUsed] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState('Verse');
  const [draftLink, setDraftLink] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([getSongParts({ signal }), getProjects(undefined, { signal })])
      .then(([partList, projectList]) => {
        setSongParts(partList);
        setProjects(projectList);
        setState('ready');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load song parts', err);
        setState('error');
      });
    return () => controller.abort();
  }, []);

  const visibleParts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return songParts.filter((p) => {
      if (typeFilter !== 'all' && p.songPart !== typeFilter) return false;
      if (hideUsed && p.used) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [songParts, typeFilter, hideUsed, search]);

  const submitNewPart = async () => {
    const name = draftName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await createSongPart({ name, songPart: draftType, link: draftLink.trim() });
      setSongParts((prev) => [created, ...prev]);
      setDraftName('');
      setDraftLink('');
    } catch (err) {
      console.error('Failed to create song part', err);
    } finally {
      setCreating(false);
    }
  };

  const patchPart = async (id, fields) => {
    const prevPart = songParts.find((p) => p.id === id);
    setSongParts((prev) => prev.map((p) => (p.id === id ? { ...p, ...fields } : p)));
    try {
      const updated = await updateSongPart({ id, ...fields });
      setSongParts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      console.error('Failed to update song part', err);
      if (prevPart) setSongParts((prev) => prev.map((p) => (p.id === id ? prevPart : p)));
    }
  };

  const removePart = async (id) => {
    if (!window.confirm('Delete this song part? This can\'t be undone from here.')) return;
    setSongParts((prev) => prev.filter((p) => p.id !== id));
    setExpandedId(null);
    try {
      await deleteSongPart(id);
    } catch (err) {
      console.error('Failed to delete song part', err);
    }
  };

  return (
    <div className="music-screen">
      <ScreenHeader
        eyebrow="🎵 Music"
        title="Piece together your songs"
        subtitle={`${songParts.length || '···'} recordings`}
      />

      <div className="area-filter">
        <div className="area-filter-inner">
          <button
            type="button"
            className={typeFilter === 'all' ? 'area-chip area-chip--active' : 'area-chip'}
            onClick={() => setTypeFilter('all')}
          >
            All
          </button>
          {SONG_PART_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={typeFilter === t ? 'area-chip area-chip--active' : 'area-chip'}
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="music-body">
        <div className="music-controls-row">
          <input
            type="text"
            className="music-search-input"
            placeholder="Search recordings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className={hideUsed ? 'music-hide-used music-hide-used--active' : 'music-hide-used'}
            onClick={() => setHideUsed((prev) => !prev)}
          >
            {hideUsed ? 'Showing unused' : 'Hide used'}
          </button>
        </div>

        <div className="music-add-row">
          <input
            type="text"
            className="add-task-input"
            placeholder="Name this recording…"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <select
            className="music-add-type"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value)}
          >
            {SONG_PART_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="add-task-button"
            disabled={!draftName.trim() || creating}
            onClick={submitNewPart}
          >
            {creating ? 'Adding…' : 'Add'}
          </button>
        </div>
        <input
          type="text"
          className="add-task-input music-add-link"
          placeholder="BandLab share link (tap Share on the track to copy it)…"
          value={draftLink}
          onChange={(e) => setDraftLink(e.target.value)}
        />

        {state === 'loading' && <p className="section-status">Loading your recordings…</p>}
        {state === 'error' && (
          <p className="section-status section-status--error">
            Couldn't load song parts from Notion.
          </p>
        )}
        {state === 'ready' && visibleParts.length === 0 && (
          <p className="section-status">Nothing matches — try a different filter or search.</p>
        )}

        {state === 'ready' && visibleParts.length > 0 && (
          <ul className="music-list">
            {visibleParts.map((part) => {
              const isExpanded = expandedId === part.id;
              return (
                <li key={part.id} className="music-item">
                  <button
                    type="button"
                    className="music-item-header"
                    onClick={() => setExpandedId(isExpanded ? null : part.id)}
                  >
                    <span className="music-item-text">
                      <span className={part.used ? 'music-item-name music-item-name--used' : 'music-item-name'}>
                        {part.name}
                      </span>
                      <span className="music-item-tags">
                        {part.songPart && <span className="music-tag">{part.songPart}</span>}
                        {part.projectName && (
                          <span className="music-tag music-tag--project">
                            {part.projectIcon ? `${part.projectIcon} ` : ''}
                            {part.projectName}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={isExpanded ? 'subsection-chevron subsection-chevron--open' : 'subsection-chevron'} aria-hidden="true">
                      ›
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="music-item-detail">
                      {/* No inline <iframe> player — confirmed BandLab blocks
                          framing on regular track/revision share links (only
                          Collections get a real embed code, which isn't what
                          individual recordings use). The link is the reliable
                          way to actually listen. */}
                      {part.link ? (
                        <a
                          className="music-open-link music-open-link--button"
                          href={part.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ▶ Open in BandLab
                        </a>
                      ) : (
                        <p className="section-status">No BandLab link saved yet.</p>
                      )}

                      <label className="task-detail-field">
                        <span>BandLab link</span>
                        <input
                          type="text"
                          defaultValue={part.link || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (part.link || '')) {
                              patchPart(part.id, { link: e.target.value.trim() });
                            }
                          }}
                        />
                      </label>

                      <div className="task-detail-row">
                        <label className="task-detail-field">
                          <span>Song part</span>
                          <select
                            value={part.songPart || ''}
                            onChange={(e) => patchPart(part.id, { songPart: e.target.value })}
                          >
                            {SONG_PART_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="task-detail-field">
                          <span>Song project</span>
                          <select
                            value={part.projectId || ''}
                            onChange={(e) => patchPart(part.id, { projectId: e.target.value })}
                          >
                            <option value="">Not assigned</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.icon ? `${p.icon} ` : ''}
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="music-item-actions">
                        <label className="music-used-toggle">
                          <input
                            type="checkbox"
                            checked={part.used}
                            onChange={(e) => patchPart(part.id, { used: e.target.checked })}
                          />
                          Used in a song
                        </label>
                        <button
                          type="button"
                          className="task-detail-delete"
                          onClick={() => removePart(part.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default MusicScreen;
