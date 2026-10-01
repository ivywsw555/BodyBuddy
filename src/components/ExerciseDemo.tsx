import { useEffect, useState } from 'react';
import type { Exercise } from '../types';
import { bilibiliSearch, imageUrls, youtubeSearch } from '../data/exercises';
import { PATTERN_NAMES } from '../lib/plan';
import { useStore } from '../store';

/** 两帧示意图循环播放，模拟动作起始/结束姿势 */
export function ExerciseDemo({ ex, size = 'md' }: { ex: Exercise; size?: 'sm' | 'md' }) {
  const urls = imageUrls(ex);
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (urls.length < 2) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % urls.length), 1100);
    return () => clearInterval(t);
  }, [urls.length]);

  if (!urls.length || failed) {
    return (
      <div className={`demo demo-${size} demo-placeholder`}>
        <span className="demo-emoji">{placeholderEmoji(ex)}</span>
        <span className="demo-ph-text">{PATTERN_NAMES[ex.pattern]}</span>
      </div>
    );
  }
  return (
    <div className={`demo demo-${size}`}>
      {urls.map((u, i) => (
        <img
          key={u}
          src={u}
          alt={`${ex.name} 示意图 ${i + 1}`}
          loading="lazy"
          className={i === frame ? 'on' : ''}
          onError={() => setFailed(true)}
        />
      ))}
      <span className="demo-badge">{frame === 0 ? '起始' : '动作'}</span>
    </div>
  );
}

function placeholderEmoji(ex: Exercise): string {
  switch (ex.pattern) {
    case 'neck':
      return '🧘';
    case 'scap':
    case 'tspine':
      return '🙆';
    case 'impact':
      return '🦘';
    case 'balance':
      return '🦩';
    case 'core':
      return '🐕';
    default:
      return '🏋️';
  }
}

export function VideoLinks({ ex }: { ex: Exercise }) {
  const { state, update } = useStore();
  const custom = state.customVideos[ex.id];
  return (
    <div className="video-links">
      {custom && (
        <a className="btn btn-primary btn-sm" href={custom} target="_blank" rel="noreferrer">
          ▶ 我们的示范视频
        </a>
      )}
      <a className="btn btn-sm" href={bilibiliSearch(ex)} target="_blank" rel="noreferrer">
        B站视频
      </a>
      <a className="btn btn-sm" href={youtubeSearch(ex)} target="_blank" rel="noreferrer">
        YouTube
      </a>
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => {
          const url = prompt('粘贴你觉得最好的示范视频链接（Keep / B站 / 抖音 / YouTube 都可以），留空则删除', custom ?? '');
          if (url === null) return;
          update((s) => {
            if (url.trim()) s.customVideos[ex.id] = url.trim();
            else delete s.customVideos[ex.id];
          });
        }}
      >
        {custom ? '换视频' : '＋设置视频'}
      </button>
    </div>
  );
}

export function ExerciseDetail({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{ex.name}</h2>
            <div className="muted">{ex.en} · {PATTERN_NAMES[ex.pattern]}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <ExerciseDemo ex={ex} />
        <VideoLinks ex={ex} />
        <div className="tags">
          {ex.tags.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
          {ex.impact && <span className="tag tag-warn">冲击等级 {ex.impact}</span>}
        </div>
        <p><b>目标肌群：</b>{ex.muscles}</p>
        <h3>动作要点</h3>
        <ol className="cues">
          {ex.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <h3>常见错误</h3>
        <ul className="mistakes">
          {ex.mistakes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
